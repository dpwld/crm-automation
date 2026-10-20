import {readJson} from '@/lib/http';
import {ApiError,checkOrigin,identity,failure} from '@/lib/server/auth';
import {audit} from '@/lib/server/integrations';
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { logAiCall } from "@/lib/ai/logging";

/* CRM intake: turns an uploaded document/note (RFQ, revised RFP, email, memo)
   into records — matched against the CURRENT pipeline so a revision from an
   existing customer becomes an UPDATE (changed fields + spec changes) instead
   of a duplicate row. Called by lib/ai/intake.processUpload. */

const MODEL = (process.env.OPENAI_MODEL || "").trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY ?? "").replace(/['"\s]/g, "");

const SYSTEM = `You are the CRM intake assistant at the workspace organisation (customer sales and engineering requirements). You receive a customer document or note (RFQ, revised RFP, email, meeting memo) plus the CURRENT PIPELINE.

For each distinct company request in the input, output ONE record:
- If it concerns a company already in the pipeline (name match, case-insensitive, obvious variants included), set action="update" and matchRef to that company's ref. Fill ONLY the business fields the input actually changes · leave everything else null. Examples: a price-reduction request → value; "move to quote" → stage; a new contact person → contact.
- Otherwise action="create" with matchRef=null. name is required; sector is the industry stated by the customer (otherwise null); stage defaults to "lead"; value in USD when stated; contact when present; importance only when implied.
- specChanges: only changes to the operator-provided specification field list. Use the exact field label as parameter; side "hot" means the first configured value column and "cold" the second; use "merged" for a single value. Do not infer fields or units. newValue is the stated value as a short string.
- summary: one line for the activity log, e.g. "Customer requested a revised quote and engineering requirement."
- note: extra context worth sharing with the team (deadline, reason, conditions), else null.

NEVER invent values that are not in the input · numbers must be exact. When the input is unusable (no company/request), return an empty records array.`;

const STAGES = ["lead", "in_review", "spec", "quoted", "won", "lost"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["create", "update"] },
          matchRef: { type: ["string", "null"] },
          name: { type: "string" },
          sector: { type: ["string", "null"] },
          stage: { type: ["string", "null"], enum: [...STAGES, null] },
          importance: { type: ["string", "null"], enum: ["high", "med", "low", null] },
          value: { type: ["number", "null"] },
          contact: { type: ["string", "null"] },
          specChanges: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                parameter: { type: "string" },
                side: { type: "string", enum: ["hot", "cold", "merged"] },
                newValue: { type: "string" },
              },
              required: ["parameter", "side", "newValue"],
            },
          },
          summary: { type: "string" },
          note: { type: ["string", "null"] },
        },
        required: ["action", "matchRef", "name", "sector", "stage", "importance", "value", "contact", "specChanges", "summary", "note"],
      },
    },
  },
  required: ["records"],
} as const;

interface IntakeFile { name: string; type: string; dataBase64: string }

async function handlePost(request: Request) {
  if (!OPENAI_KEY || !MODEL) {
    return NextResponse.json({ error: "Configure server secrets OPENAI_API_KEY and OPENAI_MODEL to enable AI." }, { status: 503 });
  }

  let body: { text?: string; files?: IntakeFile[] };
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  const files = body.files ?? [];
  if (!text && files.length === 0) {
    return NextResponse.json({ error: "text or files required" }, { status: 400 });
  }

  // Current pipeline for matching — refs are the join key the model returns.
  const supabase = await createClient();
  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("ref, name, sector, stage, importance, value, contact");
  if (cErr) {
    console.error("intake pipeline load failed:", cErr);
    return NextResponse.json({ error: "pipeline_load_failed" }, { status: 500 });
  }
  const {data: schemaSettings,error: schemaError}=await supabase.from('app_settings').select('value');
  const schemaSetting=schemaSettings?.find(row=>row.key==='spec_schema');
  if(schemaError)return NextResponse.json({error:'Could not load the specification schema.'},{status:500});
  const pipeline = (companies ?? [])
    .map((c) => `${c.ref} | ${c.name} | ${c.sector} | stage=${c.stage} | value=${c.value ?? "N/A"} | contact=${c.contact || "N/A"}`)
    .join("\n");

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `OPERATOR SPECIFICATION SCHEMA (field names and value columns): ${JSON.stringify(schemaSetting?.value||{})}\n\nCURRENT PIPELINE (ref | name | sector | stage | value | contact):\n${pipeline || "(empty)"}\n\nINPUT:\n${text || "(see attached files)"}`,
    },
  ];
  for (const f of files) {
    if (f.type.startsWith("image/")) {
      content.push({ type: "image_url", image_url: { url: `data:${f.type};base64,${f.dataBase64}` } });
    } else if (f.type === "application/pdf") {
      content.push({
        type: "file",
        file: { filename: f.name, file_data: `data:application/pdf;base64,${f.dataBase64}` },
      } as OpenAI.Chat.Completions.ChatCompletionContentPart);
    } else {
      return NextResponse.json({ error: "unsupported_file", detail: f.name }, { status: 415 });
    }
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      response_format: { type: "json_schema", json_schema: { name: "intake", strict: true, schema: SCHEMA as unknown as Record<string, unknown> } },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty completion");
    const parsed = JSON.parse(raw);
    const logId = await logAiCall({
      tool: "intake",
      model: MODEL,
      input: { text: text || null, files: files.map((f) => ({ name: f.name, type: f.type })) },
      output: parsed,
    });
    return NextResponse.json({ ...parsed, _logId: logId });
  } catch (err) {
    console.error("intake extraction failed:", err);
    const rawMsg = err instanceof OpenAI.APIError ? `openai_${err.status}_${err.code ?? ""}` : String((err as Error)?.message ?? "");
    const detail = rawMsg.replace(/sk-[A-Za-z0-9_-]{4,}/g, "sk-***").slice(0, 80);
    return NextResponse.json({ error: "extraction_failed", detail }, { status: 502 });
  }
}

export async function POST(request:Request){try{checkOrigin(request);const user=await identity();if(Number(request.headers.get('content-length')||0)>22*1024*1024)throw new ApiError('Request exceeds 22 MB.',413);const response=await handlePost(request);await audit(user.userId,'AI/intake',response.ok?'completed':'failed',response.ok?'Provider returned a draft for review.':'AI request unavailable or failed.');return response;}catch(error){return failure(error);}}
