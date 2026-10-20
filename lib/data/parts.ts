import { createClient } from "@/lib/supabase/client";
import type { Build, Part } from "@/types/domain";



export const PART_STAGES = [
  "CAD", "CFD", "DFM Review", "Ordered", "Printing", "Post Process", "CT Scan", "Testing", "Complete",
] as const;

export const PART_STATUSES = ["Not Started", "In Progress", "Done", "Blocked", "Hold"] as const;

export const PART_LOCATIONS = [
  "CAD file only", "Vendor floor", "In transit", "Office", "Warehouse",
  "CT lab", "Test lab", "Customer site", "Storage shelf", "Scrapped",
] as const;

export const PART_MATERIALS: string[] = [];



export const PART_STORAGES: string[] = [];


export const INTERNAL_PROGRAMS = ["Standard Model", "Internal R&D"] as const;

export function mapPart(r: Record<string, unknown>): Part {
  return {
    id: r.id as string,
    partId: (r.part_id as string) ?? "",
    name: (r.name as string) ?? "",
    externalRef: (r.external_ref as string) ?? "",
    rev: (r.rev as string) ?? "",
    program: (r.program as string) ?? "",
    material: (r.material as string) ?? "",
    sizeLwh: (r.size_lwh as string) ?? "",
    qty: Number(r.qty ?? 1),
    stage: (r.stage as string) ?? "CAD",
    status: (r.status as string) ?? "Not Started",
    location: (r.location as string) ?? "",
    locationVendorId: (r.location_vendor_id as string) ?? null,
    locationVendorSiteId: (r.location_vendor_site_id as string) ?? null,
    locationCompanyId: (r.location_company_id as string) ?? null,
    locationDetail: (r.location_detail as string) ?? "",
    vendorId: (r.vendor_id as string) ?? null,
    vendorNote: (r.vendor_note as string) ?? "",
    nextAction: (r.next_action as string) ?? "",
    ownerKey: (r.owner_key as string) ?? "",
    storage: (r.storage as string) ?? "",
    fileNtop: (r.file_ntop as string) ?? "",
    fileStl: (r.file_stl as string) ?? "",
    fileStep: (r.file_step as string) ?? "",
    fileCfd: (r.file_cfd as string) ?? "",
    fileCt: (r.file_ct as string) ?? "",
    notionLink: (r.notion_link as string) ?? "",
    notes: (r.notes as string) ?? "",
    buildId: (r.build_id as string) ?? null,
    dealId: (r.deal_id as string) ?? null,
    arrivedAt: (r.arrived_at as string) ?? null,
    inspectedAt: (r.inspected_at as string) ?? null,
    inspectedBy: (r.inspected_by as string) ?? "",
    inspectionNote: (r.inspection_note as string) ?? "",
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}

function toDb(p: Partial<Part>): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (p.partId !== undefined) db.part_id = p.partId;
  if (p.name !== undefined) db.name = p.name;
  if (p.externalRef !== undefined) db.external_ref = p.externalRef;
  if (p.rev !== undefined) db.rev = p.rev;
  if (p.program !== undefined) db.program = p.program;
  if (p.material !== undefined) db.material = p.material;
  if (p.sizeLwh !== undefined) db.size_lwh = p.sizeLwh;
  if (p.qty !== undefined) db.qty = p.qty;
  if (p.stage !== undefined) db.stage = p.stage;
  if (p.status !== undefined) db.status = p.status;
  if (p.location !== undefined) db.location = p.location;
  if (p.locationVendorId !== undefined) db.location_vendor_id = p.locationVendorId;
  if (p.locationVendorSiteId !== undefined) db.location_vendor_site_id = p.locationVendorSiteId;
  if (p.locationCompanyId !== undefined) db.location_company_id = p.locationCompanyId;
  if (p.locationDetail !== undefined) db.location_detail = p.locationDetail;
  if (p.vendorId !== undefined) db.vendor_id = p.vendorId;
  if (p.vendorNote !== undefined) db.vendor_note = p.vendorNote;
  if (p.nextAction !== undefined) db.next_action = p.nextAction;
  if (p.ownerKey !== undefined) db.owner_key = p.ownerKey;
  if (p.storage !== undefined) db.storage = p.storage;
  if (p.fileNtop !== undefined) db.file_ntop = p.fileNtop;
  if (p.fileStl !== undefined) db.file_stl = p.fileStl;
  if (p.fileStep !== undefined) db.file_step = p.fileStep;
  if (p.fileCfd !== undefined) db.file_cfd = p.fileCfd;
  if (p.fileCt !== undefined) db.file_ct = p.fileCt;
  if (p.notionLink !== undefined) db.notion_link = p.notionLink;
  if (p.notes !== undefined) db.notes = p.notes;
  if (p.buildId !== undefined) db.build_id = p.buildId;
  // 2026-09-21 SQL 컬럼 — 값이 관련될 때만 보낸다 (미실행 DB 보호)
  if (p.dealId !== undefined) db.deal_id = p.dealId;
  if (p.arrivedAt !== undefined) db.arrived_at = p.arrivedAt;
  if (p.inspectedAt !== undefined) db.inspected_at = p.inspectedAt;
  if (p.inspectedBy !== undefined) db.inspected_by = p.inspectedBy;
  if (p.inspectionNote !== undefined) db.inspection_note = p.inspectionNote;
  if (p.createdByKey !== undefined) db.created_by_key = p.createdByKey;
  return db;
}

