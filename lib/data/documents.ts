import { createClient } from "@/lib/supabase/client";
import type { CompanyDocument, DocLineItem, DocStatus, DocType } from "@/types/domain";



const DOC_PREFIX: Record<DocType, string> = { quotation: "Q", purchase_order: "PO", invoice: "INV" };

function mapDocument(r: Record<string, unknown>): CompanyDocument {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    dealId: (r.deal_id as string) ?? null,
    docType: r.doc_type as DocType,
    docNo: (r.doc_no as string) ?? null,
    status: r.status as DocStatus,
    issueDate: (r.issue_date as string) ?? null,
    validUntil: (r.valid_until as string) ?? null,
    currency: (r.currency as string) ?? "USD",
    lineItems: ((r.line_items as Record<string, unknown>[]) ?? []).map((li) => ({
      name: (li.name as string) ?? "",
      qty: Number(li.qty ?? 0),
      unit: (li.unit as string) || undefined,
      unitPrice: Number(li.unit_price ?? li.unitPrice ?? 0),
      amount: Number(li.amount ?? 0),
      note: (li.note as string) || undefined,
      // 필드가 없는 기존 문서는 전부 billed 취급 (false로 저장된 것만 참고 라인)
      billed: li.billed === false ? false : undefined,
      imagePath: (li.image_path as string) || undefined,
    })),
    amount: r.amount == null ? null : Number(r.amount),
    tax: r.tax == null ? null : Number(r.tax),
    total: r.total == null ? null : Number(r.total),
    incoterms: (r.incoterms as string) ?? "",
    paymentTerms: (r.payment_terms as string) ?? "",
    billTo: (r.bill_to as string) ?? "",
    shipTo: (r.ship_to as string) ?? "",
    projectRef: (r.project_ref as string) ?? "",
    discountPct: r.discount_pct == null ? 0 : Number(r.discount_pct),
    taxRate: r.tax_rate == null ? 0 : Number(r.tax_rate),
    terms: (r.terms as string) ?? "",
    memo: (r.memo as string) ?? "",
    fromAddr: ((r.from_addr as string) === "kr" ? "kr" : "us"),
    linkedDocId: (r.linked_doc_id as string) ?? null,
    revisionOf: (r.revision_of as string) ?? null,
    revision: r.revision == null ? 1 : Number(r.revision),
    createdByKey: (r.created_by_key as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}

function lineItemsDb(items: DocLineItem[]): Record<string, unknown>[] {
  return items.map((li) => ({
    name: li.name, qty: li.qty, unit: li.unit ?? "pcs", unit_price: li.unitPrice, amount: li.amount, note: li.note ?? "",
    billed: li.billed !== false, image_path: li.imagePath ?? "",
  }));
}


export function documentTotals(
  items: DocLineItem[],
  discountPct: number,
  taxRate: number,
): { subtotal: number; discount: number; net: number; tax: number; total: number } {
  const round = (n: number) => Math.round(n * 100) / 100;
  const subtotal = round(items.reduce((a, li) => a + (li.billed === false ? 0 : li.amount), 0));
  const discount = round((subtotal * (discountPct || 0)) / 100);
  const net = round(subtotal - discount);
  const tax = round((net * (taxRate || 0)) / 100);
  return { subtotal, discount, net, tax, total: round(net + tax) };
}


export async function fetchDocuments(companyId: string): Promise<CompanyDocument[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("company_documents")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDocument);
}

export interface DocumentInput {
  companyId: string;
  dealId?: string | null;
  docType: DocType;
  currency?: string;
  lineItems?: DocLineItem[];
  validUntil?: string | null;
  incoterms?: string;
  paymentTerms?: string;
  billTo?: string;
  shipTo?: string;
  projectRef?: string;
  discountPct?: number;
  taxRate?: number;
  terms?: string;
  memo?: string;
  fromAddr?: "us" | "kr";
  
  revisionOf?: string | null;
  revision?: number;
  
  docNo?: string | null;
  status?: DocStatus;
  issueDate?: string | null;
  linkedDocId?: string | null;
  createdByKey: string;
}

