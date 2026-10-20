import {readJson} from '@/lib/http';
import {ApiError,checkOrigin,identity,failure} from '@/lib/server/auth';
import {audit} from '@/lib/server/integrations';
import { NextResponse } from "next/server";
import OpenAI from "openai";

/* CRM 문서 AI 임포트 — 견적서/PO/인보이스 PDF·이미지에서 라인아이템과 조건을
   뽑아 문서 draft 폼을 채운다 (po-extract·procurement intake와 동일 패턴).
   adjustText+current가 오면 추출 대신 현재 draft에 지시만 적용해 전체를 반환한다.
   여기서는 아무것도 저장하지 않는다 — 리뷰 모달에서 사람이 Apply해야 draft가 된다. */

const MODEL = (process.env.OPENAI_MODEL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY ?? "").replace(/['"\s]/g, "");

const DOC_NOUN: Record<string, string> = {
  quotation: "QUOTATION",
  purchase_order: "PURCHASE ORDER",
  invoice: "INVOICE",
};

function systemFor(docType: string): string {
  return `You read a ${DOC_NOUN[docType]} document (PDF or image) being registered into the CRM of the workspace organisation. Extract faithfully into a document draft; never invent values.
- lineItems: every priced line · name (description plus any part/model number on the line), qty (number), unit (pcs/set/EA…, default "pcs"), unitPrice (number, 0 if not shown), amount (number, qty*unitPrice or the printed amount). Represent a fixed-amount discount as its own line with a negative unitPrice.
- currency: 3-letter code (USD/KRW/EUR…), default "USD" only if amounts clearly use $.
- validUntil: validity/expiry date as yyyy-mm-dd if determinable; relative validity (e.g. "valid 30 days") is converted from the document date when both are present; "" otherwise.
- incoterms: e.g. EXW/DAP/FOB as written, "" when absent.
- paymentTerms: as written (e.g. "100% before shipment"), "" when absent.
- discountPct: a percentage discount applied to the subtotal (number, 0 if none). Fixed-amount discounts stay as negative line items with 0 here.
- taxRate: sales tax / VAT percentage applied (number, 0 when none or stated as excluded).
- terms: a short summary of the document's terms & conditions as a few newline-separated lines ("" when absent).
- notes: up to 3 short English bullets for the human reviewer (ambiguities, mismatched totals, clauses needing attention).
Return every monetary value as a plain number (no currency symbols or commas).`;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
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
    currency: { type: "string" },
    validUntil: { type: "string" },
    incoterms: { type: "string" },
    paymentTerms: { type: "string" },
    discountPct: { type: "number" },
    taxRate: { type: "number" },
    terms: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["lineItems", "currency", "validUntil", "incoterms", "paymentTerms", "discountPct", "taxRate", "terms", "notes"],
} as const;

async function handlePost(request: Request) {
  if (!OPENAI_KEY || !MODEL) return NextResponse.json({ error: "Configure server secrets OPENAI_API_KEY and OPENAI_MODEL to enable AI." }, { status: 503 });

  let body: {
    fileName?: string; fileType?: string; dataBase64?: string; docType?: string;
    /** 재조정: 사용자의 자유 지시 + 직전 추출 결과 — 지시만 반영하고 나머지는 유지. */
    adjustText?: string; current?: unknown;
  };
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { fileName = "document", fileType = "", dataBase64 = "", docType = "" } = body;
  if (!DOC_NOUN[docType]) return NextResponse.json({ error: "invalid docType" }, { status: 400 });
  const adjust = (body.adjustText ?? "").trim();
  // 파일 없이도 지시+현재 초안만으로 재조정 가능
  if (!dataBase64 && !(adjust && body.current)) return NextResponse.json({ error: "file required" }, { status: 400 });

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text:
        (dataBase64 ? `DOCUMENT (${DOC_NOUN[docType].toLowerCase()}): ${fileName}` : "") +
        (adjust && body.current
          ? `\n\nCURRENT DRAFT (previously extracted):\n${JSON.stringify(body.current)}` +
            `\n\nUSER INSTRUCTION (may be Korean): ${adjust}` +
            `\n\nApply ONLY this instruction to the current draft · do not make unrelated changes. ` +
            `If line items are removed, drop them (do not zero them). Recompute each affected line's amount (qty*unitPrice). ` +
            `Then check the remaining fields (terms, notes) for text referencing what was changed or removed and keep them consistent. ` +
            `Record the instructed change and every follow-on edit in notes.` +
            (dataBase64 ? `` : ` There is no attached document · work from the current draft only.`)
          : ""),
    },
  ];
  if (!dataBase64) {
    // 파일 없는 재조정 — 텍스트만 보낸다
  } else if (fileType.startsWith("image/")) {
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
        { role: "system", content: systemFor(docType) },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "doc_intake", strict: true, schema: SCHEMA },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty completion");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    console.error("doc intake failed:", err);
    const detail = (err instanceof OpenAI.APIError ? `openai_${err.status}_${err.code ?? ""}` : String((err as Error)?.message ?? ""))
      .replace(/sk-[A-Za-z0-9_-]{4,}/g, "sk-***")
      .slice(0, 120);
    return NextResponse.json({ error: "extract_failed", detail }, { status: 502 });
  }
}

export async function POST(request:Request){try{checkOrigin(request);const user=await identity();if(Number(request.headers.get('content-length')||0)>22*1024*1024)throw new ApiError('Request exceeds 22 MB.',413);const response=await handlePost(request);await audit(user.userId,'AI/doc-intake',response.ok?'completed':'failed',response.ok?'Provider returned a draft for review.':'AI request unavailable or failed.');return response;}catch(error){return failure(error);}}
