import { createClient } from "@/lib/supabase/client";
import type { Activity, Comment, Company, FeedContext, Importance, Stage } from "@/types/domain";
import type { SpecSheetSection, SpecSheetRow } from "@/components/ds/sheets/SpecSheet";




export interface CrmData {
  companies: Company[];
  specs: Record<string, SpecSheetSection[]>;
  activities: Record<string, Activity[]>;
  comments: Record<string, Comment[]>;
}


export type DbSpecRow = SpecSheetRow & { _id: string };

function mapCompany(r: Record<string, unknown>): Company {
  return {
    id: r.id as string,
    ref: (r.ref as string) ?? "",
    partyCode: (r.party_code as string) ?? "",
    name: (r.name as string) ?? "",
    sector: (r.sector as string) ?? "",
    stage: r.stage as Stage,
    ownerId: (r.owner_key as string) ?? "",
    engOwnerId: (r.eng_owner_key as string) ?? "",
    contact: (r.contact as string) ?? "",
    importance: r.importance as Importance,
    value: r.value == null ? null : Number(r.value),
    progress: r.progress == null ? 0 : Number(r.progress),
    address: (r.address as string) ?? "",
    ndaStatus: ((r.nda_status as Company["ndaStatus"]) ?? "none"),
    ndaSignedOn: (r.nda_signed_on as string | null) ?? null,
    ndaDocId: (r.nda_doc_id as string | null) ?? null,
    updatedAt: (r.updated_at as string) ?? "",
  };
}

function mapSpecRow(r: Record<string, unknown>): DbSpecRow {
  const row: DbSpecRow = {
    _id: r.id as string,
    param: (r.parameter as string) ?? "",
    symbol: (r.symbol as string) || undefined,
    unit: (r.unit as string) || undefined,
  };
  if (r.is_text) row.text = true;
  row.columnLabels = r.column_labels;
  if (r.merged) {
    row.merged = true;
    row.value = (r.value as string) ?? "";
  } else {
    row.hot = (r.value_hot as string) ?? "";
    row.cold = (r.value_cold as string) ?? "";
  }
  return row;
}


function groupSpecs(rows: Record<string, unknown>[]): SpecSheetSection[] {
  const sections: SpecSheetSection[] = [];
  const byName = new Map<string, SpecSheetSection>();
  for (const r of rows) {
    const name = (r.section as string) ?? "";
    let sec = byName.get(name);
    if (!sec) {
      sec = { name, rows: [] };
      byName.set(name, sec);
      sections.push(sec);
    }
    sec.rows.push(mapSpecRow(r));
  }
  return sections;
}


export async function fetchCrm(): Promise<CrmData> {
  const sb = createClient();
  const [companiesRes, specsRes, actsRes, commentsRes, reactionsRes] = await Promise.all([
    sb.from("companies").select("*").order("updated_at", { ascending: false }),
    sb.from("company_specs").select("*").order("sort", { ascending: true }),
    sb.from("activities").select("*").order("created_at", { ascending: true }),
    sb.from("comments").select("*").order("created_at", { ascending: true }),
    sb.from("comment_reactions").select("*"),
  ]);

  const firstError = companiesRes.error || specsRes.error || actsRes.error || commentsRes.error || reactionsRes.error;
  if (firstError) throw firstError;

  const companies = (companiesRes.data ?? []).map(mapCompany);

  const specsByCompany: Record<string, Record<string, unknown>[]> = {};
  for (const r of specsRes.data ?? []) (specsByCompany[r.company_id as string] ??= []).push(r);
  const specs: Record<string, SpecSheetSection[]> = {};
  for (const [cid, rows] of Object.entries(specsByCompany)) specs[cid] = groupSpecs(rows);

  const activities: Record<string, Activity[]> = {};
  for (const r of actsRes.data ?? []) {
    (activities[r.company_id as string] ??= []).push({
      id: r.id, companyId: r.company_id, actorId: r.actor_key ?? "u-system",
      type: r.type, summary: r.summary, context: (r.context as FeedContext) ?? "spec",
      targetId: (r.target_id as string) ?? null, createdAt: r.created_at,
    });
  }

  // reactions grouped by comment → emoji → userIds
  const reactionsByComment: Record<string, Record<string, string[]>> = {};
  for (const r of reactionsRes.data ?? []) {
    const m = (reactionsByComment[r.comment_id as string] ??= {});
    (m[r.emoji as string] ??= []).push((r.user_key as string) ?? "");
  }
  const comments: Record<string, Comment[]> = {};
  for (const r of commentsRes.data ?? []) {
    const emojiMap = reactionsByComment[r.id as string] ?? {};
    (comments[r.company_id as string] ??= []).push({
      id: r.id, companyId: r.company_id, authorId: r.author_key ?? "u-system",
      body: r.body, parentId: r.parent_id ?? null, context: (r.context as FeedContext) ?? "spec",
      targetId: (r.target_id as string) ?? null,
      reactions: Object.entries(emojiMap).map(([emoji, userIds]) => ({ emoji, userIds })),
      createdAt: r.created_at,
    });
  }

  return { companies, specs, activities, comments };
}


