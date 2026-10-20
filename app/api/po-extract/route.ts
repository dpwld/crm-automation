import {readJson} from '@/lib/http';
import {ApiError,checkOrigin,identity,failure} from '@/lib/server/auth';
import {audit} from '@/lib/server/integrations';
import { NextResponse } from "next/server";
import OpenAI from "openai";

/* 고객 PO(구매주문서) 접수용 AI 추출 — 고객이 보내온 PO PDF/이미지에서
   문서번호·라인아이템·조건을 뽑는다 (spec-extract와 동일한 패턴).
   기록용 문서라 (draft)가 아니라 고객사 문서번호 그대로 저장된다. */

const MODEL = (process.env.OPENAI_MODEL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY ?? "").replace(/['"\s]/g, "");

const SYSTEM = `You read a customer PURCHASE ORDER sent TO the workspace organisation. Extract faithfully; never invent values.
- poNumber: the customer's own PO/document number exactly as printed (e.g. "4500123456", "PO-2026-0091"). Empty if none found.
- poDate: issue date as yyyy-mm-dd if determinable, else "".
- currency: 3-letter code (USD/KRW/EUR…), default "USD" only if amounts clearly use $.
- lineItems: every ordered line · name (description + any part/model number on the line), qty (number), unit (pcs/set/EA…), unitPrice (number, 0 if not shown), amount (number, qty*unitPrice or the printed amount).
- paymentTerms / incoterms / shipTo: as written, "" when absent.
- quotationRef: any the workspace organisation quotation number the PO references (e.g. "DOC-Q-2026-001"), "" if none.
- notes: up to 3 short English bullets for the reviewer (ambiguities, extra clauses, mismatched totals).`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    poNumber: { type: "string" },
    poDate: { type: "string" },
    currency: { type: "string" },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unit: { type: "string" },
          unitPrice: { type: "number" },
          amount: { type: "number" },
        },
        required: ["name", "qty", "unit", "unitPrice", "amount"],
      },
    },
    paymentTerms: { type: "string" },
    incoterms: { type: "string" },
    shipTo: { type: "string" },
    quotationRef: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["poNumber", "poDate", "currency", "lineItems", "paymentTerms", "incoterms", "shipTo", "quotationRef", "notes"],
} as const;

async function handlePost(request: Request) {
  if (!OPENAI_KEY || !MODEL) return NextResponse.json({ error: "Configure server secrets OPENAI_API_KEY and OPENAI_MODEL to enable AI." }, { status: 503 });

  let body: { fileName?: string; fileType?: string; dataBase64?: string };
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { fileName = "po", fileType = "", dataBase64 = "" } = body;
  if (!dataBase64) return NextResponse.json({ error: "file required" }, { status: 400 });

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: `DOCUMENT: ${fileName}` },
  ];
  if (fileType.startsWith("image/")) {
    content.push({ type: "image_url", image_url: { url: `data:${fileType};base64,${dataBase64}` } });
  } else {
    content.push({
      type: "file",
      file: { filename: fileName, file_data: `data:application/pdf;base64,${dataBase64}` },
    } as OpenAI.Chat.Completions.ChatCompletionContentPart);
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "po_extract", strict: true, schema: SCHEMA },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty completion");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    console.error("po extract failed:", err);
    const detail = (err instanceof OpenAI.APIError ? `openai_${err.status}_${err.code ?? ""}` : String((err as Error)?.message ?? ""))
      .replace(/sk-[A-Za-z0-9_-]{4,}/g, "sk-***")
      .slice(0, 120);
    return NextResponse.json({ error: "extract_failed", detail }, { status: 502 });
  }
}

export async function POST(request:Request){try{checkOrigin(request);const user=await identity();if(Number(request.headers.get('content-length')||0)>22*1024*1024)throw new ApiError('Request exceeds 22 MB.',413);const response=await handlePost(request);await audit(user.userId,'AI/po-extract',response.ok?'completed':'failed',response.ok?'Provider returned a draft for review.':'AI request unavailable or failed.');return response;}catch(error){return failure(error);}}
