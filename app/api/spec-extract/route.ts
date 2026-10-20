import {readJson} from '@/lib/http';
import {ApiError,checkOrigin,identity,failure} from '@/lib/server/auth';
import {audit} from '@/lib/server/integrations';
import { NextResponse } from "next/server";
import OpenAI from "openai";

/* Engineering spec 버전용 AI 추출 — 고객 요구 문서(PDF/이미지)를 읽어 "주어진
   파라미터 목록"의 값만 뽑는다. 회사 매칭·생성은 하지 않는다(호출부가 이미
   회사·빌드·버전을 알고 있음). 결과는 화면 확인 모달을 거쳐야만 반영된다. */

const MODEL = (process.env.OPENAI_MODEL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY ?? "").replace(/['"\s]/g, "");

const SYSTEM = `You read a customer requirement / spec document using the operator-provided field and column definitions. Extract faithfully; never invent numbers.
- For each requested parameter, find its value in the document. Keep the original notation ("<75,000", "30-40", "TBD", units embedded) as-is.
- sides: "columns" parameters have separate values for the named columns, returned as valueHot for the first and valueCold for the second; "merged" parameters have one value.
- Leave value fields as empty strings when the document does not state them.
- suggestedLabel: a short version label guess from the document (e.g. "Customer initial request", "Rev 2 update"); empty if unclear.
- notes: up to 3 short English bullets for the reviewer (unit mismatches, ambiguous readings, extra requirements in the document that have no slot).`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    values: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          parameter: { type: "string" },
          value: { type: "string" },
          valueHot: { type: "string" },
          valueCold: { type: "string" },
        },
        required: ["parameter", "value", "valueHot", "valueCold"],
      },
    },
    suggestedLabel: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["values", "suggestedLabel", "notes"],
} as const;

async function handlePost(request: Request) {
  if (!OPENAI_KEY || !MODEL) return NextResponse.json({ error: "Configure server secrets OPENAI_API_KEY and OPENAI_MODEL to enable AI." }, { status: 503 });

  let body: {
    fileName?: string; fileType?: string; dataBase64?: string;
    /** 엑셀/CSV — 클라이언트가 시트를 CSV 텍스트로 변환해 보낸다 (모델이 xlsx 바이너리를 못 읽음). */
    textContent?: string;
    parameters?: { parameter: string; symbol: string; unit: string; columns?:string[]; sides: "columns" | "merged" }[];
  };
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { fileName = "spec", fileType = "", dataBase64 = "", textContent = "", parameters = [] } = body;
  if ((!dataBase64 && !textContent) || parameters.length === 0) return NextResponse.json({ error: "file and parameters required" }, { status: 400 });

  const paramList = parameters
    .map((p) => `- ${p.parameter}${p.symbol ? ` (${p.symbol})` : ""}${p.unit ? ` [${p.unit}]` : ""} · ${p.sides === "merged" ? "one value" : `separate values: ${(p.columns||[]).join(" / ")}`}`)
    .join("\n");

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: `PARAMETERS TO FILL:\n${paramList}\n\nDOCUMENT: ${fileName}` },
  ];
  if (textContent) {
    content.push({ type: "text", text: `DOCUMENT CONTENT (spreadsheet converted to CSV):\n${textContent.slice(0, 200_000)}` });
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
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "spec_extract", strict: true, schema: SCHEMA },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty completion");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    console.error("spec extract failed:", err);
    const detail = (err instanceof OpenAI.APIError ? `openai_${err.status}_${err.code ?? ""}` : String((err as Error)?.message ?? ""))
      .replace(/sk-[A-Za-z0-9_-]{4,}/g, "sk-***")
      .slice(0, 120);
    return NextResponse.json({ error: "extract_failed", detail }, { status: 502 });
  }
}

export async function POST(request:Request){try{checkOrigin(request);const user=await identity();if(Number(request.headers.get('content-length')||0)>22*1024*1024)throw new ApiError('Request exceeds 22 MB.',413);const response=await handlePost(request);await audit(user.userId,'AI/spec-extract',response.ok?'completed':'failed',response.ok?'Provider returned a draft for review.':'AI request unavailable or failed.');return response;}catch(error){return failure(error);}}