export async function fetchCompanySpecs(companyId: string): Promise<SpecSheetSection[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("company_specs").select("*").eq("company_id", companyId)
    .order("sort", { ascending: true });
  if (error) throw error;
  return groupSpecs(data ?? []);
}

// ---- Companies ----

type CompanyInput = Pick<Company, "ref" | "partyCode" | "name" | "sector" | "stage" | "ownerId" | "contact" | "importance" | "value" | "progress" | "address">;



export async function fetchCompanyPartyCode(id: string): Promise<string> {
  const { data } = await createClient().from("companies").select("party_code").eq("id", id).maybeSingle();
  return ((data as { party_code?: string } | null)?.party_code ?? "").trim();
}

export async function fetchCompanyAddress(id: string): Promise<string> {
  try {
    const { data, error } = await createClient().from("companies").select("address").eq("id", id).maybeSingle();
    if (error) return "";
    return ((data as Record<string, unknown> | null)?.address as string) ?? "";
  } catch {
    return "";
  }
}


export async function fetchCompaniesLight(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await createClient().from("companies").select("id, name").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id as string, name: (r.name as string) ?? "" }));
}


export async function fetchCompanyAddresses(): Promise<{ name: string; address: string }[]> {
  const { data, error } = await createClient().from("companies").select("name, address").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ name: (r.name as string) ?? "", address: (r.address as string) ?? "" }));
}


export async function fetchTakenPartyCodes(): Promise<Set<string>> {
  const sb = createClient();
  const [c, v] = await Promise.all([
    sb.from("companies").select("party_code"),
    sb.from("vendors").select("code"),
  ]);
  if (c.error) throw c.error;
  const taken = new Set<string>();
  for (const r of c.data ?? []) if (r.party_code) taken.add(String(r.party_code).toUpperCase());
  // vendors 테이블 조회 실패 시(권한 등) 회사 코드만으로 진행
  if (!v.error) for (const r of v.data ?? []) if (r.code) taken.add(String(r.code).toUpperCase());
  return taken;
}


export function generateCompanyCode(name: string, taken: Set<string>): string {
  const letters = name.toUpperCase().normalize("NFKD").replace(/[^A-Z]/g, "") + "XXX";
  const n = Math.min(letters.length, 12);
  const cands: string[] = [letters.slice(0, 3)];
  for (let i = 3; i < n; i++) cands.push(letters[0] + letters[1] + letters[i]);
  for (let i = 2; i < n; i++) for (let j = i + 1; j < n; j++) cands.push(letters[0] + letters[i] + letters[j]);
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const c of A) for (const d of A) cands.push(letters[0] + c + d);
  for (const cand of cands) if (/^[A-Z]{3}$/.test(cand) && !taken.has(cand)) return cand;
  for (const a of A) for (const c of A) for (const d of A) if (!taken.has(a + c + d)) return a + c + d;
  return "ZZZ";
}

