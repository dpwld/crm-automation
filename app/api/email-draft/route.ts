import {readJson} from '@/lib/http';
import {ApiError,checkOrigin,identity,failure} from '@/lib/server/auth';
import {audit} from '@/lib/server/integrations';
import { NextResponse } from "next/server";
import OpenAI from "openai";

/* 고객 이메일 컴포저용 AI 멘트 제작 — 지시("더 정중하게, 납기 강조")와 문서
   요약을 받아 제목/본문을 다시 써 준다 (po-extract와 동일한 패턴).
   결과는 컴포저에서 "적용" 버튼으로만 반영된다 — 바로 덮어쓰지 않는다. */

const MODEL = (process.env.OPENAI_MODEL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY ?? "").replace(/['"\s]/g, "");

const SYSTEM = `You draft customer-facing sales emails for the workspace organisation.
You are given the current subject/message, a document summary (doc number, company, line items, totals, terms), and an instruction from the the workspace organisation salesperson.
- Rewrite or compose the subject and message following the instruction, grounded ONLY in the document summary. Never invent prices, dates, or specs that are not in the summary.
- The instruction may be written in Korean or English ("language" field says which) · interpret it in that language.
- The customer email BODY is written in English by default, even when the instruction is Korean. Write the email in Korean only when the instruction explicitly asks for a Korean email.
- Preserve variable tokens such as {{company}}, {{docNo}}, {{contact}}, {{sender}}, {{total}}, {{validUntil}} exactly as-is wherever the current text uses them; you may also place them where natural instead of hardcoding those values.
- message is plain text (no HTML/markdown): greeting, body paragraphs, closing line. Do NOT append a signature. It is added automatically on send.
- NEVER use an em dash or en dash character anywhere in the subject or message. Use a comma, colon, or period instead. Plain hyphens inside document numbers (DOC-Q-2026-001) are fine.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    message: { type: "string" },
  },
  required: ["subject", "message"],
} as const;

async function handlePost(request: Request) {
  if (!OPENAI_KEY || !MODEL) return NextResponse.json({ error: "Configure server secrets OPENAI_API_KEY and OPENAI_MODEL to enable AI." }, { status: 503 });

  let body: { instruction?: string; currentSubject?: string; currentMessage?: string; docSummary?: string; language?: string };
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { instruction = "", currentSubject = "", currentMessage = "", docSummary = "", language = "en" } = body;
  if (!instruction.trim()) return NextResponse.json({ error: "instruction required" }, { status: 400 });

  const user = [
    `INSTRUCTION (language: ${language}): ${instruction}`,
    `CURRENT SUBJECT: ${currentSubject || "(empty)"}`,
    `CURRENT MESSAGE:\n${currentMessage || "(empty)"}`,
    `DOCUMENT SUMMARY:\n${docSummary || "(none)"}`,
  ].join("\n\n");

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "email_draft", strict: true, schema: SCHEMA },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty completion");
    // 대시 금지 최종 보정 — 프롬프트가 놓쳐도 em/en dash는 절대 내보내지 않는다.
    const stripDashes = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").replace(/[—–]/g, "-");
    const parsed = JSON.parse(raw) as { subject?: string; message?: string };
    return NextResponse.json({ subject: stripDashes(parsed.subject ?? ""), message: stripDashes(parsed.message ?? "") });
  } catch (err) {
    console.error("email draft failed:", err);
    const detail = (err instanceof OpenAI.APIError ? `openai_${err.status}_${err.code ?? ""}` : String((err as Error)?.message ?? ""))
      .replace(/sk-[A-Za-z0-9_-]{4,}/g, "sk-***")
      .slice(0, 120);
    return NextResponse.json({ error: "draft_failed", detail }, { status: 502 });
  }
}

export async function POST(request:Request){try{checkOrigin(request);const user=await identity();if(Number(request.headers.get('content-length')||0)>22*1024*1024)throw new ApiError('Request exceeds 22 MB.',413);const response=await handlePost(request);await audit(user.userId,'AI/email-draft',response.ok?'completed':'failed',response.ok?'Provider returned a draft for review.':'AI request unavailable or failed.');return response;}catch(error){return failure(error);}}
