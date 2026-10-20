import {readJson} from '@/lib/http';
import {ApiError,checkOrigin,identity,failure} from '@/lib/server/auth';
import {audit} from '@/lib/server/integrations';
import { NextResponse } from "next/server";
import OpenAI from "openai";

/* 고객 PO ↔ 발행 견적 대조 — 라인아이템·수량·단가·총액·조건의 불일치를 찾는다.
   결과는 화면 모달로 보여주고, 불일치가 있으면 고객 확인 메일 초안으로 이어진다. */

const MODEL = (process.env.OPENAI_MODEL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY ?? "").replace(/['"\s]/g, "");

const SYSTEM = `You compare a customer's PURCHASE ORDER against the the workspace organisation QUOTATION it should be based on.
Report every substantive discrepancy · quantity, unit price, amount, missing/extra line items, currency, payment terms, incoterms, validity. Ignore cosmetic wording differences.
- match: true only when the PO faithfully mirrors the quotation commercially.
- discrepancies: one entry per issue · field (short label like "Qty · item 1", "Unit price · item 1", "Payment terms"), quotation value, po value, severity "major" (money/quantity/terms differ) or "minor" (labels, rounding).
- emailDraft: a short, polite English email body (no greeting name, no signature) asking the customer to confirm the listed discrepancies. Empty string when match is true.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    match: { type: "boolean" },
    summary: { type: "string" },
    discrepancies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string" },
          quotation: { type: "string" },
          po: { type: "string" },
          severity: { type: "string", enum: ["major", "minor"] },
        },
        required: ["field", "quotation", "po", "severity"],
      },
    },
    emailDraft: { type: "string" },
  },
  required: ["match", "summary", "discrepancies", "emailDraft"],
} as const;

async function handlePost(request: Request) {
  if (!OPENAI_KEY || !MODEL) return NextResponse.json({ error: "Configure server secrets OPENAI_API_KEY and OPENAI_MODEL to enable AI." }, { status: 503 });

  let body: { quotation?: unknown; po?: unknown };
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.quotation || !body.po) return NextResponse.json({ error: "quotation and po required" }, { status: 400 });

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `QUOTATION (the workspace organisation issued):\n${JSON.stringify(body.quotation, null, 2)}\n\nCUSTOMER PO:\n${JSON.stringify(body.po, null, 2)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "po_compare", strict: true, schema: SCHEMA },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty completion");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    console.error("po compare failed:", err);
    const detail = (err instanceof OpenAI.APIError ? `openai_${err.status}_${err.code ?? ""}` : String((err as Error)?.message ?? ""))
      .replace(/sk-[A-Za-z0-9_-]{4,}/g, "sk-***")
      .slice(0, 120);
    return NextResponse.json({ error: "compare_failed", detail }, { status: 502 });
  }
}

export async function POST(request:Request){try{checkOrigin(request);const user=await identity();if(Number(request.headers.get('content-length')||0)>22*1024*1024)throw new ApiError('Request exceeds 22 MB.',413);const response=await handlePost(request);await audit(user.userId,'AI/po-compare',response.ok?'completed':'failed',response.ok?'Provider returned a draft for review.':'AI request unavailable or failed.');return response;}catch(error){return failure(error);}}