export async function insertDocument(input: DocumentInput): Promise<CompanyDocument> {
  const items = input.lineItems ?? [];
  const t = documentTotals(items, input.discountPct ?? 0, input.taxRate ?? 0);
  const sb = createClient();
  const { data, error } = await sb
    .from("company_documents")
    .insert({
      company_id: input.companyId,
      doc_type: input.docType,
      currency: input.currency ?? "USD",
      line_items: lineItemsDb(items),
      amount: t.subtotal,
      tax: t.tax,
      total: t.total,
      valid_until: input.validUntil ?? null,
      incoterms: input.incoterms ?? "",
      payment_terms: input.paymentTerms ?? "",
      bill_to: input.billTo ?? "",
      ship_to: input.shipTo ?? "",
      project_ref: input.projectRef ?? "",
      discount_pct: input.discountPct ?? 0,
      tax_rate: input.taxRate ?? 0,
      terms: input.terms ?? "",
      memo: input.memo ?? "",
      from_addr: input.fromAddr ?? "us",
      ...(input.dealId ? { deal_id: input.dealId } : {}),
      ...(input.revisionOf ? { revision_of: input.revisionOf, revision: input.revision ?? 2 } : {}),
      ...(input.docNo ? { doc_no: input.docNo } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.issueDate ? { issue_date: input.issueDate } : {}),
      ...(input.linkedDocId ? { linked_doc_id: input.linkedDocId } : {}),
      created_by_key: input.createdByKey,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapDocument(data);
}

export async function updateDocument(id: string, patch: Partial<CompanyDocument>): Promise<CompanyDocument> {
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status != null) db.status = patch.status;
  if (patch.docNo !== undefined) db.doc_no = patch.docNo;
  if (patch.issueDate !== undefined) db.issue_date = patch.issueDate;
  if (patch.validUntil !== undefined) db.valid_until = patch.validUntil;
  if (patch.currency != null) db.currency = patch.currency;
  if (patch.incoterms != null) db.incoterms = patch.incoterms;
  if (patch.paymentTerms != null) db.payment_terms = patch.paymentTerms;
  if (patch.billTo != null) db.bill_to = patch.billTo;
  if (patch.shipTo != null) db.ship_to = patch.shipTo;
  if (patch.projectRef != null) db.project_ref = patch.projectRef;
  if (patch.discountPct != null) db.discount_pct = patch.discountPct;
  if (patch.taxRate != null) db.tax_rate = patch.taxRate;
  // Money is recomputed from the line items whenever they are part of the patch,
  // so callers send lineItems + discountPct + taxRate together (the editor does).
  if (patch.lineItems != null) {
    db.line_items = lineItemsDb(patch.lineItems);
    const t = documentTotals(patch.lineItems, patch.discountPct ?? 0, patch.taxRate ?? 0);
    db.amount = t.subtotal;
    db.tax = t.tax;
    db.total = t.total;
  }
  if (patch.tax !== undefined) db.tax = patch.tax;
  if (patch.terms != null) db.terms = patch.terms;
  if (patch.memo != null) db.memo = patch.memo;
  if (patch.dealId !== undefined) db.deal_id = patch.dealId;
  // linked_doc_id 컬럼(2026-09-02d SQL) 미실행 DB 보호 — 패치될 때만 보낸다.
  if (patch.linkedDocId !== undefined) db.linked_doc_id = patch.linkedDocId;
  if (patch.fromAddr != null) db.from_addr = patch.fromAddr;

  const sb = createClient();
  const { data, error } = await sb.from("company_documents").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapDocument(data);
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await createClient().from("company_documents").delete().eq("id", id);
  if (error) throw error;
}


export async function nextDocNo(docType: DocType): Promise<string> {
  const year = new Date().getFullYear();
  const sb = createClient();
  const { count, error } = await sb
    .from("company_documents")
    .select("id", { count: "exact", head: true })
    .eq("doc_type", docType)
    .not("doc_no", "is", null)
    .like("doc_no", `DOC-${DOC_PREFIX[docType]}-${year}-%`);
  if (error) throw error;
  return `DOC-${DOC_PREFIX[docType]}-${year}-${String((count ?? 0) + 1).padStart(3, "0")}`;
}


export async function sendInvoiceToFinance(doc: CompanyDocument, companyName: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("tax_invoices").upsert(
    {
      direction: "sale",
      issue_date: doc.issueDate ?? new Date().toISOString().slice(0, 10),
      counterparty_name: companyName,
      item: doc.lineItems.map((li) => li.name).filter(Boolean).join(", ").slice(0, 200) || doc.docNo || "CRM invoice",
      supply_amount: doc.amount ?? 0,
      tax_amount: doc.tax ?? 0,
      total_amount: doc.total ?? doc.amount ?? 0,
      source_file: `crm:${doc.docNo ?? doc.id}`,
      dedupe_key: `crm|${doc.id}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: false },
  );
  if (error) throw error;
}