export async function insertCompany(input: CompanyInput): Promise<Company> {
  const sb = createClient();
  // 코드 미지정 시 자동 채번 — 고객·벤더 전체와 중복되지 않는 3글자.
  let partyCode = input.partyCode.trim().toUpperCase();
  if (!partyCode) {
    try {
      partyCode = generateCompanyCode(input.name, await fetchTakenPartyCodes());
    } catch (err) {
      console.error("code autogen failed (saving without a code):", err);
    }
  }
  const { data, error } = await sb
    .from("companies")
    .insert({
      ref: input.ref, party_code: partyCode || null,
      name: input.name, sector: input.sector, stage: input.stage,
      owner_key: input.ownerId, contact: input.contact, importance: input.importance,
      value: input.value, progress: input.progress,
      // address 컬럼(2026-09-03 SQL) 미실행 DB 보호 — 값이 있을 때만 보낸다.
      ...(input.address ? { address: input.address } : {}),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapCompany(data);
}

export async function updateCompany(id: string, patch: Partial<Company>): Promise<Company> {
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.ref != null) db.ref = patch.ref;
  // 빈 문자열은 unique 인덱스에 걸리지 않도록 null로 저장한다.
  if (patch.partyCode != null) db.party_code = patch.partyCode.trim() ? patch.partyCode.trim().toUpperCase() : null;
  if (patch.name != null) db.name = patch.name;
  if (patch.sector != null) db.sector = patch.sector;
  if (patch.stage != null) db.stage = patch.stage;
  if (patch.ownerId != null) db.owner_key = patch.ownerId;
  // eng_owner_key 컬럼(2026-09-02 SQL) 미실행 DB 보호 — 패치될 때만 보낸다.
  if (patch.engOwnerId != null) db.eng_owner_key = patch.engOwnerId;
  if (patch.contact != null) db.contact = patch.contact;
  if (patch.importance != null) db.importance = patch.importance;
  if (patch.value !== undefined) db.value = patch.value;
  if (patch.progress != null) db.progress = patch.progress;
  // address 컬럼(2026-09-03 SQL) 미실행 DB 보호 — 패치될 때만 보낸다.
  if (patch.address != null) db.address = patch.address;
  // nda_* 컬럼(2026-09-17b SQL) 미실행 DB 보호 — 패치될 때만 보낸다.
  if (patch.ndaStatus != null) db.nda_status = patch.ndaStatus;
  if (patch.ndaSignedOn !== undefined) db.nda_signed_on = patch.ndaSignedOn;
  // nda_doc_id 컬럼(2026-09-17e SQL) 미실행 DB 보호 — 패치될 때만 보낸다.
  if (patch.ndaDocId !== undefined) db.nda_doc_id = patch.ndaDocId;

  const sb = createClient();
  const { data, error } = await sb.from("companies").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapCompany(data);
}

export async function deleteCompany(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("companies").delete().eq("id", id);
  if (error) throw error;
}


export async function insertSpecs(companyId: string, sections: SpecSheetSection[]): Promise<SpecSheetSection[]> {
  const payload: Record<string, unknown>[] = [];
  let sort = 0;
  for (const sec of sections) {
    for (const r of sec.rows as SpecSheetRow[]) {
      payload.push({
        company_id: companyId,
        section: String(sec.name),
        parameter: String(r.param ?? ""),
        column_labels: r.columnLabels,
        symbol: r.symbol ? String(r.symbol) : "",
        unit: r.unit ? String(r.unit) : "",
        merged: !!r.merged,
        is_text: !!r.text,
        value: r.merged ? String(r.value ?? "") : "",
        value_hot: r.merged ? "" : String(r.hot ?? ""),
        value_cold: r.merged ? "" : String(r.cold ?? ""),
        sort: sort++,
      });
    }
  }
  if (!payload.length) return [];
  const sb = createClient();
  const { data, error } = await sb.from("company_specs").insert(payload).select("*").order("sort", { ascending: true });
  if (error) throw error;
  return groupSpecs(data as Record<string, unknown>[]);
}

// ---- Specs ----

const SPEC_COLUMN: Record<string, string> = { _merged: "value", value: "value", hot: "value_hot", cold: "value_cold" };


export async function updateSpecCell(companyId: string, specId: string, column: string, value: string): Promise<string> {
  const col = SPEC_COLUMN[column] ?? column;
  const sb = createClient();
  const { error } = await sb.from("company_specs").update({ [col]: value }).eq("id", specId);
  if (error) throw error;
  const updatedAt = new Date().toISOString();
  await sb.from("companies").update({ updated_at: updatedAt }).eq("id", companyId);
  return updatedAt;
}

// ---- Activities ----

export async function insertActivity(companyId: string, actorKey: string, type: Activity["type"], summary: string, context: FeedContext = "spec", targetId: string | null = null): Promise<Activity> {
  const sb = createClient();
  const { data, error } = await sb
    .from("activities")
    .insert({ company_id: companyId, actor_key: actorKey, type, summary, context, target_id: targetId })
    .select("*")
    .single();
  if (error) throw error;
  return { id: data.id, companyId: data.company_id, actorId: data.actor_key ?? actorKey, type: data.type, summary: data.summary, context: (data.context as FeedContext) ?? "spec", targetId: (data.target_id as string) ?? null, createdAt: data.created_at };
}

// ---- Comments ----

export async function insertComment(companyId: string, authorKey: string, body: string, parentId: string | null, context: FeedContext = "spec", targetId: string | null = null): Promise<Comment> {
  const sb = createClient();
  const { data, error } = await sb
    .from("comments")
    .insert({ company_id: companyId, author_key: authorKey, body, parent_id: parentId, context, target_id: targetId })
    .select("*")
    .single();
  if (error) throw error;
  return { id: data.id, companyId: data.company_id, authorId: data.author_key ?? authorKey, body: data.body, parentId: data.parent_id ?? null, context: (data.context as FeedContext) ?? "spec", targetId: (data.target_id as string) ?? null, reactions: [], createdAt: data.created_at };
}


export async function deleteComment(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("comments").delete().eq("id", id);
  if (error) throw error;
}


export async function setReaction(commentId: string, userKey: string, emoji: string, on: boolean): Promise<void> {
  const sb = createClient();
  if (on) {
    const { error } = await sb.from("comment_reactions").insert({ comment_id: commentId, user_key: userKey, emoji });
    if (error) throw error;
  } else {
    const { error } = await sb.from("comment_reactions").delete().eq("comment_id", commentId).eq("user_key", userKey).eq("emoji", emoji);
    if (error) throw error;
  }
}


export async function fetchCompanyEngagement(): Promise<{ touched: Set<string>; targeted: Set<string> }> {
  const sb = createClient();
  const [contacts, logs, emails, targetNotes] = await Promise.all([
    sb.from("customer_contacts").select("id, company_id").not("company_id", "is", null),
    sb.from("contact_logs").select("contact_id"),
    sb.from("crm_emails").select("company_id").neq("record_status", "excluded"),
    sb.from("activities").select("company_id").eq("context", "targeting"),
  ]);
  const companyByContact = new Map<string, string>();
  for (const r of (contacts.data ?? []) as { id: string; company_id: string }[]) companyByContact.set(r.id, r.company_id);
  const touched = new Set<string>();
  if (!logs.error) for (const r of (logs.data ?? []) as { contact_id: string }[]) {
    const cid = companyByContact.get(r.contact_id);
    if (cid) touched.add(cid);
  }
  if (!emails.error) for (const r of (emails.data ?? []) as { company_id: string | null }[]) if (r.company_id) touched.add(r.company_id);
  const targeted = new Set<string>();
  if (!targetNotes.error) for (const r of (targetNotes.data ?? []) as { company_id: string | null }[]) if (r.company_id) targeted.add(r.company_id);
  return { touched, targeted };
}


export async function fetchContextActivities(companyId: string, context: string): Promise<Activity[]> {
  const { data, error } = await createClient()
    .from("activities")
    .select("*")
    .eq("company_id", companyId)
    .eq("context", context)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    companyId: r.company_id as string,
    actorId: (r.actor_key as string) ?? "",
    type: r.type as Activity["type"],
    summary: (r.summary as string) ?? "",
    context: ((r.context as Activity["context"]) ?? "spec"),
    targetId: (r.target_id as string) ?? null,
    createdAt: (r.created_at as string) ?? "",
  }));
}


export async function deleteActivity(id: string): Promise<void> {
  const { error } = await createClient().from("activities").delete().eq("id", id);
  if (error) throw error;
}
