import { createClient } from "@/lib/supabase/client";
import { PARTY_CODE_RE, PO_PREFIX, nextScopedDocNo } from "@/lib/data/docNumbering";
import type { DocStatus, PoLineItem, Vendor, VendorPo } from "@/types/domain";




export const VENDOR_CODE_RE = PARTY_CODE_RE;


export type BilledPoLineItem = PoLineItem & { billed?: boolean };


export const VENDOR_CATEGORIES = [
  "LPBF Supplier",
  "Post Process",
  "CT / Metrology",
  "Test Lab",
  "Machining",
  "Customer",
  "Other",
] as const;


export function suggestVendorCode(name: string, existing: string[]): string {
  const STOP = new Set(["THE", "INC", "LLC", "LTD", "CO", "CORP", "CORPORATION", "COMPANY", "GMBH", "AG", "SA", "AND", "OF"]);
  const words = name.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  const cands: string[] = [];
  if (words.length >= 3) cands.push(words[0][0] + words[1][0] + words[2][0]);
  if (words.length >= 2) {
    cands.push(words[0][0] + words[1].slice(0, 2));
    cands.push(words[0].slice(0, 2) + words[1][0]);
  }
  if (words[0]) {
    cands.push(words[0].slice(0, 3));
    // 자음 위주 축약 (vendor→VND 같은) 도 후보로
    const cons = words[0].replace(/[AEIOU]/g, "");
    if (cons.length >= 3) cands.push(words[0][0] + cons.slice(1, 3));
  }
  for (const c of cands) {
    if (c.length === 3 && VENDOR_CODE_RE.test(c) && !existing.includes(c)) return c;
  }
  const base = ((words[0] ?? "XXX") + "XXX").slice(0, 3);
  for (let i = 65; i <= 90; i++) {
    const c = base.slice(0, 2) + String.fromCharCode(i);
    if (!existing.includes(c)) return c;
  }
  return base;
}


export async function fetchVendorCategories(): Promise<string[]> {
  const { data, error } = await createClient().from("app_settings").select("value").eq("key", "vendor_categories").maybeSingle();
  if (error) throw error;
  const v = data?.value as string[] | null;
  return Array.isArray(v) && v.length > 0 ? v.map(String) : [...VENDOR_CATEGORIES];
}

export async function saveVendorCategories(categories: string[]): Promise<void> {
  const { error } = await createClient()
    .from("app_settings")
    .upsert({ key: "vendor_categories", value: categories, updated_at: new Date().toISOString() });
  if (error) throw error;
}


export const VENDOR_REG_STATUSES = [
  "Prospect", "NDA Signed", "Under Audit", "Approved", "On Hold", "Disqualified",
] as const;

function mapVendor(r: Record<string, unknown>): Vendor {
  return {
    id: r.id as string,
    code: (r.code as string) ?? "",
    legalName: (r.legal_name as string) ?? "",
    category: (r.category as string) ?? "",
    address: (r.address as string) ?? "",
    contact: (r.contact as string) ?? "",
    email: (r.email as string) ?? "",
    phone: (r.phone as string) ?? "",
    memo: (r.memo as string) ?? "",
    country: (r.country as string) ?? "",
    registrationStatus: (r.registration_status as string) ?? "",
    capability: (r.capability as string) ?? "",
    materials: (r.materials as string) ?? "",
    leadTimeDays: r.lead_time_days == null ? null : Number(r.lead_time_days),
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}

function mapPo(r: Record<string, unknown>): VendorPo {
  return {
    id: r.id as string,
    vendorId: r.vendor_id as string,
    companyId: (r.company_id as string) ?? null,
    buildId: (r.build_id as string) ?? null,
    dealId: (r.deal_id as string) ?? null,
    poNo: (r.po_no as string) ?? null,
    status: (r.status as DocStatus) ?? "draft",
    issueDate: (r.issue_date as string) ?? null,
    currency: (r.currency as string) ?? "USD",
    paymentTerms: (r.payment_terms as string) ?? "",
    shippingTerms: (r.shipping_terms as string) ?? "",
    shipTo: (r.ship_to as string) ?? "",
    projectRef: (r.project_ref as string) ?? "",
    lineItems: ((r.line_items as Record<string, unknown>[]) ?? []).map((li): BilledPoLineItem => ({
      description: (li.description as string) ?? "",
      qty: Number(li.qty ?? 0),
      unit: (li.unit as string) ?? "pcs",
      unitPrice: Number(li.unit_price ?? li.unitPrice ?? 0),
      amount: Number(li.amount ?? 0),
      delivery: (li.delivery as string) ?? "",
      billed: li.billed !== false,
    })),
    subtotal: r.subtotal == null ? null : Number(r.subtotal),
    shipping: r.shipping == null ? null : Number(r.shipping),
    tax: r.tax == null ? null : Number(r.tax),
    total: r.total == null ? null : Number(r.total),
    terms: (r.terms as string) ?? "",
    extraTerms: (r.extra_terms as string) ?? "",
    memo: (r.memo as string) ?? "",
    approvalStatus: ((r.approval_status as string) ?? "none") as VendorPo["approvalStatus"],
    approvalRequestedBy: (r.approval_requested_by as string) ?? "",
    approvalDecidedBy: (r.approval_decided_by as string) ?? "",
    approvalDecidedAt: (r.approval_decided_at as string) ?? null,
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}

function lineItemsDb(items: BilledPoLineItem[]): Record<string, unknown>[] {
  return items.map((li) => ({
    description: li.description,
    qty: li.qty,
    unit: li.unit || "pcs",
    unit_price: li.unitPrice,
    amount: li.amount,
    delivery: li.delivery ?? "",
    billed: li.billed !== false,
  }));
}


export function poTotals(items: BilledPoLineItem[], shipping: number, tax: number): { subtotal: number; total: number } {
  const round = (n: number) => Math.round(n * 100) / 100;
  const subtotal = round(items.reduce((a, li) => a + (li.billed !== false ? li.amount : 0), 0));
  return { subtotal, total: round(subtotal + (shipping || 0) + (tax || 0)) };
}

export async function fetchVendors(): Promise<Vendor[]> {
  const { data, error } = await createClient().from("vendors").select("*").order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapVendor);
}

export async function fetchVendorPos(): Promise<VendorPo[]> {
  const { data, error } = await createClient().from("vendor_pos").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPo);
}


