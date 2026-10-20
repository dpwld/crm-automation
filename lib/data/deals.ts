import { createClient } from "@/lib/supabase/client";
import { PARTY_CODE_RE, nextScopedDocNo } from "@/lib/data/docNumbering";



export type DealKind = "inhouse" | "new" | "reorder";
export type DealStatus =
  | "first_contact" | "nda"
  | "spec" | "quoting" | "customer_po" | "manufacturing" | "testing"
  | "adopted" | "invoiced" | "shipping" | "aftercare" | "closed";

export const DEAL_KIND_LABEL: Record<DealKind, string> = {
  inhouse: "In-house",
  new: "New deal",
  reorder: "Reorder",
};

export const DEAL_STATUS_ORDER: DealStatus[] = [
  "first_contact", "nda",
  "spec", "quoting", "customer_po", "manufacturing", "testing",
  "adopted", "invoiced", "shipping", "aftercare", "closed",
];
export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  first_contact: "First contact",
  nda: "NDA",
  spec: "Spec",
  quoting: "Quoting",
  customer_po: "Customer PO",
  manufacturing: "Manufacturing",
  testing: "Testing",
  adopted: "Adopted",
  invoiced: "Invoiced",
  shipping: "Shipping",
  aftercare: "Aftercare",
  closed: "Closed",
};

export const SALES_STAGE_ORDER = ["first_contact", "nda", "spec", "quoting", "customer_po", "invoiced", "closed"] as const;
export type SalesStage = (typeof SALES_STAGE_ORDER)[number];
export const SALES_STAGE_LABEL: Record<SalesStage, string> = {
  first_contact: "First contact",
  nda: "NDA",
  spec: "Spec sheet",
  quoting: "Quotation",
  customer_po: "Customer PO",
  invoiced: "Invoice",
  closed: "Done",
};

export function salesStageOf(status: DealStatus): SalesStage {
  if (status === "manufacturing" || status === "testing" || status === "adopted") return "customer_po";
  if (status === "shipping" || status === "aftercare") return "invoiced";
  return status as SalesStage;
}

export function execBadgeOf(status: DealStatus): string {
  return ["manufacturing", "testing", "adopted", "shipping", "aftercare"].includes(status)
    ? DEAL_STATUS_LABEL[status]
    : "";
}


export const INHOUSE_STATUS: DealStatus[] = ["spec", "manufacturing", "testing", "closed"];

export interface Deal {
  id: string;
  dealNo: string;
  companyId: string | null;
  kind: DealKind;
  title: string;
  status: DealStatus;
  ownerKey: string;
  notes: string;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}


export interface DealSummary extends Deal {
  partCount: number;
  vendorPoCount: number;
  docCounts: Record<string, number>; // docType → count (quotation/purchase_order/invoice)
  
  quoteTotal: number | null;
  quoteCurrency: string;
  
  invoiceTotal: number | null;
  invoiceCurrency: string;
}


export function dealValueOf(d: DealSummary): { amount: number; currency: string; source: "invoice" | "quote" } | null {
  if (d.invoiceTotal != null) return { amount: d.invoiceTotal, currency: d.invoiceCurrency, source: "invoice" };
  if (d.quoteTotal != null) return { amount: d.quoteTotal, currency: d.quoteCurrency, source: "quote" };
  return null;
}

