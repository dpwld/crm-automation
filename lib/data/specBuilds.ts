import { createClient } from "@/lib/supabase/client";
import type { SpecSheetRow, SpecSheetSection } from "@/components/ds/sheets/SpecSheet";
import { currentSpecSchema } from "@/lib/crm/specSchema";




export interface SpecVersionRow {
  section: string;
  parameter: string;
  symbol: string;
  unit: string;
  merged: boolean;
  isText: boolean;
  confidential: boolean;
  value: string;
  valueHot: string;
  valueCold: string;
  sort: number;
  columnLabels?: string[];
}

export interface SpecBuild {
  id: string;
  companyId: string;
  buildNo: number;
  
  name: string;
  
  dealId: string | null;
  createdByKey: string;
  createdAt: string;
}


export function buildTitle(b: SpecBuild): string {
  return b.name.trim() || `Deal #${b.buildNo}`;
}

export interface SpecVersion {
  id: string;
  buildId: string;
  label: string;
  rows: SpecVersionRow[];
  isFinal: boolean;
  
  partNo: string;
  sort: number;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}


export function specVersionTemplate(): SpecVersionRow[] {
  const schema = currentSpecSchema();
  return schema.fields.map((field,sort)=>({...field,columnLabels:[...schema.columns],confidential:false,value:"",valueHot:"",valueCold:"",sort}));
}

export function versionRowsToSections(rows: SpecVersionRow[]): SpecSheetSection[] {
  const ordered = [...rows].sort((a, b) => a.sort - b.sort);
  const sections: SpecSheetSection[] = [];
  const byName = new Map<string, SpecSheetSection>();
  for (const r of ordered) {
    let sec = byName.get(r.section);
    if (!sec) {
      sec = { name: r.section, rows: [] };
      byName.set(r.section, sec);
      sections.push(sec);
    }
    const row: SpecSheetRow = { columnLabels:r.columnLabels, param: r.parameter, symbol: r.symbol || undefined, unit: r.unit || undefined };
    if (r.isText) row.text = true;

    if (r.merged) {
      row.merged = true;
      row.value = r.value;
    } else {
      row.hot = r.valueHot;
      row.cold = r.valueCold;
    }
    sec.rows.push(row);
  }
  return sections;
}

function mapBuild(r: Record<string, unknown>): SpecBuild {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    buildNo: Number(r.build_no ?? 1),
    name: (r.name as string) ?? "",
    dealId: (r.deal_id as string) ?? null,
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  };
}