export async function fetchParts(): Promise<Part[]> {
  const { data, error } = await createClient().from("parts").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapPart);
}

export async function insertPart(input: Partial<Part>): Promise<Part> {
  const { data, error } = await createClient().from("parts").insert(toDb(input)).select("*").single();
  if (error) throw error;
  return mapPart(data as Record<string, unknown>);
}

export async function updatePart(id: string, patch: Partial<Part>): Promise<Part> {
  const { data, error } = await createClient()
    .from("parts")
    .update({ ...toDb(patch), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapPart(data as Record<string, unknown>);
}

export async function deletePart(id: string): Promise<void> {
  const { error } = await createClient().from("parts").delete().eq("id", id);
  if (error) throw error;
}

// ── Engineering 빌드 ↔ 파트 자동 동기화 (parts.build_id 연결) ────────────────


const BUILD_STATUS_TO_PART: Record<Build["status"], { stage: string; status: string }> = {
  design: { stage: "CAD", status: "In Progress" },
  verification: { stage: "Printing", status: "In Progress" },
  passed: { stage: "Post Process", status: "In Progress" },
  failed: { stage: "Printing", status: "Blocked" },
};


export function buildToPartFields(build: Build, previous?: Build): Partial<Part> {
  const mapped = BUILD_STATUS_TO_PART[build.status];

  const fields: Partial<Part> = {
    ...(build.modelCode.trim() ? { name: build.modelCode.trim() } : {}),
    ...(mapped ? { stage: mapped.stage, status: mapped.status } : {}),
  };
  if (previous) {
    const before = buildToPartFields(previous);
    if (fields.name === before.name) delete fields.name;
    if (build.status === previous.status) {
      delete fields.stage;
      delete fields.status;
    }
  }
  return fields;
}


export async function syncBuildToPart(build: Build, previous: Build): Promise<void> {
  const fields = buildToPartFields(build, previous);
  if (!Object.keys(fields).length) return;
  const { error } = await createClient()
    .from("parts")
    .update({ ...toDb(fields), updated_at: new Date().toISOString() })
    .eq("build_id", build.id);
  if (error) throw error;
}


export function suggestExternalRef(vendorCode: string, parts: Part[]): string {
  if (!vendorCode) return "";
  const re = new RegExp(`^DOC-${vendorCode}-P(\\d+)$`);
  let max = 0;
  for (const p of parts) {
    const m = p.externalRef.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `DOC-${vendorCode}-P${String(max + 1).padStart(3, "0")}`;
}


export function suggestPartId(program: string, parts: Part[]): string {
  if (!program.trim()) return "";
  const code = program.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "GEN";
  const yy = String(new Date().getFullYear()).slice(2);
  const re = new RegExp(`^DOC-${code}-${yy}-(\\d+)$`);
  let max = 0;
  for (const p of parts) {
    const m = p.partId.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `DOC-${code}-${yy}-${String(max + 1).padStart(3, "0")}`;
}


export function bumpRev(rev: string): string {
  const r = rev.trim();
  if (!r) return "Rev2";
  const m = r.match(/^(.*?)(\d+)$/);
  if (m) return m[1] + String(Number(m[2]) + 1);
  if (/^[A-Za-z]$/.test(r)) return String.fromCharCode(r.charCodeAt(0) + 1);
  return r + "-2";
}


export function daysSince(iso: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

// ── 변경 로그 (part_logs, 2026-08-11c SQL) ──────────────────────────────────

export interface PartLog {
  id: string;
  partId: string;
  actorKey: string;
  body: string;
  createdAt: string;
}

export async function fetchPartLogs(partId: string): Promise<PartLog[]> {
  const { data, error } = await createClient()
    .from("part_logs")
    .select("*")
    .eq("part_id", partId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    partId: r.part_id as string,
    actorKey: (r.actor_key as string) ?? "",
    body: (r.body as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  }));
}


export async function insertPartLog(partId: string, actorKey: string, body: string): Promise<void> {
  const { error } = await createClient().from("part_logs").insert({ part_id: partId, actor_key: actorKey, body });
  if (error) throw error;
}

const DIFF_LABELS: Partial<Record<keyof Part, string>> = {
  partId: "Part ID", name: "Name", externalRef: "External ref", rev: "Rev", program: "Program",
  material: "Material", sizeLwh: "Size", qty: "Qty", stage: "Stage",
  status: "Status", location: "Location", vendorId: "Vendor", vendorNote: "Vendor note",
  locationVendorId: "Location vendor", locationCompanyId: "Location company", locationDetail: "Location detail",
  locationVendorSiteId: "Vendor site",
  nextAction: "Next action", ownerKey: "Owner", storage: "Storage",
  fileNtop: "nTop file", fileStl: "STL file", fileStep: "STEP file", fileCfd: "CFD case",
  fileCt: "CT data", notionLink: "Notion link", notes: "Notes", buildId: "Build link",
};


export function describePartChanges(before: Part, after: Part): string {
  const parts: string[] = [];
  const short = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.length > 40 ? s.slice(0, 40) + "…" : s || "(empty)";
  };
  for (const key of Object.keys(DIFF_LABELS) as (keyof Part)[]) {
    if (before[key] !== after[key]) parts.push(`${DIFF_LABELS[key]}: ${short(before[key])} → ${short(after[key])}`);
  }
  return parts.join(" · ");
}

// ── 드롭다운 리스트 편집 (app_settings 'parts_lists', 2026-08-11c 정책) ─────

export interface PartsLists {
  stage: string[];
  status: string[];
  location: string[];
  material: string[];
  storage: string[];
  
  internalPrograms: string[];
}

export const DEFAULT_PARTS_LISTS: PartsLists = {
  stage: [...PART_STAGES],
  status: [...PART_STATUSES],
  location: [...PART_LOCATIONS],
  material: [...PART_MATERIALS],
  storage: [...PART_STORAGES],
  internalPrograms: [...INTERNAL_PROGRAMS],
};

export async function fetchPartsLists(): Promise<PartsLists> {
  const { data, error } = await createClient().from("app_settings").select("value").eq("key", "parts_lists").maybeSingle();
  if (error) throw error;
  const v = (data?.value ?? {}) as Partial<Record<keyof PartsLists, string[]>>;
  const merged = { ...DEFAULT_PARTS_LISTS };
  for (const k of Object.keys(merged) as (keyof PartsLists)[]) {
    if (Array.isArray(v[k]) && v[k]!.length > 0) merged[k] = v[k]!.map((s) => String(s));
  }
  return merged;
}

export async function savePartsLists(lists: PartsLists): Promise<void> {
  const { error } = await createClient()
    .from("app_settings")
    .upsert({ key: "parts_lists", value: lists, updated_at: new Date().toISOString() });
  if (error) throw error;
}