function mapDeal(r: Record<string, unknown>): Deal {
  return {
    id: r.id as string,
    dealNo: (r.deal_no as string) ?? "",
    companyId: (r.company_id as string) ?? null,
    kind: ((r.kind as string) ?? "new") as DealKind,
    title: (r.title as string) ?? "",
    status: ((r.status as string) ?? "spec") as DealStatus,
    ownerKey: (r.owner_key as string) ?? "",
    notes: (r.notes as string) ?? "",
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}


export async function fetchDealSummaries(companyId?: string): Promise<DealSummary[]> {
  const sb = createClient();
  let q = sb.from("deals").select("*").order("created_at", { ascending: false });
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) throw error;
  const deals = (data ?? []).map(mapDeal);
  if (deals.length === 0) return [];
  const ids = deals.map((d) => d.id);

  const [parts, pos, docs] = await Promise.all([
    sb.from("deal_parts").select("deal_id").in("deal_id", ids),
    sb.from("vendor_pos").select("deal_id").in("deal_id", ids),
    sb.from("company_documents").select("deal_id, doc_type, status, total, currency, created_at").in("deal_id", ids).order("created_at", { ascending: false }),
  ]);
  if (parts.error) throw parts.error;
  if (pos.error) throw pos.error;
  if (docs.error) throw docs.error;
  const count = (rows: { deal_id: string | null }[] | null) => {
    const by: Record<string, number> = {};
    for (const r of rows ?? []) if (r.deal_id) by[r.deal_id] = (by[r.deal_id] ?? 0) + 1;
    return by;
  };
  const partBy = count((parts.data as { deal_id: string }[]) ?? []);
  const poBy = count((pos.data as { deal_id: string }[]) ?? []);
  const docBy: Record<string, Record<string, number>> = {};
  const quoteBy: Record<string, { total: number; currency: string }> = {};
  const invoiceBy: Record<string, { total: number; currency: string }> = {};
  for (const r of (docs.data as { deal_id: string; doc_type: string; status?: string; total?: number | null; currency?: string }[]) ?? []) {
    if (!r.deal_id) continue;
    (docBy[r.deal_id] ??= {})[r.doc_type] = (docBy[r.deal_id]?.[r.doc_type] ?? 0) + 1;
    // 최신순 정렬이므로 첫 유효 견적/인보이스가 그 딜의 대표 금액
    if (r.doc_type === "quotation" && r.status !== "void" && r.total != null && !quoteBy[r.deal_id]) {
      quoteBy[r.deal_id] = { total: Number(r.total), currency: r.currency ?? "USD" };
    }
    if (r.doc_type === "invoice" && r.status !== "void" && r.total != null && !invoiceBy[r.deal_id]) {
      invoiceBy[r.deal_id] = { total: Number(r.total), currency: r.currency ?? "USD" };
    }
  }
  return deals.map((d) => ({
    ...d,
    partCount: partBy[d.id] ?? 0,
    vendorPoCount: poBy[d.id] ?? 0,
    docCounts: docBy[d.id] ?? {},
    quoteTotal: quoteBy[d.id]?.total ?? null,
    quoteCurrency: quoteBy[d.id]?.currency ?? "USD",
    invoiceTotal: invoiceBy[d.id]?.total ?? null,
    invoiceCurrency: invoiceBy[d.id]?.currency ?? "USD",
  }));
}


export async function fetchDealsLight(): Promise<{ id: string; dealNo: string; title: string; companyId: string | null }[]> {
  const { data, error } = await createClient()
    .from("deals").select("id, deal_no, title, company_id").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string, dealNo: (r.deal_no as string) ?? "", title: (r.title as string) ?? "",
    companyId: (r.company_id as string) ?? null,
  }));
}



export interface DealPartLink {
  partId: string;
  role: string;
  partCode: string;
  customer: string;
  internalLabel: string;
}
export interface DealDetail {
  parts: DealPartLink[];
  pos: { id: string; poNo: string | null; status: string; total: number | null; currency: string; vendorId: string }[];
  docs: { id: string; docType: string; docNo: string | null; status: string; total: number | null; currency: string }[];
}

export async function fetchDealDetail(dealId: string): Promise<DealDetail> {
  const sb = createClient();
  const [links, pos, docs] = await Promise.all([
    sb.from("deal_parts").select("part_id, role, registry_parts(part_code, customer, internal_label)").eq("deal_id", dealId),
    sb.from("vendor_pos").select("id, po_no, status, total, currency, vendor_id").eq("deal_id", dealId).order("created_at", { ascending: false }),
    sb.from("company_documents").select("id, doc_type, doc_no, status, total, currency").eq("deal_id", dealId).order("updated_at", { ascending: false }),
  ]);
  if (links.error) throw links.error;
  if (pos.error) throw pos.error;
  if (docs.error) throw docs.error;
  return {
    parts: (links.data ?? []).map((r) => {
      const rp = r.registry_parts as unknown as { part_code?: string; customer?: string; internal_label?: string } | null;
      return {
        partId: r.part_id as string,
        role: (r.role as string) ?? "",
        partCode: rp?.part_code ?? "?",
        customer: rp?.customer ?? "",
        internalLabel: rp?.internal_label ?? "",
      };
    }),
    pos: (pos.data ?? []).map((r) => ({
      id: r.id as string, poNo: (r.po_no as string) ?? null, status: (r.status as string) ?? "draft",
      total: r.total == null ? null : Number(r.total), currency: (r.currency as string) ?? "USD", vendorId: r.vendor_id as string,
    })),
    docs: (docs.data ?? []).map((r) => ({
      id: r.id as string, docType: (r.doc_type as string) ?? "", docNo: (r.doc_no as string) ?? null,
      status: (r.status as string) ?? "draft", total: r.total == null ? null : Number(r.total), currency: (r.currency as string) ?? "USD",
    })),
  };
}

