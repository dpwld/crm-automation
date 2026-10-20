import {readJson} from '@/lib/http';
import type { Company, Importance, Stage } from "@/types/domain";
import { ASSIGNABLE_OWNERS } from "@/lib/mock/team";



export interface IntakeInput {
  files?: File[];
  text?: string;
}

export interface IntakeSpecChange {
  parameter: string;
  side: "hot" | "cold" | "merged";
  newValue: string;
}

export type IntakeDraft =
  | { kind: "create"; company: Company; specChanges: IntakeSpecChange[]; summary: string; note: string | null }
  | { kind: "update"; companyId: string; ref: string; name: string; patch: Partial<Company>; specChanges: IntakeSpecChange[]; summary: string; note: string | null };

interface ApiRecord {
  action: "create" | "update";
  matchRef: string | null;
  name: string;
  sector: string | null;
  stage: Stage | null;
  importance: Importance | null;
  value: number | null;
  contact: string | null;
  specChanges: IntakeSpecChange[];
  summary: string;
  note: string | null;
}

const SUPPORTED = /\.(pdf|png|jpe?g|webp|gif)$/i;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}


function nextRef(companies: Company[], offset: number): string {
  const max = companies.reduce((m, c) => {
    const n = parseInt(c.ref.replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `Q-${max + 1 + offset}`;
}


function matchCompany(companies: Company[], rec: ApiRecord): Company | null {
  if (rec.matchRef) {
    const byRef = companies.find((c) => c.ref.toLowerCase() === rec.matchRef!.toLowerCase());
    if (byRef) return byRef;
  }
  const name = rec.name.trim().toLowerCase();
  return companies.find((c) => c.name.trim().toLowerCase() === name) ?? null;
}


export async function processUpload(input: IntakeInput, companies: Company[]): Promise<IntakeDraft[]> {
  const files = input.files ?? [];
  const bad = files.find((f) => !SUPPORTED.test(f.name));
  if (bad) {
    throw new Error(`"${bad.name}" isn’t supported yet. Upload a PDF or image, or paste the text.`);
  }

  const payload = {
    text: input.text?.trim() || undefined,
    files: await Promise.all(
      files.map(async (f) => ({ name: f.name, type: f.type || "application/pdf", dataBase64: await readBase64(f) })),
    ),
  };

  const res = await fetch("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await readJson(res).catch(() => null);
    throw new Error(`AI processing failed${detail?.detail ? ` (${detail.detail})` : ""}. Try again or paste the text.`);
  }
  const data = (await readJson(res)) as { records: ApiRecord[] };

  const drafts: IntakeDraft[] = [];
  let created = 0;
  for (const rec of data.records ?? []) {
    const existing = rec.action === "update" ? matchCompany(companies, rec) : null;
    if (rec.action === "update" && existing) {
      const patch: Partial<Company> = {};
      if (rec.stage != null && rec.stage !== existing.stage) patch.stage = rec.stage;
      if (rec.importance != null && rec.importance !== existing.importance) patch.importance = rec.importance;
      if (rec.value != null && rec.value !== existing.value) patch.value = rec.value;
      if (rec.contact != null && rec.contact !== existing.contact) patch.contact = rec.contact;
      if (rec.sector != null && rec.sector !== existing.sector) patch.sector = rec.sector;
      drafts.push({
        kind: "update",
        companyId: existing.id,
        ref: existing.ref,
        name: existing.name,
        patch,
        specChanges: rec.specChanges ?? [],
        summary: rec.summary,
        note: rec.note,
      });
    } else {
      drafts.push({
        kind: "create",
        company: {
          id: `new-${Date.now()}-${created}`,
          ref: nextRef(companies, created),
          partyCode: "",
          engOwnerId: "",
          name: rec.name,
          sector: rec.sector || "Data center",
          stage: rec.stage ?? "lead",
          ownerId: ASSIGNABLE_OWNERS[created % ASSIGNABLE_OWNERS.length],
          contact: rec.contact ?? "",
          importance: rec.importance ?? "med",
          value: rec.value,
          progress: 10,
          updatedAt: new Date().toISOString(),
        },
        specChanges: rec.specChanges ?? [],
        summary: rec.summary,
        note: rec.note,
      });
      created++;
    }
  }
  if (drafts.length === 0) {
    throw new Error("No company request found in the input. Add a company name and what they’re asking for.");
  }
  return drafts;
}