function mapVersion(r: Record<string, unknown>): SpecVersion {
  return {
    id: r.id as string,
    buildId: r.build_id as string,
    label: (r.label as string) ?? "Draft",
    rows: ((r.rows as Record<string, unknown>[]) ?? []).map((x, i) => ({
      columnLabels: x.columnLabels as string[] | undefined,
      section: (x.section as string) ?? "",
      parameter: (x.parameter as string) ?? "",
      symbol: (x.symbol as string) ?? "",
      unit: (x.unit as string) ?? "",
      merged: !!x.merged,
      isText: !!(x.isText ?? x.is_text),
      confidential: !!x.confidential,
      value: (x.value as string) ?? "",
      valueHot: (x.valueHot as string) ?? (x.value_hot as string) ?? "",
      valueCold: (x.valueCold as string) ?? (x.value_cold as string) ?? "",
      sort: x.sort == null ? i : Number(x.sort),
    })),
    isFinal: !!r.is_final,
    partNo: (r.part_no as string) ?? "",
    sort: r.sort == null ? 0 : Number(r.sort),
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}


export async function fetchSpecBuilds(companyId: string): Promise<{ builds: SpecBuild[]; versions: SpecVersion[] }> {
  const sb = createClient();
  const { data: bs, error: bErr } = await sb
    .from("spec_builds").select("*").eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (bErr) throw bErr;
  const builds = (bs ?? []).map(mapBuild);
  if (builds.length === 0) return { builds, versions: [] };
  const { data: vs, error: vErr } = await sb
    .from("spec_versions").select("*").in("build_id", builds.map((b) => b.id))
    .order("sort", { ascending: true }).order("created_at", { ascending: true });
  if (vErr) throw vErr;
  return { builds, versions: (vs ?? []).map(mapVersion) };
}

export async function insertSpecBuild(companyId: string, buildNo: number, meId: string, dealId?: string): Promise<SpecBuild> {
  const { data, error } = await createClient()
    .from("spec_builds")
    // deal_id 컬럼(2026-09-02 SQL) 미실행 DB 보호 — 값이 있을 때만 보낸다.
    .insert({ company_id: companyId, build_no: buildNo, created_by_key: meId, ...(dealId ? { deal_id: dealId } : {}) })
    .select("*").single();
  if (error) throw error;
  return mapBuild(data as Record<string, unknown>);
}

export async function updateSpecBuild(id: string, patch: { name: string }): Promise<SpecBuild> {
  const { data, error } = await createClient()
    .from("spec_builds").update({ name: patch.name }).eq("id", id).select("*").single();
  if (error) throw error;
  return mapBuild(data as Record<string, unknown>);
}

export async function deleteSpecBuild(id: string): Promise<void> {
  const { error } = await createClient().from("spec_builds").delete().eq("id", id);
  if (error) throw error;
}

export async function insertSpecVersion(buildId: string, label: string, rows: SpecVersionRow[], sort: number, meId: string): Promise<SpecVersion> {
  const { data, error } = await createClient()
    .from("spec_versions")
    .insert({ build_id: buildId, label, rows, sort, created_by_key: meId })
    .select("*").single();
  if (error) throw error;
  return mapVersion(data as Record<string, unknown>);
}

export async function updateSpecVersion(id: string, patch: Partial<Pick<SpecVersion, "label" | "rows" | "isFinal" | "partNo" | "buildId" | "sort">>): Promise<SpecVersion> {
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label != null) db.label = patch.label;
  if (patch.rows != null) db.rows = patch.rows;
  if (patch.isFinal != null) db.is_final = patch.isFinal;
  // 파트를 다른 딜(spec 컨테이너)로 이동할 때 사용
  if (patch.buildId != null) db.build_id = patch.buildId;
  if (patch.sort != null) db.sort = patch.sort;
  // part_no 컬럼(2026-09-02c SQL) 미실행 DB 보호 — 패치에 명시된 때만 보낸다.
  // 빈 문자열 = 코드 반납 (Unmark final 시 초기화, 다음 확정이 그 번호 재사용).
  if (patch.partNo !== undefined) db.part_no = patch.partNo || null;
  const { data, error } = await createClient()
    .from("spec_versions").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapVersion(data as Record<string, unknown>);
}

export async function deleteSpecVersion(id: string): Promise<void> {
  const { error } = await createClient().from("spec_versions").delete().eq("id", id);
  if (error) throw error;
}


export async function sendVersionToCrm(companyId: string, version: SpecVersion): Promise<number> {
  const sb = createClient();
  const { data, error } = await sb
    .from("company_specs")
    .select("id, parameter, merged")
    .eq("company_id", companyId);
  if (error) throw error;
  const byParam = new Map<string, { id: string; merged: boolean }>();
  for (const r of data ?? []) byParam.set(String(r.parameter).trim().toLowerCase(), { id: r.id as string, merged: !!r.merged });

  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  for (const row of version.rows) {
    if (row.confidential) continue; // 극비 파라미터는 CRM으로 나가지 않는다
    const target = byParam.get(row.parameter.trim().toLowerCase());
    if (!target) continue;
    updates.push(
      target.merged
        ? { id: target.id, patch: { value: row.merged ? row.value : row.valueHot } }
        : { id: target.id, patch: { value_hot: row.merged ? row.value : row.valueHot, value_cold: row.merged ? row.value : row.valueCold } },
    );
  }
  await Promise.all(updates.map((u) => sb.from("company_specs").update(u.patch).eq("id", u.id).then(({ error: e }) => { if (e) throw e; })));
  return updates.length;
}