export async function linkDealPart(dealId: string, partId: string, role: string): Promise<void> {
  const { error } = await createClient().from("deal_parts").upsert({ deal_id: dealId, part_id: partId, role });
  if (error) throw error;
}

export async function unlinkDealPart(dealId: string, partId: string): Promise<void> {
  const { error } = await createClient().from("deal_parts").delete().eq("deal_id", dealId).eq("part_id", partId);
  if (error) throw error;
}

export interface NewDeal {
  kind: DealKind;
  companyId: string | null; // 인하우스 딜도 In-house 회사(cc94c409…) 소속으로 만든다
  
  partyCode?: string;
  title: string;
  ownerKey: string;
}


export async function insertDeal(input: NewDeal, meId: string): Promise<Deal> {
  const sb = createClient();
  const code = (input.partyCode ?? "").trim().toUpperCase();
  let no = "";
  let reused = false;
  if (PARTY_CODE_RE.test(code)) {
    // 삭제로 비게 된 번호 재사용 — 카운터(last_nnn) 이하에서 안 쓰는 최소 번호부터 이어 쓴다.
    const yyyy = new Date().getFullYear();
    const prefix = `${code}-${yyyy}-`;
    try {
      const [{ data: rows }, { data: ctr }] = await Promise.all([
        sb.from("deals").select("deal_no").like("deal_no", `${prefix}%`),
        sb.from("doc_counters").select("last_nnn").eq("scope", `${code}|D`).eq("year", yyyy).maybeSingle(),
      ]);
      const used = new Set(
        (rows ?? [])
          .map((r) => parseInt(String(r.deal_no).slice(prefix.length), 10))
          .filter((n) => !Number.isNaN(n)),
      );
      const last = Number(ctr?.last_nnn ?? 0);
      for (let n = 1; n <= last; n++) {
        if (!used.has(n)) {
          no = `${prefix}${String(n).padStart(3, "0")}`;
          reused = true;
          break;
        }
      }
    } catch {  }
    if (!no) no = (await nextScopedDocNo(code, "D")).replace("-D-", "-");
  } else {
    const { data, error: noErr } = await sb.rpc("next_deal_no");
    if (noErr) throw noErr;
    no = data as string;
  }
  const row = (dealNo: string) => ({
    deal_no: dealNo,
    kind: input.kind,
    company_id: input.companyId,
    title: input.title,
    // 신규 딜은 첫 컨택부터 (2026-09-16 v3) — 재주문·인하우스는 첫 접촉을 반복하지 않는다.
    // 2026-09-16 프로세스 확정: 첫 컨택·NDA는 회사 레벨, 딜은 Spec sheet에서 생성된다.
    status: input.kind === "reorder" ? "quoting" : "spec",
    owner_key: input.ownerKey,
    created_by_key: meId,
  });
  let { data, error } = await sb.from("deals").insert(row(no)).select("*").single();
  if (error && reused && error.code === "23505") {
    // 동시에 같은 반납 번호를 집은 경우 — 새 번호로 1회 재시도.
    no = (await nextScopedDocNo(code, "D")).replace("-D-", "-");
    ({ data, error } = await sb.from("deals").insert(row(no)).select("*").single());
  }
  if (error) throw error;
  return mapDeal(data as Record<string, unknown>);
}


export async function advanceDeal(dealId: string, to: DealStatus): Promise<Deal | null> {
  const sb = createClient();
  const { data, error } = await sb.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (error || !data) return null;
  const cur = mapDeal(data as Record<string, unknown>);
  if (DEAL_STATUS_ORDER.indexOf(to) <= DEAL_STATUS_ORDER.indexOf(cur.status)) return null;
  return updateDeal(dealId, { status: to });
}

export async function updateDeal(id: string, patch: Partial<Pick<Deal, "status" | "title" | "ownerKey" | "notes" | "companyId">>): Promise<Deal> {
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.title !== undefined) db.title = patch.title;
  if (patch.ownerKey !== undefined) db.owner_key = patch.ownerKey;
  if (patch.notes !== undefined) db.notes = patch.notes;
  if (patch.companyId !== undefined) db.company_id = patch.companyId;
  const { data, error } = await createClient()
    .from("deals").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapDeal(data as Record<string, unknown>);
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await createClient().from("deals").delete().eq("id", id);
  if (error) throw error;
}