export async function fetchPoPartsMap(): Promise<Record<string, { partId: string; partCode: string }[]>> {
  const { data, error } = await createClient()
    .from("po_parts")
    .select("po_id, part_id, registry_parts(part_code)");
  if (error) throw error;
  const map: Record<string, { partId: string; partCode: string }[]> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const rp = r.registry_parts as { part_code?: string } | null;
    (map[r.po_id as string] ??= []).push({ partId: r.part_id as string, partCode: rp?.part_code ?? "?" });
  }
  return map;
}


export async function savePoParts(poId: string, partIds: string[]): Promise<void> {
  const { error } = await createClient().rpc("replace_po_parts", {
    target_po_id: poId,
    selected_part_ids: partIds,
  });
  if (error) throw error;
}

export interface VendorInput {
  code: string;
  legalName: string;
  category: string;
  address: string;
  contact: string;
  email: string;
  phone: string;
  memo: string;
  country: string;
  registrationStatus: string;
  capability: string;
  materials: string;
  leadTimeDays: number | null;
}

export async function insertVendor(input: VendorInput): Promise<Vendor> {
  const { data, error } = await createClient()
    .from("vendors")
    .insert({
      code: input.code.toUpperCase(),
      legal_name: input.legalName,
      category: input.category,
      address: input.address,
      contact: input.contact,
      email: input.email,
      phone: input.phone,
      memo: input.memo,
      country: input.country,
      registration_status: input.registrationStatus,
      capability: input.capability,
      materials: input.materials,
      lead_time_days: input.leadTimeDays,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapVendor(data as Record<string, unknown>);
}

export async function updateVendor(id: string, patch: Partial<Vendor>): Promise<Vendor> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.legalName !== undefined) row.legal_name = patch.legalName;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.contact !== undefined) row.contact = patch.contact;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.memo !== undefined) row.memo = patch.memo;
  if (patch.country !== undefined) row.country = patch.country;
  if (patch.registrationStatus !== undefined) row.registration_status = patch.registrationStatus;
  if (patch.capability !== undefined) row.capability = patch.capability;
  if (patch.materials !== undefined) row.materials = patch.materials;
  if (patch.leadTimeDays !== undefined) row.lead_time_days = patch.leadTimeDays;
  const { data, error } = await createClient().from("vendors").update(row).eq("id", id).select("*").single();
  if (error) throw error;
  return mapVendor(data as Record<string, unknown>);
}


export async function deleteVendor(id: string): Promise<void> {
  const { error } = await createClient().from("vendors").delete().eq("id", id);
  if (error) throw error;
}

export interface VendorPoInput {
  vendorId: string;
  
  companyId?: string | null;
  buildId?: string | null;
  dealId?: string | null;
  currency: string;
  paymentTerms: string;
  shippingTerms: string;
  shipTo: string;
  projectRef: string;
  lineItems: BilledPoLineItem[];
  shipping: number;
  tax: number;
  terms: string;
  extraTerms?: string;
  memo: string;
  createdByKey: string;
}

export async function insertVendorPo(input: VendorPoInput): Promise<VendorPo> {
  const t = poTotals(input.lineItems, input.shipping, input.tax);
  const { data, error } = await createClient()
    .from("vendor_pos")
    .insert({
      vendor_id: input.vendorId,
      ...(input.companyId !== undefined ? { company_id: input.companyId } : {}),
      ...(input.buildId !== undefined ? { build_id: input.buildId } : {}),
      ...(input.dealId ? { deal_id: input.dealId } : {}),
      currency: input.currency,
      payment_terms: input.paymentTerms,
      shipping_terms: input.shippingTerms,
      ship_to: input.shipTo,
      project_ref: input.projectRef,
      line_items: lineItemsDb(input.lineItems),
      subtotal: t.subtotal,
      shipping: input.shipping,
      tax: input.tax,
      total: t.total,
      terms: input.terms,
      // extra_terms 컬럼(2026-08-21d SQL) 미실행 DB에서도 기본 등록이 깨지지 않게 값이 있을 때만 보낸다.
      ...(input.extraTerms?.trim() ? { extra_terms: input.extraTerms } : {}),
      memo: input.memo,
      created_by_key: input.createdByKey,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapPo(data as Record<string, unknown>);
}

export async function updateVendorPo(id: string, patch: Partial<VendorPo>): Promise<VendorPo> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.vendorId !== undefined) row.vendor_id = patch.vendorId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.poNo !== undefined) row.po_no = patch.poNo;
  if (patch.issueDate !== undefined) row.issue_date = patch.issueDate;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms;
  if (patch.shippingTerms !== undefined) row.shipping_terms = patch.shippingTerms;
  if (patch.shipTo !== undefined) row.ship_to = patch.shipTo;
  if (patch.projectRef !== undefined) row.project_ref = patch.projectRef;
  if (patch.companyId !== undefined) row.company_id = patch.companyId;
  if (patch.buildId !== undefined) row.build_id = patch.buildId;
  if (patch.dealId !== undefined) row.deal_id = patch.dealId;
  if (patch.shipping !== undefined) row.shipping = patch.shipping;
  if (patch.tax !== undefined) row.tax = patch.tax;
  if (patch.terms !== undefined) row.terms = patch.terms;
  if (patch.extraTerms !== undefined) row.extra_terms = patch.extraTerms;
  if (patch.memo !== undefined) row.memo = patch.memo;
  if (patch.approvalStatus !== undefined) row.approval_status = patch.approvalStatus;
  if (patch.approvalRequestedBy !== undefined) row.approval_requested_by = patch.approvalRequestedBy;
  if (patch.approvalDecidedBy !== undefined) row.approval_decided_by = patch.approvalDecidedBy;
  if (patch.approvalDecidedAt !== undefined) row.approval_decided_at = patch.approvalDecidedAt;
  // Money follows the line items, so callers send lineItems + shipping + tax together.
  if (patch.lineItems !== undefined) {
    row.line_items = lineItemsDb(patch.lineItems);
    const t = poTotals(patch.lineItems, patch.shipping ?? 0, patch.tax ?? 0);
    row.subtotal = t.subtotal;
    row.total = t.total;
  }
  const { data, error } = await createClient().from("vendor_pos").update(row).eq("id", id).select("*").single();
  if (error) throw error;
  return mapPo(data as Record<string, unknown>);
}

export async function deleteVendorPo(id: string, poNo?: string | null): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("vendor_pos").delete().eq("id", id);
  if (error) throw error;
  // 지운 PO가 그 벤더의 "마지막" 채번이면 카운터를 되돌려 번호를 재사용한다.
  // (중간 번호 삭제는 회수 불가 — 이미 다음 번호가 나갔으므로 그대로 둔다.)
  const m = poNo?.match(/^DOC-([A-Z]{3})-(\d{4})-(\d{3})$/);
  if (!m) return;
  const nnn = Number(m[3]);
  const { error: cErr } = await sb
    .from("doc_counters")
    .update({ last_nnn: nnn - 1 })
    .eq("scope", `${PO_PREFIX}|${m[1]}`)
    .eq("year", Number(m[2]))
    .eq("last_nnn", nnn);
  if (cErr) console.error("doc counter give-back failed:", cErr);
}


export async function nextPoNo(vendorCode: string): Promise<string> {
  return nextScopedDocNo(PO_PREFIX, vendorCode);
}


export async function issueVendorPo(po: VendorPo, vendorCode: string): Promise<VendorPo> {
  const poNo = po.poNo ?? (await nextPoNo(vendorCode));
  const today = new Date();
  const issueDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return updateVendorPo(po.id, { status: "issued", poNo, issueDate: po.issueDate ?? issueDate });
}
