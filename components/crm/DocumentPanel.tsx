import {QUOTATION_TERMS} from '@/lib/config/company';
import {readJson} from '@/lib/http';
"use client";

import { useState, useEffect, useRef } from "react";
import { useDraftHistory } from "@/lib/hooks/useDraftHistory";
import { ActionsMenu } from "./ActionsMenu";
import { EditorActions, editorKeys } from "./EditorActions";
import { Banknote, BookMarked, ChevronDown, ChevronUp, Copy, Eye, FilePlus2, Image as ImageIcon, Link2, Mail, Pencil, Printer, Plus, Send, Settings2, Sparkles, Trash2, Upload, Wrench, X } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Modal } from "@/components/ds/feedback/Modal";
import { Spinner } from "@/components/ds/core/Spinner";
import { Badge } from "@/components/ds/core/Badge";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Checkbox } from "@/components/ds/forms/Checkbox";
import { fetchDealsLight } from "@/lib/data/deals";
import { Textarea } from "@/components/ds/forms/Textarea";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import { documentTotals } from "@/lib/data/documents";
import { deactivateCatalogItem, fetchCatalog, insertCatalogItem } from "@/lib/data/catalog";
import { fetchBuilds, fetchBuildFiles } from "@/lib/data/builds";
import { lineItemImageUrl, uploadDocItemImage } from "@/lib/data/docs";
import { fetchCompanyAddress } from "@/lib/data/crm";
import { orgForPrint } from "@/lib/data/org";
import { buildDocumentHtml, printDocument } from "@/lib/export/documentPrint";
import { buildDocumentPdfAttachment, documentPdfFilename } from "@/lib/export/documentPdf";
import { fetchCompanyContactEmails } from "@/lib/data/customers";
import type { EmailAttachment } from "@/lib/mentions";
import { EmailComposerModal } from "@/components/crm/EmailComposerModal";
import { CatalogManagerModal } from "@/components/crm/CatalogManagerModal";
import type { Build, CatalogItem, CompanyDocument, DocLineItem, DocStatus, DocType } from "@/types/domain";
import { DL, PAYMENT_TERMS } from "@/lib/formOptions";

/** 빌드 modelSpec({section:{param:value}})을 견적 라인 설명으로 압축. */
export function buildSpecDescription(build: Build): string {
  const lines: string[] = [build.modelCode];
  for (const [section, params] of Object.entries(build.modelSpec ?? {})) {
    const filled = Object.entries(params).filter(([, v]) => (v ?? "").trim());
    if (!filled.length) continue;
    lines.push(`${section}: ${filled.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  return lines.filter(Boolean).join("\n");
}

export const DOC_LABEL: Record<DocType, string> = {
  quotation: "Quotation",
  purchase_order: "Purchase Order",
  invoice: "Invoice",
};

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "danger"> = {
  draft: "neutral",
  issued: "info",
  accepted: "success",
  void: "danger",
};

function money(n: number | null, currency: string): string {
  if (n == null) return "N/A";
  return `${currency === "KRW" ? "₩" : currency === "USD" ? "$" : `${currency} `}${n.toLocaleString("en-US")}`;
}

export interface DocFormValue {
  lineItems: DocLineItem[];
  currency: string;
  validUntil: string | null;
  incoterms: string;
  paymentTerms: string;
  /** QUOTE FOR block — customer name + address, multi-line. */
  billTo: string;
  shipTo: string;
  projectRef: string;
  discountPct: number;
  taxRate: number;
  terms: string;
  memo: string;
  /** 발신(당사) 주소 — 'us' 본사 / 'kr' 한국지사. */
  fromAddr: "us" | "kr";
  /** 커머셜 스파인 — 이 문서가 속한 딜 ("" = 없음). */
  dealId: string;
  /** 고객 PO 전용 — 고객사 문서번호 (수정 가능). */
  poNo?: string;
  /** 고객 PO 전용 — 근거 견적 문서 id ("" = 없음). */
  linkedDocId?: string;
  /** 발행 문서의 발행일 — 편집 가능 (2026-09-17 지시). draft는 Issue 시점에 자동 기재. */
  issueDate?: string | null;
}

/** 고객 PO 접수·인보이스 생성 시 문서에 붙는 메타 (draft가 아닌 상태로 저장). */
export interface DocCreateMeta {
  docNo?: string | null;
  status?: DocStatus;
  issueDate?: string | null;
  linkedDocId?: string | null;
}

/** The seven clauses of the standard Workspace quotation T&C, inserted by button
   so the CEO can trim or extend them per deal. */
export const STANDARD_TERMS = "";

const emptyLine = (): DocLineItem => ({ name: "", qty: 1, unit: "pcs", unitPrice: 0, amount: 0 });

/** /api/doc-intake 응답 — 리뷰 모달에서 사람이 Apply해야만 draft가 된다. */
interface DocIntakeResult {
  lineItems: { name: string; qty: number; unit: string; unitPrice: number; amount: number }[];
  currency: string;
  validUntil: string;
  incoterms: string;
  paymentTerms: string;
  discountPct: number;
  taxRate: number;
  terms: string;
  notes: string[];
}

/** 서버 JSON → 안전한 DocIntakeResult (숫자 강제·기본값). */
function normalizeIntake(json: Partial<DocIntakeResult>): DocIntakeResult {
  return {
    lineItems: (json.lineItems ?? []).map((li) => ({
      name: li.name ?? "", qty: Number(li.qty ?? 0), unit: li.unit || "pcs",
      unitPrice: Number(li.unitPrice ?? 0), amount: Number(li.amount ?? 0),
    })),
    currency: (json.currency ?? "USD").toUpperCase().slice(0, 3),
    validUntil: json.validUntil ?? "",
    incoterms: json.incoterms ?? "",
    paymentTerms: json.paymentTerms ?? "",
    discountPct: Number(json.discountPct ?? 0),
    taxRate: Number(json.taxRate ?? 0),
    terms: json.terms ?? "",
    notes: json.notes ?? [],
  };
}

/** 표시용 문서번호 — 취소 문서의 "-VOID" 반납 표식은 숨긴다. */
function displayNo(d: CompanyDocument): string {
  const no = d.docNo?.replace(/-VOID$/, "");
  return no ?? (d.revision > 1 ? `(draft R${d.revision})` : "(draft)");
}

/** yyyy-mm-dd, n days from today — quotations default to 14 days of validity. */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formFrom(doc: CompanyDocument | null, companyName: string): DocFormValue {
  return {
    lineItems: doc?.lineItems.length ? doc.lineItems.map((li) => ({ ...li })) : [emptyLine()],
    currency: doc?.currency ?? "USD",
    validUntil: doc?.validUntil ?? (doc ? null : daysFromToday(14)),
    incoterms: doc?.incoterms ?? "EXW",
    paymentTerms: doc?.paymentTerms ?? "100% before shipment",
    billTo: doc?.billTo ?? companyName,
    shipTo: doc?.shipTo ?? "",
    projectRef: doc?.projectRef ?? "",
    discountPct: doc?.discountPct ?? 0,
    taxRate: doc?.taxRate ?? 0,
    terms: doc?.terms ?? "",
    memo: doc?.memo ?? "",
    fromAddr: doc?.fromAddr ?? "us",
    dealId: doc?.dealId ?? "",
    poNo: doc?.docNo ?? "",
    linkedDocId: doc?.linkedDocId ?? "",
    // 발행 문서의 발행일 — 편집 가능 (2026-09-17 지시: 내용 수정 시 날짜도 갱신할 수 있게)
    issueDate: doc?.issueDate ?? null,
  };
}

/** 고객 PO ← 견적서: 품목·통화·조건·주소를 그대로 가져온다 (같은 내용을 두 번 입력하던 수고, 2026-10-15). */
function fromQuote(q: CompanyDocument, form: DocFormValue): Partial<DocFormValue> {
  return {
    linkedDocId: q.id,
    lineItems: q.lineItems.length ? q.lineItems.map((li) => ({ ...li })) : form.lineItems,
    currency: q.currency || form.currency,
    incoterms: q.incoterms || form.incoterms,
    paymentTerms: q.paymentTerms || form.paymentTerms,
    billTo: q.billTo?.trim() || form.billTo,
    shipTo: q.shipTo?.trim() || form.shipTo,
    projectRef: q.projectRef || form.projectRef,
    discountPct: q.discountPct ?? form.discountPct,
    taxRate: q.taxRate ?? form.taxRate,
    dealId: form.dealId || q.dealId || "",
  };
}

/** One document stage (quotation / PO / invoice): list of that company's
   documents plus an inline editor. Draft docs edit freely; issued docs go
   through the approval gate (workspace decides). */
export function DocumentPanel({
  loading = false,
  docType,
  companyId,
  companyName,
  documents,
  canSendToFinance,
  onUpload,
  onCreate,
  onSave,
  onIssue,
  onDelete,
  onSendToFinance,
  onCreateRevision,
  onSelectDoc,
  onEmail,
  onCreateInvoiceFromPo,
  onVoid,
  onLinkDeal,
  companyContact,
}: {
  /** True while this company's documents are still fetching. */
  loading?: boolean;
  docType: DocType;
  /** 카탈로그·빌드 픽커용 (견적 전용 기능). */
  companyId?: string;
  /** Seeds the QUOTE FOR block and titles the printed document. */
  companyName: string;
  documents: CompanyDocument[];
  canSendToFinance: boolean;
  onUpload: () => void;
  onCreate: (form: DocFormValue, meta?: DocCreateMeta) => Promise<void>;
  onSave: (doc: CompanyDocument, form: DocFormValue) => Promise<void>;
  onIssue: (doc: CompanyDocument) => Promise<void>;
  onDelete: (doc: CompanyDocument) => Promise<void>;
  onSendToFinance: (doc: CompanyDocument) => Promise<void>;
  /** 발행된 견적의 "New version" — 복제 draft 생성 (워크스페이스 구현). */
  onCreateRevision?: (doc: CompanyDocument) => Promise<void>;
  /** 편집 중인 문서 — 우측 기록 패널의 스코프 (워크스페이스가 소비). */
  onSelectDoc?: (v: { id: string; label: string } | null) => void;
  /** 고객 이메일 발송 — 컴포저가 만든 제목/본문(HTML)을 그대로 보낸다. */
  onEmail?: (doc: CompanyDocument, opts: { to: string[]; cc: string[]; bcc: string[]; subject: string; message: string; html?: string; attachments?: EmailAttachment[] }) => Promise<void>;
  /** 확정된 고객 PO → 인보이스 draft 생성 (워크스페이스 구현). */
  onCreateInvoiceFromPo?: (po: CompanyDocument) => Promise<void>;
  /** 발행 문서 취소(void) — 번호는 -VOID로 반납되어 다음 발행이 재사용한다. */
  onVoid?: (doc: CompanyDocument) => Promise<void>;
  /** 행에서 바로 딜 연결 (선 생성, 후 연동). */
  onLinkDeal?: (doc: CompanyDocument, dealId: string) => Promise<void>;
  /** 회사 담당 연락처 — 이메일 수신자 프리필. */
  companyContact?: string;
}) {
  const docs = documents.filter((d) => d.docType === docType);
  // 딜 셀렉트 옵션 — deals 테이블 미생성 DB에서는 조용히 빈 목록. 이 회사 딜만.
  const [dealOptions, setDealOptions] = useState<{ id: string; dealNo: string; title: string; companyId: string | null }[]>([]);
  useEffect(() => {
    fetchDealsLight()
      .then((all) => setDealOptions(companyId ? all.filter((d) => d.companyId === companyId) : all))
      .catch(() => setDealOptions([]));
  }, [companyId]);
  const dealNoOf = (dealId: string | null) => dealOptions.find((d) => d.id === dealId)?.dealNo ?? null;
  const issuedQuotes = documents.filter((d) => d.docType === "quotation" && d.status !== "draft" && d.status !== "void");
  const quoteNoOf = (docId: string | null) => documents.find((d) => d.id === docId)?.docNo ?? null;

  const [editing, setEditing, editHistory] = useDraftHistory<{ doc: CompanyDocument | null; form: DocFormValue } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  const editingDocumentId = editing ? editing.doc?.id ?? "new" : null;
  useEffect(() => {
    if (editingDocumentId !== null) {
      editorRef.current?.scrollIntoView({ block: "start" });
      (editorRef.current?.querySelector<HTMLElement>("textarea, input") ?? editorRef.current)?.focus({ preventScroll: true });
    }
  }, [editingDocumentId]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 행 선택 — 우측 기록 패널의 스코프 (편집기 열림이 우선).
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  // Summaries are visible on arrival; each document can be collapsed explicitly.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [docPreview, setDocPreview] = useState<{ doc: CompanyDocument; html: string } | null>(null);

  async function openDocPreview(d: CompanyDocument) {
    try {
      const html = await buildDocumentHtml(d, companyName);
      setDocPreview({ doc: d, html });
    } catch (err) {
      console.error("doc preview failed:", err);
    }
  }

  // 편집기 하단 Adjust AI — Procurement 편집기와 동일 개념: 문장 지시로 현재 draft 수정.
  const [editorAdjust, setEditorAdjust] = useState("");
  const [editorAdjustBusy, setEditorAdjustBusy] = useState(false);
  const [editorAdjustNotes, setEditorAdjustNotes] = useState<string[]>([]);

  async function adjustEditorWithAi() {
    if (!editing || !editorAdjust.trim() || editorAdjustBusy || busyId === "save") return;
    setEditorAdjustBusy(true);
    try {
      const f = editing.form;
      const current = {
        lineItems: f.lineItems.filter((li) => li.name.trim()).map((li) => ({
          name: li.name, qty: li.qty, unit: li.unit ?? "pcs", unitPrice: li.unitPrice, amount: li.amount,
        })),
        currency: f.currency, validUntil: f.validUntil ?? "", incoterms: f.incoterms,
        paymentTerms: f.paymentTerms, discountPct: f.discountPct, taxRate: f.taxRate, terms: f.terms,
      };
      const res = await fetch("/api/doc-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, adjustText: editorAdjust.trim(), current }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      // billed·이미지·노트는 같은 이름의 기존 라인에서 승계 (AI 응답 스키마엔 없음)
      const prevByName = new Map(f.lineItems.map((li) => [li.name.trim(), li]));
      setEditing((p) => p && ({
        ...p,
        form: {
          ...p.form,
          lineItems: ((json.lineItems ?? []) as DocLineItem[]).map((li) => {
            const prev = prevByName.get(String(li.name ?? "").trim());
            const qty = Number(li.qty ?? 0);
            const unitPrice = Number(li.unitPrice ?? 0);
            const amount = Math.round(qty * unitPrice * 100) / 100 || Number(li.amount ?? 0);
            return { name: li.name ?? "", qty, unit: li.unit || "pcs", unitPrice, amount, note: prev?.note, billed: prev?.billed, imagePath: prev?.imagePath };
          }),
          currency: String(json.currency || p.form.currency).toUpperCase().slice(0, 3),
          validUntil: json.validUntil || p.form.validUntil,
          incoterms: json.incoterms ?? p.form.incoterms,
          paymentTerms: json.paymentTerms ?? p.form.paymentTerms,
          discountPct: Number.isFinite(Number(json.discountPct)) ? Number(json.discountPct) : p.form.discountPct,
          taxRate: Number.isFinite(Number(json.taxRate)) ? Number(json.taxRate) : p.form.taxRate,
          terms: json.terms || p.form.terms,
        },
      }));
      setEditorAdjustNotes((json.notes ?? []).length ? json.notes : ["Applied."]);
      setEditorAdjust("");
    } catch (err) {
      console.error("editor adjust failed:", err);
      setEditorAdjustNotes([`Adjustment failed · ${(err as Error).message}`]);
    } finally {
      setEditorAdjustBusy(false);
    }
  }
  // 고객 이메일 컴포저 — 견적 발송(HTML 미리보기 포함)과 PO 불일치 확인 메일이 함께 쓴다.
  const [composer, setComposer] = useState<{
    doc: CompanyDocument;
    to: string;
    subject: string;
    message: string;
    /** true면 견적 HTML 템플릿으로 발송·미리보기, false면 텍스트 메일. */
    richQuote: boolean;
  } | null>(null);
  // To 자동완성 — 컴포저가 처음 열릴 때 이 회사 연락처 이메일을 lazy 로드.
  const [contactEmails, setContactEmails] = useState<{ name: string; email: string }[] | null>(null);
  useEffect(() => {
    if (!composer || contactEmails !== null || !companyId) return;
    fetchCompanyContactEmails(companyId).then(setContactEmails).catch(() => setContactEmails([]));
  }, [composer, contactEmails, companyId]);
  // 고객 PO 업로드(AI) — 추출 결과 확인 모달
  const [poIntake, setPoIntake] = useState<{
    fileName: string;
    poNumber: string; poDate: string; currency: string;
    lineItems: DocLineItem[]; paymentTerms: string; incoterms: string; shipTo: string;
    quotationId: string; dealId: string; notes: string[];
  } | null>(null);
  const [poBusy, setPoBusy] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);
  // 문서 AI 임포트 (견적/인보이스) — 추출 결과 리뷰 모달 (Procurement intake 패턴)
  const [aiIntake, setAiIntake] = useState<{ fileName: string; fileType: string; dataBase64: string; dealId: string; r: DocIntakeResult } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAdjust, setAiAdjust] = useState("");
  const [aiAdjustBusy, setAiAdjustBusy] = useState(false);
  // 카탈로그 관리자 — 픽커와 catalog 캐시를 공유한다
  const [managerOpen, setManagerOpen] = useState(false);
  // 견적 대조(AI) 결과 모달
  const [compare, setCompare] = useState<{
    po: CompanyDocument;
    quote: CompanyDocument;
    match: boolean; summary: string;
    discrepancies: { field: string; quotation: string; po: string; severity: string }[];
    emailDraft: string;
  } | null>(null);

  /** 편집기 열고 닫을 때 우측 기록 스코프도 함께 바꾼다. */
  function openEditor(doc: CompanyDocument | null) {
    editorOpener.current = document.activeElement as HTMLElement;
    setEditorAdjust("");
    setEditorAdjustNotes([]);
    const open = (addr: string | null) => {
      editHistory.reset({ doc, form: doc ? formFrom(doc, companyName) : newDocForm(addr) });
      onSelectDoc?.(doc ? { id: doc.id, label: `${DOC_LABEL[docType]} ${doc.docNo ?? "(draft)"}` } : null);
    };
    // 새 문서는 저장된 고객 주소를 먼저 읽어 Quote for에 채운다 ("Customer address"를 매번 누르던 수고).
    if (!doc && companyId && companyAddress === null) {
      fetchCompanyAddress(companyId)
        .then((addr) => { setCompanyAddress(addr); open(addr); })
        .catch(() => open(null));
      return;
    }
    open(companyAddress);
  }
  /** 새 문서 — 이 회사의 최근 문서(같은 종류 우선)에서 통화·인코텀즈·결제조건·주소를 이어받는다. */
  function newDocForm(addr: string | null): DocFormValue {
    const base = formFrom(null, companyName);
    const recent = [...documents]
      .filter((d) => d.status !== "void")
      .sort((a, b) => Number(b.docType === docType) - Number(a.docType === docType) || b.updatedAt.localeCompare(a.updatedAt))[0];
    const billTo = recent?.billTo?.trim() || (addr?.trim() ? `${companyName}\n${addr}` : companyName);
    const form = recent
      ? { ...base, currency: recent.currency || base.currency, incoterms: recent.incoterms || base.incoterms, paymentTerms: recent.paymentTerms || base.paymentTerms, fromAddr: recent.fromAddr, billTo, shipTo: recent.shipTo || base.shipTo }
      : { ...base, billTo };
    // 새 고객 PO는 아직 PO에 연결되지 않은 가장 최근 발행 견적서를 연결하고 내용을 채운다 (다르면 Linked quotation에서 바꾸면 된다).
    if (docType === "purchase_order") {
      const used = new Set(documents.filter((d) => d.docType === "purchase_order" && d.status !== "void").map((d) => d.linkedDocId));
      const quote = issuedQuotes.filter((q) => !used.has(q.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (quote) return { ...form, ...fromQuote(quote, form) };
    }
    return form;
  }
  function closeEditor() {
    if (editorAdjustBusy || busyId === "save") return;
    if (editHistory.dirty && !window.confirm("Discard unsaved changes to this document?")) return;
    finishEditor();
  }
  function finishEditor() {
    editHistory.reset(null);
    requestAnimationFrame(() => editorOpener.current?.isConnected && editorOpener.current.focus());
    const sel = selectedRowId ? docs.find((d) => d.id === selectedRowId) : null;
    onSelectDoc?.(sel ? { id: sel.id, label: `${DOC_LABEL[docType]} ${displayNo(sel)}` } : null);
  }
  async function saveEditor() {
    if (!editing || busyId === "save" || editorAdjustBusy) return;
    await run("save", async () => {
      if (editing.doc) await onSave(editing.doc, editing.form);
      else await onCreate(editing.form);
      finishEditor();
    });
  }
  const [confirmDelete, setConfirmDelete] = useState<CompanyDocument | null>(null);

  // 카탈로그/빌드 픽커 — 열 때 lazy 로드 (견적 편집기 전용)
  const [picker, setPicker] = useState<"catalog" | "build" | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [builds, setBuilds] = useState<Build[] | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [savedToCatalog, setSavedToCatalog] = useState<Set<number>>(new Set());

  // 라인아이템 이미지 — 픽커(라인 index), 서명 URL 캐시(storage 경로 → URL), Engineering 사진 그리드
  const [imgPicker, setImgPicker] = useState<number | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [engPhotos, setEngPhotos] = useState<{ id: string; path: string; url: string; label: string }[] | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  // 주소 채움 — 회사 주소 캐시와 "먼저 등록하세요" 안내
  const [companyAddress, setCompanyAddress] = useState<string | null>(null);
  const [addrNotice, setAddrNotice] = useState<string | null>(null);

  // 편집 중인 라인들의 이미지 서명 URL을 미리 받아 썸네일로 보여준다 (join 키로 deps 안정화).
  const imagePathsKey = (editing?.form.lineItems ?? []).map((li) => li.imagePath ?? "").filter(Boolean).join("|");
  useEffect(() => {
    if (!imagePathsKey) return;
    let alive = true;
    const paths = Array.from(new Set(imagePathsKey.split("|")));
    void Promise.all(paths.map(async (p) => [p, await lineItemImageUrl(p).catch(() => "")] as const)).then((pairs) => {
      if (!alive) return;
      const found = pairs.filter(([, url]) => url);
      if (found.length) setThumbs((prev) => ({ ...prev, ...Object.fromEntries(found) }));
    });
    return () => { alive = false; };
  }, [imagePathsKey]);

  /** 라인 이미지 픽커 열기 — Engineering 사진 그리드는 최초 1회 lazy 로드. */
  async function openImgPicker(i: number) {
    setImgPicker(i);
    setImgError(null);
    if (engPhotos !== null || !companyId) return;
    try {
      const blds = await fetchBuilds(companyId);
      const files = await fetchBuildFiles(blds.map((b) => b.id));
      const photos = await Promise.all(
        files
          .filter((f) => f.mimeType.startsWith("image/"))
          .map(async (f) => ({
            id: f.id,
            path: f.storagePath,
            url: await lineItemImageUrl(f.storagePath).catch(() => ""),
            label: [blds.find((b) => b.id === f.buildId)?.modelCode, f.view].filter(Boolean).join(" · ") || f.fileName,
          })),
      );
      setEngPhotos(photos.filter((p) => p.url));
    } catch (err) {
      console.error("engineering photos load failed:", err);
      setEngPhotos([]);
      setImgError("Failed to load Engineering photos.");
    }
  }

  /** 파일 업로드 → docs 버킷 doc-items/ 경로 → 라인에 연결. */
  async function onLineImageFile(file: File) {
    if (imgPicker === null) return;
    setImgBusy(true);
    setImgError(null);
    try {
      const path = await uploadDocItemImage(file);
      setItem(imgPicker, { imagePath: path });
      setImgPicker(null);
    } catch (err) {
      console.error("line image upload failed:", err);
      setImgError("Upload failed. Check the docs bucket permissions.");
    } finally {
      setImgBusy(false);
    }
  }

  /** Quote for/Ship to 채움 — 고객 주소(companies.address) 또는 당사 주소(org_settings). */
  async function fillAddress(field: "billTo" | "shipTo", source: "customer" | "us" | "kr") {
    try {
      if (source === "customer") {
        if (!companyId) return;
        const addr = companyAddress ?? (await fetchCompanyAddress(companyId));
        setCompanyAddress(addr);
        if (!addr.trim()) {
          setAddrNotice("Set the address in company Edit first.");
          return;
        }
        setAddrNotice(null);
        const text = `${companyName}\n${addr}`;
        setField(field === "billTo" ? { billTo: text } : { shipTo: text });
        return;
      }
      const org = await orgForPrint();
      const text = source === "us" ? `${org.name}\n${org.address}` : org.addressKr;
      setField(field === "billTo" ? { billTo: text } : { shipTo: text });
    } catch (err) {
      console.error("address fill failed:", err);
    }
  }

  async function openPicker(kind: "catalog" | "build") {
    setPicker(kind);
    setPickerQuery("");
    setPickerError(null);
    try {
      if (kind === "catalog" && catalog === null) setCatalog(await fetchCatalog());
      if (kind === "build" && builds === null && companyId) setBuilds(await fetchBuilds(companyId));
    } catch (err) {
      console.error("picker load failed:", err);
      setPickerError(kind === "catalog" ? "Failed to load the catalog. Check that the 2026-08-06b SQL has been applied." : "Failed to load the build list.");
    }
  }

  function addLine(li: DocLineItem) {
    setEditing((p) => {
      if (!p) return p;
      // 마지막 줄이 빈 줄이면 대체, 아니면 뒤에 추가
      const items = [...p.form.lineItems];
      if (items.length && !items[items.length - 1].name.trim()) items.pop();
      return { ...p, form: { ...p.form, lineItems: [...items, li] } };
    });
    setPicker(null);
  }

  async function saveLineToCatalog(i: number, li: DocLineItem) {
    try {
      const item = await insertCatalogItem({ name: li.name, unit: li.unit ?? "pcs", unitPrice: li.unitPrice, currency: editing?.form.currency ?? "USD" });
      setCatalog((prev) => (prev ? [...prev, item] : prev));
      setSavedToCatalog((prev) => new Set(prev).add(i));
    } catch (err) {
      console.error("save to catalog failed:", err);
      setPickerError("Failed to save to the catalog. Check that the 2026-08-06b SQL has been applied.");
    }
  }

  function setItem(i: number, patch: Partial<DocLineItem>) {
    setEditing((prev) => {
      if (!prev) return prev;
      const items = prev.form.lineItems.map((li, idx) => {
        if (idx !== i) return li;
        const next = { ...li, ...patch };
        next.amount = Math.round((next.qty || 0) * (next.unitPrice || 0) * 100) / 100;
        return next;
      });
      return { ...prev, form: { ...prev.form, lineItems: items } };
    });
  }

  function setField(patch: Partial<DocFormValue>) {
    setEditing((prev) => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));
  }

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  }

  // ── 고객 PO 접수 (AI) — 업로드 → 추출 → 확인 → 고객사 번호 그대로 저장 ──
  async function onPoFile(file: File) {
    if (file.size > 15 * 1024 * 1024) { setPoError("File too big. Keep it under 15MB."); return; }
    setPoBusy(true);
    setPoError(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
        fr.onerror = () => reject(new Error("file read failed"));
        fr.readAsDataURL(file);
      });
      const res = await fetch("/api/po-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, dataBase64 }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      // 참조 견적 번호가 읽혔으면 이 회사의 발행 견적과 자동 매칭한다.
      const refQuote = json.quotationRef
        ? issuedQuotes.find((q) => q.docNo && (q.docNo === json.quotationRef || json.quotationRef.includes(q.docNo)))
        : undefined;
      setPoIntake({
        fileName: file.name,
        poNumber: json.poNumber ?? "",
        poDate: json.poDate ?? "",
        currency: (json.currency ?? "USD").toUpperCase().slice(0, 3),
        lineItems: (json.lineItems ?? []).map((li: DocLineItem) => ({
          name: li.name ?? "", qty: Number(li.qty ?? 0), unit: li.unit || "pcs",
          unitPrice: Number(li.unitPrice ?? 0), amount: Number(li.amount ?? 0),
        })),
        paymentTerms: json.paymentTerms ?? "",
        incoterms: json.incoterms ?? "",
        shipTo: json.shipTo ?? "",
        quotationId: refQuote?.id ?? "",
        dealId: refQuote?.dealId ?? "",
        notes: json.notes ?? [],
      });
    } catch (err) {
      console.error("po extract failed:", err);
      setPoError(`AI extraction failed · ${(err as Error).message}`);
    } finally {
      setPoBusy(false);
    }
  }

  async function savePoIntake() {
    if (!poIntake) return;
    const p = poIntake;
    const linkedQuote = documents.find((d) => d.id === p.quotationId) ?? null;
    await run("po-intake-save", async () => {
      await onCreate(
        {
          // 파일에서 품목을 못 읽었으면 연결한 견적서 품목으로 채운다.
          lineItems: p.lineItems.some((li) => li.name.trim())
            ? p.lineItems.filter((li) => li.name.trim())
            : (linkedQuote?.lineItems ?? []).map((li) => ({ ...li })),
          currency: p.currency, validUntil: null,
          incoterms: p.incoterms, paymentTerms: p.paymentTerms,
          billTo: companyName, shipTo: p.shipTo, projectRef: "",
          discountPct: 0, taxRate: 0, terms: "", memo: `Customer PO upload · ${p.fileName}`,
          fromAddr: "us",
          dealId: p.dealId || (linkedQuote?.dealId ?? ""),
        },
        {
          docNo: p.poNumber.trim() || null,
          status: "issued", // 고객이 이미 발행한 문서 — 기록용이라 draft가 아니다
          issueDate: p.poDate || new Date().toISOString().slice(0, 10),
          linkedDocId: p.quotationId || null,
        },
      );
      setPoIntake(null);
    });
  }

  // ── 문서 AI 임포트 — 파일 → 추출 → 리뷰 모달 → Apply 시에만 draft 생성 ──
  async function onDocImportFile(file: File) {
    if (file.size > 15 * 1024 * 1024) { setAiError("File too big. Keep it under 15MB."); return; }
    setAiBusy(true);
    setAiError(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
        fr.onerror = () => reject(new Error("file read failed"));
        fr.readAsDataURL(file);
      });
      const res = await fetch("/api/doc-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, dataBase64, docType }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      setAiAdjust("");
      setAiIntake({ fileName: file.name, fileType: file.type, dataBase64, dealId: "", r: normalizeIntake(json) });
    } catch (err) {
      console.error("doc import failed:", err);
      setAiError(`AI extraction failed · ${(err as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  }

  /** 리뷰 모달의 자유 지시 재조정 — 같은 파일 + 현재 결과 + 지시를 보낸다. */
  async function adjustDocIntake() {
    if (!aiIntake || !aiAdjust.trim()) return;
    setAiAdjustBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/doc-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: aiIntake.fileName,
          fileType: aiIntake.fileType,
          dataBase64: aiIntake.dataBase64,
          docType,
          adjustText: aiAdjust.trim(),
          current: aiIntake.r,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      setAiIntake((prev) => (prev ? { ...prev, r: normalizeIntake(json) } : prev));
      setAiAdjust("");
    } catch (err) {
      console.error("doc intake adjust failed:", err);
      setAiError(`AI adjustment failed · ${(err as Error).message}`);
    } finally {
      setAiAdjustBusy(false);
    }
  }

  function setAiField(patch: Partial<DocIntakeResult>) {
    setAiIntake((prev) => (prev ? { ...prev, r: { ...prev.r, ...patch } } : prev));
  }

  /** Apply — 확인된 추출 결과로 draft를 만든다 (billed 기본 true, 이미지 없음). */
  async function applyDocIntake() {
    if (!aiIntake) return;
    const p = aiIntake;
    await run("ai-intake-save", async () => {
      await onCreate({
        lineItems: p.r.lineItems.filter((li) => li.name.trim()),
        currency: p.r.currency,
        validUntil: p.r.validUntil || null,
        incoterms: p.r.incoterms,
        paymentTerms: p.r.paymentTerms,
        billTo: companyName,
        shipTo: "",
        projectRef: "",
        discountPct: p.r.discountPct,
        taxRate: p.r.taxRate,
        terms: p.r.terms,
        memo: `AI import · ${p.fileName}`,
        fromAddr: "us",
        dealId: p.dealId,
      });
      setAiIntake(null);
    });
  }

  /** 고객 PO ↔ 근거 견적 AI 대조 — 불일치를 찾으면 확인 메일 초안까지 만든다. */
  async function runCompare(po: CompanyDocument) {
    const quote = documents.find((d) => d.id === po.linkedDocId);
    if (!quote) { setPoError("Link a quotation first. Press the link button on this PO row."); return; }
    const slim = (d: CompanyDocument) => ({
      docNo: d.docNo, currency: d.currency, total: d.total,
      lineItems: d.lineItems, paymentTerms: d.paymentTerms, incoterms: d.incoterms,
      validUntil: d.validUntil, discountPct: d.discountPct, taxRate: d.taxRate,
    });
    await run(`compare-${po.id}`, async () => {
      const res = await fetch("/api/po-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotation: slim(quote), po: slim(po) }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      setCompare({ po, quote, match: !!json.match, summary: json.summary ?? "", discrepancies: json.discrepancies ?? [], emailDraft: json.emailDraft ?? "" });
    }).catch((err) => setPoError(`AI compare failed · ${(err as Error).message}`));
  }

  /** 불일치 확인 메일 — 컴포저를 대조 결과로 프리필해 연다 (사람이 보고 발송). */
  function openDiscrepancyEmail() {
    if (!compare) return;
    const c = compare;
    const lines = c.discrepancies.map((d) => `- ${d.field}: quotation "${d.quotation}" vs PO "${d.po}"`).join("\n");
    setComposer({
      doc: c.po,
      to: companyContact && companyContact.includes("@") ? companyContact : "",
      subject: `Please confirm: PO ${c.po.docNo ?? ""} vs quotation ${c.quote.docNo ?? ""}`.trim(),
      message: `Dear ${companyName} team,\n\nWhile registering your purchase order ${c.po.docNo ?? ""}, we found the following differences against our quotation ${c.quote.docNo ?? ""}:\n\n${lines}\n\n${c.emailDraft ? c.emailDraft + "\n\n" : ""}Could you please confirm which values should apply?\n\nBest regards,`,
      richQuote: false,
    });
    setCompare(null);
  }

  const totals = editing
    ? documentTotals(editing.form.lineItems, editing.form.discountPct, editing.form.taxRate)
    : { subtotal: 0, discount: 0, net: 0, tax: 0, total: 0 };

  const cell: React.CSSProperties = { padding: "4px 6px", borderBottom: "1px solid var(--border-subtle)" };
  const inputStyle: React.CSSProperties = { width: "100%" };
  const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
  const labelStyle: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--text-muted)" };

  const editor = editing && (
        <div ref={editorRef} tabIndex={-1} role="region" aria-label="Document editor" onKeyDown={(e) => editorKeys(e, { history: editHistory, onSave: () => void saveEditor(), onCancel: closeEditor, busy: busyId === "save" || editorAdjustBusy })} style={{ border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", padding: 14, display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>
              {editing.doc ? `Edit ${editing.doc.docNo ?? "draft"}` : `New ${DOC_LABEL[docType].toLowerCase()}`}
              {editing.doc && editing.doc.status !== "draft" && (
                <span style={{ marginLeft: 8, fontSize: "var(--text-xs)", color: "var(--amber-600, #b45309)" }}>issued · saving needs approval</span>
              )}
            </span>

          </div>

          <EditorActions history={editHistory} onSave={() => void saveEditor()} onCancel={closeEditor} busy={busyId === "save" || editorAdjustBusy} saveLabel={editing.doc ? "Save changes" : "Create draft"} />
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                {["Item", "Qty", "Unit", "Unit price", "Amount", "Billed", ""].map((h, i) => (
                  <th key={i}
                    title={h === "Billed" ? "Unchecked = reference price only · excluded from totals" : undefined}
                    style={{ ...cell, textAlign: i >= 1 && i <= 4 ? "right" : h === "Billed" ? "center" : "left", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)", borderBottom: "1px solid var(--border-strong)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editing.form.lineItems.map((li, i) => (
                <tr key={i}>
                  <td style={{ ...cell, width: "44%" }}>
                    <Textarea aria-label={`Item ${i + 1} description`} style={inputStyle} rows={Math.min(8, Math.max(1, li.name.split("\n").length))} value={li.name} placeholder="Description"
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setItem(i, { name: e.target.value })} />
                    {li.imagePath && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                        {thumbs[li.imagePath] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 서명 URL(1h) 썸네일이라 next/image 최적화 대상이 아니다
                          <img src={thumbs[li.imagePath]} alt="Line item" style={{ height: 40, borderRadius: 4, border: "1px solid var(--border-subtle)", objectFit: "contain" }} />
                        ) : (
                          <Spinner size="sm" />
                        )}
                        <Button variant="ghost" size="sm" iconOnly aria-label="Remove image"
                          onClick={() => setItem(i, { imagePath: undefined })}>
                          <X size={12} />
                        </Button>
                      </div>
                    )}
                  </td>
                  <td style={{ ...cell, width: 80 }}>
                    <Input aria-label={`Item ${i + 1} quantity`} size="sm" mono style={inputStyle} value={String(li.qty)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setItem(i, { qty: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
                  </td>
                  <td style={{ ...cell, width: 76 }}>
                    <Input aria-label={`Item ${i + 1} unit`} size="sm" style={inputStyle} list={DL.unit} value={li.unit ?? "pcs"} placeholder="pcs"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setItem(i, { unit: e.target.value })} />
                  </td>
                  <td style={{ ...cell, width: 130 }}>
                    <Input aria-label={`Item ${i + 1} unit price`} size="sm" mono style={inputStyle} value={String(li.unitPrice)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setItem(i, { unitPrice: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {li.billed === false
                      ? <span title="Reference price only · excluded from totals" style={{ color: "var(--text-subtle)" }}>ref only</span>
                      : li.amount.toLocaleString("en-US")}
                  </td>
                  <td style={{ ...cell, width: 48, textAlign: "center" }}>
                    <Checkbox checked={li.billed !== false} aria-label="Billed"
                      title="Unchecked = reference price only · excluded from totals"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setItem(i, { billed: e.target.checked })} />
                  </td>
                  <td style={{ ...cell, width: 92, whiteSpace: "nowrap" }}>
                    <Button variant="ghost" size="sm" iconOnly aria-label="Line item image"
                      title={li.imagePath ? "Change the line item image" : "Add an image. Upload or pick an Engineering photo"}
                      onClick={() => void openImgPicker(i)}>
                      <ImageIcon size={13} style={li.imagePath ? { color: "var(--color-primary)" } : undefined} />
                    </Button>
                    {docType === "quotation" && (
                      <Button variant="ghost" size="sm" iconOnly
                        aria-label="Save to catalog"
                        title={savedToCatalog.has(i) ? "Saved to catalog" : "Save to catalog · reuse in the next quotation"}
                        disabled={!li.name.trim() || savedToCatalog.has(i)}
                        onClick={() => void saveLineToCatalog(i, li)}>
                        <BookMarked size={13} style={savedToCatalog.has(i) ? { color: "var(--color-primary)" } : undefined} />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" iconOnly aria-label="Remove line"
                      onClick={() => {
                        setEditing((p) => p && ({ ...p, form: { ...p.form, lineItems: p.form.lineItems.filter((_, idx) => idx !== i) } }));
                        requestAnimationFrame(() => editorRef.current?.focus({ preventScroll: true }));
                      }}>
                      <X size={13} />
                    </Button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={7} style={{ padding: "6px 6px" }}>
                  <Button variant="ghost" size="sm" leftIcon={<Plus size={13} />}
                    onClick={() => setEditing((p) => p && ({ ...p, form: { ...p.form, lineItems: [...p.form.lineItems, emptyLine()] } }))}>
                    Add line
                  </Button>
                  {docType === "quotation" && (
                    <>
                      <Button variant="ghost" size="sm" leftIcon={<BookMarked size={13} />} onClick={() => void openPicker("catalog")}>
                        Add from catalog
                      </Button>
                      {companyId && (
                        <Button variant="ghost" size="sm" leftIcon={<Wrench size={13} />} onClick={() => void openPicker("build")}>
                          Load build spec
                        </Button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          </div>

          {/* Subtotal → discount → net → sales tax → TOTAL, same order as the print view. */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "var(--text-xs)", minWidth: 260 }}>
              <tbody>
                {[
                  ["Subtotal", money(totals.subtotal, editing.form.currency)],
                  [`Discount${editing.form.discountPct ? ` (${editing.form.discountPct}%)` : ""}`, totals.discount ? `−${money(totals.discount, editing.form.currency)}` : money(0, editing.form.currency)],
                  ["Net", money(totals.net, editing.form.currency)],
                  [`Sales tax${editing.form.taxRate ? ` (${editing.form.taxRate}%)` : ""}`, money(totals.tax, editing.form.currency)],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: "2px 8px", color: "var(--text-muted)" }}>{k}</td>
                    <td style={{ padding: "2px 8px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{v}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "4px 8px", fontWeight: 700, color: "var(--text-strong)", borderTop: "1px solid var(--border-strong)" }}>TOTAL</td>
                  <td style={{ padding: "4px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, borderTop: "1px solid var(--border-strong)" }}>
                    {money(totals.total, editing.form.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Currency</span>
              <Input size="sm" list={DL.currency} value={editing.form.currency}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField({ currency: e.target.value.toUpperCase().slice(0, 3) })} />
            </label>
            {/* 발행일 — 발행된 문서만 (draft는 Issue 시점에 자동 기재) */}
            {editing.doc && editing.doc.status !== "draft" && (
              <label style={fieldStyle}>
                <span style={labelStyle}>Issue date</span>
                <Input size="sm" type="date" value={editing.form.issueDate ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField({ issueDate: e.target.value || null })} />
              </label>
            )}
            <label style={fieldStyle}>
              <span style={labelStyle}>Valid until</span>
              <Input size="sm" type="date" value={editing.form.validUntil ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField({ validUntil: e.target.value || null })} />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Incoterms</span>
              <Input size="sm" list={DL.incoterms} value={editing.form.incoterms} placeholder="EXW"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField({ incoterms: e.target.value })} />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Payment terms</span>
              <Select size="sm" value="" aria-label="Payment terms preset"
                options={[{ value: "", label: "Preset…" }, ...PAYMENT_TERMS.map((p) => ({ value: p, label: p }))]}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { if (e.target.value) setField({ paymentTerms: e.target.value }); }} />
              <Textarea rows={2} value={editing.form.paymentTerms} placeholder="100% before shipment"
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField({ paymentTerms: e.target.value })} />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>From (our address)</span>
              <Select size="sm" value={editing.form.fromAddr}
                options={[{ value: "us", label: "US HQ" }, { value: "kr", label: "Korea branch" }]}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField({ fromAddr: e.target.value as "us" | "kr" })} />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Deal (commercial spine)</span>
              <Select size="sm" value={editing.form.dealId}
                options={[
                  { value: "", label: dealOptions.length ? "(no deal)" : "No deals yet · company Spec sheet" },
                  ...dealOptions.map((d) => ({ value: d.id, label: `${d.dealNo} · ${d.title.slice(0, 36)}` })),
                ]}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField({ dealId: e.target.value })} />
            </label>
            {docType === "purchase_order" && (
              <>
                <label style={fieldStyle}>
                  <span style={labelStyle}>PO number (customer&rsquo;s)</span>
                  <Input size="sm" mono value={editing.form.poNo ?? ""} placeholder="e.g. 4500123456"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField({ poNo: e.target.value })} />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Linked quotation</span>
                  <Select size="sm" value={editing.form.linkedDocId ?? ""}
                    options={[
                      { value: "", label: issuedQuotes.length ? "(none)" : "No issued quotations" },
                      ...issuedQuotes.map((q) => ({ value: q.id, label: q.docNo ?? "(draft)" })),
                    ]}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const q = issuedQuotes.find((d) => d.id === e.target.value);
                      const typed = editing.form.lineItems.some((li) => li.name.trim());
                      // 견적서를 고르면 품목·조건을 복사한다. 이미 적은 품목이 있으면 바꿀지 먼저 묻는다.
                      if (q && (!typed || window.confirm(`Replace the line items and terms with ${q.docNo ?? "this quotation"}?`))) setField(fromQuote(q, editing.form));
                      else setField({ linkedDocId: e.target.value });
                    }} />
                </label>
              </>
            )}
          </div>

          {addrNotice && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--amber-600, #b45309)" }}>
              {addrNotice} <button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", textDecoration: "underline", font: "inherit" }} onClick={() => setAddrNotice(null)}>dismiss</button>
            </span>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {(["billTo", "shipTo"] as const).map((field) => (
              <label key={field} style={fieldStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  <span style={labelStyle}>{field === "billTo" ? "Quote for (bill to)" : "Ship to"}</span>
                  <span style={{ flex: 1 }} />
                  {companyId && (
                    <Button variant="ghost" size="sm" title="Fill with the company name + saved address"
                      onClick={() => void fillAddress(field, "customer")}>
                      Customer address
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void fillAddress(field, "us")}>US HQ</Button>
                  <Button variant="ghost" size="sm" onClick={() => void fillAddress(field, "kr")}>Korea branch</Button>
                </div>
                <Textarea rows={3} value={editing.form[field]}
                  placeholder={field === "billTo" ? `${companyName}\nAddress line 1\nCity, Country` : "Same as bill to, or the delivery address"}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField(field === "billTo" ? { billTo: e.target.value } : { shipTo: e.target.value })} />
              </label>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Project / Reference</span>
              <Input size="sm" value={editing.form.projectRef} placeholder="e.g. Vortex M1"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField({ projectRef: e.target.value })} />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Discount %</span>
              <Input size="sm" mono value={String(editing.form.discountPct)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField({ discountPct: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Tax rate %</span>
              <Input size="sm" mono value={String(editing.form.taxRate)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField({ taxRate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
            </label>
          </div>

          <label style={fieldStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={labelStyle}>Terms &amp; conditions</span>
              <span style={{ flex: 1 }} />
              <Button variant="ghost" size="sm" disabled={!QUOTATION_TERMS} title={QUOTATION_TERMS ? "Insert your saved quotation terms" : "Add quotation terms in Settings first"} onClick={() => setField({ terms: QUOTATION_TERMS })}>Insert standard T&amp;C</Button>
            </div>
            <Textarea rows={7} value={editing.form.terms} placeholder="Delivery, price/payment terms, validity, warranty, confidentiality, performance…"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField({ terms: e.target.value })} />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Memo (internal)</span>
            <Textarea rows={2} value={editing.form.memo}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField({ memo: e.target.value })} />
          </label>

          {/* Adjust AI — 문장 지시로 편집 중 draft를 수정 (Procurement와 동일 개념) */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Sparkles size={14} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
            <Input size="sm" value={editorAdjust} style={{ flex: 1 }}
              placeholder='Adjust with AI · e.g. "change qty to 10, add 5% discount, payment 30/60/10"'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditorAdjust(e.target.value)}
              data-native-undo
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault(); e.stopPropagation(); void adjustEditorWithAi();
                }
              }} />
            <Button size="sm" variant="soft" loading={editorAdjustBusy} disabled={!editorAdjust.trim()} onClick={() => void adjustEditorWithAi()}>
              Adjust
            </Button>
          </div>
          {editorAdjustNotes.length > 0 && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--amber-600, #b45309)" }}>
              {editorAdjustNotes.map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          )}


        </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>
          {DOC_LABEL[docType]}s <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>{docs.length ? `· ${docs.length}` : ""}</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {docType === "purchase_order" && (
            <>
              <input id="po-upload-input" type="file" accept="application/pdf,image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onPoFile(f); }} />
              <Button variant="primary" size="sm" leftIcon={poBusy ? <Spinner size="sm" /> : <Sparkles size={14} />} disabled={poBusy || editing !== null}
                title="Upload the customer's PO (PDF/image). AI extracts it and files it under the customer's own document number"
                onClick={() => document.getElementById("po-upload-input")?.click()}>
                {poBusy ? "Reading…" : "Upload customer PO (AI)"}
              </Button>
            </>
          )}
          {docType === "purchase_order" ? (
            // 고객 PO는 전용 "Upload customer PO (AI)"가 이미 있으므로 기존 업로드 유지
            <Button variant="secondary" size="sm" leftIcon={<Upload size={14} />} onClick={onUpload}>
              Upload
            </Button>
          ) : (
            <>
              <input id={`doc-ai-import-${docType}`} type="file" accept="application/pdf,image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onDocImportFile(f); }} />
              <Button variant="secondary" size="sm" leftIcon={aiBusy ? <Spinner size="sm" /> : <Sparkles size={14} />} disabled={aiBusy || editing !== null}
                title={`Import a ${DOC_LABEL[docType].toLowerCase()} PDF/image. AI extracts the fields for review before a draft is created`}
                onClick={() => document.getElementById(`doc-ai-import-${docType}`)?.click()}>
                {aiBusy ? "Reading…" : "Import (AI)"}
              </Button>
            </>
          )}
          <Button size="sm" disabled={editing !== null} leftIcon={<FilePlus2 size={14} />} onClick={() => openEditor(null)}>
            New {DOC_LABEL[docType].toLowerCase()}
          </Button>
        </div>
      </div>

      {poError && (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)" }}>
          {poError} <button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", textDecoration: "underline", font: "inherit" }} onClick={() => setPoError(null)}>dismiss</button>
        </span>
      )}

      {aiError && !aiIntake && (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)" }}>
          {aiError} <button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", textDecoration: "underline", font: "inherit" }} onClick={() => setAiError(null)}>dismiss</button>
        </span>
      )}

      {docs.length === 0 && !editing && (
        loading ? (
          <div style={{ display: "grid", placeItems: "center", padding: 40, color: "var(--text-muted)" }}>
            <Spinner />
          </div>
        ) : (
          <EmptyState
            icon={<FilePlus2 size={22} />}
            title={`No ${DOC_LABEL[docType].toLowerCase()} yet`}
            description={`Create a draft, fill the line items, then issue it to lock a number and move the deal forward.`}
          />
        )
      )}

      {docs.map((d) => (
        <div key={d.id} style={{ border: `1px solid ${selectedRowId === d.id ? "var(--color-primary)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)", background: "var(--surface-default)" }}>
        <div
          style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)", minWidth: 130 }}>
            {displayNo(d)}
          </span>
          {d.dealId && dealNoOf(d.dealId) && (
            <span title="Deal this document belongs to"
              style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", borderRadius: 999, padding: "1px 8px" }}>
              {dealNoOf(d.dealId)}
            </span>
          )}
          {!d.dealId && onLinkDeal && dealOptions.length > 0 && (
            <Select size="sm" value="" aria-label="Link deal" style={{ width: 150 }}
              options={[{ value: "", label: "link deal…" }, ...dealOptions.map((dl) => ({ value: dl.id, label: dl.dealNo }))]}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { if (e.target.value) void run(`link-${d.id}`, () => onLinkDeal(d, e.target.value)); }} />
          )}
          {docType === "purchase_order" && d.linkedDocId && quoteNoOf(d.linkedDocId) && (
            <span title="Quotation this customer PO is based on"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              <Link2 size={11} /> {quoteNoOf(d.linkedDocId)}
            </span>
          )}
          <Badge tone={STATUS_TONE[d.status] ?? "neutral"} dot size="sm">{d.status}</Badge>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-default)" }}>{money(d.total, d.currency)}</span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {d.issueDate ? `issued ${d.issueDate}` : `${d.lineItems.length} item${d.lineItems.length === 1 ? "" : "s"}`}
          </span>
          {/* 액션은 한 묶음 — 폭이 모자라면 버튼이 흩어지지 않고 묶음째 다음 줄 오른쪽으로 내려간다 */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <Button variant="primary" size="sm" leftIcon={<Pencil size={13} />} disabled={editing !== null} onClick={() => openEditor(d)}>Edit</Button>
          <Button variant="ghost" size="sm" leftIcon={<Eye size={13} />} onClick={() => void openDocPreview(d)}>Preview & print</Button>
          <ActionsMenu label={`More actions for ${displayNo(d)}`}>
          {docType === "quotation" && d.status !== "draft" && onCreateRevision && (
            <Button variant="ghost" size="sm" leftIcon={<Copy size={13} />} loading={busyId === `rev-${d.id}`} disabled={editing !== null}
              style={{ justifyContent: "flex-start" }}
              onClick={() => run(`rev-${d.id}`, () => onCreateRevision(d))}>
              New version
            </Button>
          )}
          {d.status === "draft" && <Button variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} style={{ justifyContent: "flex-start" }} disabled={editing !== null} onClick={() => setConfirmDelete(d)}>Delete draft</Button>}
          {onVoid && d.status === "issued" && (docType === "quotation" || docType === "invoice") && (
            <Button variant="ghost" size="sm" loading={busyId === `void-${d.id}`} disabled={editing !== null}
              style={{ justifyContent: "flex-start" }}
              title="Void this document. Its number is freed and reused by the next issue"
              onClick={() => run(`void-${d.id}`, () => onVoid(d))}>
              Void
            </Button>
          )}
          {(d.status === "void" || (d.status === "issued" && (docType === "quotation" || docType === "invoice"))) && (
            <Button variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} aria-label="Delete document"
              style={{ justifyContent: "flex-start" }}
              title="Delete this document. Its number is freed and the next issue reuses it"
              disabled={editing !== null} onClick={() => setConfirmDelete(d)}>
              Delete document
            </Button>
          )}
          </ActionsMenu>
          <Button variant="ghost" size="sm" iconOnly aria-label={`${collapsedIds.has(d.id) ? "Show" : "Hide"} details for ${displayNo(d)}`}
            aria-expanded={!collapsedIds.has(d.id)} aria-controls={`document-summary-${d.id}`}
            onClick={() => setCollapsedIds((current) => {
              const next = new Set(current);
              if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
              return next;
            })}>
            {collapsedIds.has(d.id) ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </Button>
          </div>
        </div>

        {!collapsedIds.has(d.id) && (
          <div id={`document-summary-${d.id}`} style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr>
                  {["Item", "Qty", "Unit price", "Amount"].map((h, i) => (
                    <th key={h} style={{ ...cell, textAlign: i ? "right" : "left", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)", borderBottom: "1px solid var(--border-strong)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td style={{ ...cell, whiteSpace: "pre-wrap" }}>{li.name}{li.note ? <span style={{ color: "var(--text-subtle)" }}>{`\n${li.note}`}</span> : null}</td>
                    <td style={{ ...cell, textAlign: "right", fontFamily: "var(--font-mono)" }}>{li.qty} {li.unit ?? "pcs"}</td>
                    <td style={{ ...cell, textAlign: "right", fontFamily: "var(--font-mono)" }}>{li.unitPrice.toLocaleString("en-US")}</td>
                    <td style={{ ...cell, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {li.billed === false ? <span style={{ color: "var(--text-subtle)" }}>ref only</span> : li.amount.toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              <span>Total <b style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)" }}>{money(d.total, d.currency)}</b></span>
              {d.discountPct > 0 && <span>Discount {d.discountPct}%</span>}
              {!!d.tax && <span>Tax {money(d.tax, d.currency)}</span>}
              {d.validUntil && <span>Valid until {d.validUntil}</span>}
              {d.incoterms && <span>Incoterms {d.incoterms}</span>}
            </div>
            {d.paymentTerms && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><b>Payment</b> {d.paymentTerms}</div>}
          </div>
        )}
        {(d.status === "draft" || (docType === "quotation" && onEmail) || (docType === "purchase_order" && onEmail) || (docType === "invoice" && canSendToFinance)) && (
          <div role="group" aria-label={`Workflow for ${displayNo(d)}`} style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginRight: "auto" }}>Next step</span>
          {docType === "quotation" && d.status !== "draft" && onEmail && (
            <Button variant="soft" size="sm" leftIcon={<Mail size={13} />}
              disabled={editing !== null} title="Compose a styled email to the customer · sent from your Gmail with your signature"
              onClick={() => setComposer({
                doc: d,
                to: companyContact && companyContact.includes("@") ? companyContact : "",
                subject: `Workspace Quotation ${d.docNo ?? ""} for ${companyName}`.trim(),
                message: `Dear ${companyName} team,\n\nPlease find our quotation ${d.docNo ?? ""} attached as a PDF and summarized below.\n\nWe would be happy to walk you through the details. Just reply to this email.`,
                richQuote: true,
              })}>
              Email
            </Button>
          )}
          {docType === "purchase_order" && onEmail && (
            <>
              <Button variant="ghost" size="sm" leftIcon={<Sparkles size={13} />} loading={busyId === `compare-${d.id}`}
                title={d.linkedDocId ? "AI-compare this customer PO against its quotation" : "Link a quotation first (Edit → Linked quotation)"}
                disabled={!d.linkedDocId || editing !== null}
                onClick={() => void runCompare(d)}>
                Compare (AI)
              </Button>
              {onCreateInvoiceFromPo && d.status !== "void" && (
                <Button variant="soft" size="sm" leftIcon={<Banknote size={13} />} loading={busyId === `inv-${d.id}`} disabled={editing !== null}
                  title="Create an invoice draft from this PO's line items"
                  onClick={() => run(`inv-${d.id}`, () => onCreateInvoiceFromPo(d))}>
                  Create invoice
                </Button>
              )}
            </>
          )}
          {d.status === "draft" && <Button variant="primary" size="sm" leftIcon={<Send size={13} />} disabled={editing !== null} loading={busyId === d.id} onClick={() => run(d.id, () => onIssue(d))}>Issue document</Button>}
          {docType === "invoice" && d.status !== "draft" && canSendToFinance && (
            <Button variant="soft" size="sm" leftIcon={<Banknote size={13} />} disabled={editing !== null} loading={busyId === d.id} onClick={() => run(d.id, () => onSendToFinance(d))}>
              Save finance handoff
            </Button>
          )}

          </div>
        )}
        {editing?.doc?.id === d.id && editor}

        </div>
      ))}

      {editing && !editing.doc && editor}

      {/* 인쇄본 미리보기 — 행 클릭 시 (인쇄와 같은 문서) */}
      <Modal
        open={docPreview !== null}
        onClose={() => setDocPreview(null)}
        title={docPreview ? `${DOC_LABEL[docPreview.doc.docType]} ${docPreview.doc.docNo?.replace(/-VOID$/, "") ?? "(draft)"}` : ""}
        size="lg"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setDocPreview(null)}>Close</Button>
            <Button leftIcon={<Printer size={13} />}
              onClick={() => { if (docPreview) void printDocument(docPreview.doc, companyName); }}>
              Print
            </Button>
          </div>
        }
      >
        {docPreview && (
          <iframe srcDoc={docPreview.html} title="Document preview"
            style={{ width: "100%", height: "68vh", border: "1px solid var(--border-subtle)", borderRadius: 8, background: "#fff" }} />
        )}
      </Modal>

      {/* 이메일 컴포저 — 변수 칩·템플릿·AI 멘트·서명 미리보기는 컴포넌트 안에 있다.
         열릴 때마다 fresh mount되도록 조건부 렌더 (초기값 props가 그대로 시드). */}
      {composer && onEmail && (
        <EmailComposerModal
          doc={composer.doc}
          companyName={companyName}
          companyContact={companyContact}
          initialTo={composer.to}
          initialSubject={composer.subject}
          initialMessage={composer.message}
          richQuote={composer.richQuote}
          toSuggestions={contactEmails ?? undefined}
          attachment={composer.richQuote ? {
            filename: documentPdfFilename(composer.doc),
            build: () => buildDocumentPdfAttachment(composer.doc, companyName),
          } : undefined}
          onClose={() => setComposer(null)}
          onSend={async (opts) => {
            await onEmail(composer.doc, opts);
            setComposer(null);
          }}
        />
      )}

      {/* 고객 PO 추출 확인 — Save 전엔 아무것도 저장되지 않는다 */}
      <Modal
        open={poIntake !== null}
        onClose={() => setPoIntake(null)}
        title="Register customer PO"
        subtitle={poIntake?.fileName}
        size="md"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setPoIntake(null)}>Discard</Button>
            <Button loading={busyId === "po-intake-save"} disabled={!poIntake?.poNumber.trim() || !poIntake?.lineItems.length}
              onClick={() => void savePoIntake()}>
              Save under {poIntake?.poNumber.trim() || "customer number"}
            </Button>
          </div>
        }
      >
        {poIntake && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {poIntake.notes.length > 0 && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--amber-600, #b45309)" }}>
                {poIntake.notes.map((n, i) => <div key={i}>• {n}</div>)}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px", gap: 10 }}>
              <label style={fieldStyle}>
                <span style={labelStyle}>Customer PO number (becomes the document number)</span>
                <Input size="sm" mono value={poIntake.poNumber}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPoIntake({ ...poIntake, poNumber: e.target.value })} />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>PO date</span>
                <Input size="sm" type="date" value={poIntake.poDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPoIntake({ ...poIntake, poDate: e.target.value })} />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Currency</span>
                <Input size="sm" list={DL.currency} value={poIntake.currency}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPoIntake({ ...poIntake, currency: e.target.value.toUpperCase().slice(0, 3) })} />
              </label>
            </div>
            <label style={fieldStyle}>
              <span style={labelStyle}>Linked quotation (checked by Compare AI)</span>
              <Select size="sm" value={poIntake.quotationId}
                options={[
                  { value: "", label: issuedQuotes.length ? "(none)" : "No issued quotations" },
                  ...issuedQuotes.map((q) => ({ value: q.id, label: q.docNo ?? "(draft)" })),
                ]}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const q = documents.find((d) => d.id === e.target.value);
                  setPoIntake({ ...poIntake, quotationId: e.target.value, dealId: q?.dealId ?? poIntake.dealId });
                }} />
            </label>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
                <thead>
                  <tr>
                    {["Item", "Qty", "Unit price", "Amount"].map((h, i) => (
                      <th key={h} style={{ textAlign: i ? "right" : "left", padding: "5px 8px", borderBottom: "1px solid var(--border-strong)", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poIntake.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)" }}>{li.name}</td>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{li.qty} {li.unit}</td>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{li.unitPrice.toLocaleString("en-US")}</td>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{li.amount.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
              Saved as an <b>issued</b> record under the customer&rsquo;s own number (editable later via Edit). Invoices are built from this PO, not the quotation.
            </span>
          </div>
        )}
      </Modal>

      {/* AI 대조 결과 — 불일치가 있으면 확인 메일로 이어진다 */}
      <Modal
        open={compare !== null}
        onClose={() => setCompare(null)}
        title={compare?.match ? "PO matches the quotation" : "Discrepancies found"}
        subtitle={compare ? `${compare.po.docNo ?? "PO"} ↔ ${compare.quote.docNo ?? "quotation"}` : undefined}
        size="md"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setCompare(null)}>Close</Button>
            {compare && !compare.match && onEmail && (
              <Button leftIcon={<Mail size={13} />} onClick={openDiscrepancyEmail}>
                Email customer to confirm
              </Button>
            )}
          </div>
        }
      >
        {compare && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-default)" }}>{compare.summary}</span>
            {compare.discrepancies.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
                <thead>
                  <tr>
                    {["Field", "Quotation", "Customer PO", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "5px 8px", borderBottom: "1px solid var(--border-strong)", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compare.discrepancies.map((d, i) => (
                    <tr key={i}>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600 }}>{d.field}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border-subtle)" }}>{d.quotation || "N/A"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border-subtle)" }}>{d.po || "N/A"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <Badge size="sm" tone={d.severity === "major" ? "danger" : "warning"}>{d.severity}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete && confirmDelete.status !== "draft" ? "Delete document" : "Delete draft"}
        subtitle={confirmDelete ? confirmDelete.docNo?.replace(/-VOID$/, "") ?? "(draft)" : undefined}
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                const d = confirmDelete;
                setConfirmDelete(null);
                if (d) void run(d.id, () => onDelete(d));
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        {confirmDelete && confirmDelete.status !== "draft"
          ? "This deletes the issued document. Its number is freed. The next issue takes it. This can’t be undone."
          : "This can’t be undone."}
      </Modal>

      {/* 카탈로그/빌드 픽커 — 클릭 시 라인아이템으로 삽입 */}
      <Modal
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={picker === "catalog" ? "Add from catalog" : "Load build spec"}
        subtitle={picker === "catalog" ? "Pick a saved item to insert as a line" : "Insert an Engineering build's spec summary as a line"}
        size="md"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pickerError && <span style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)" }}>{pickerError}</span>}
          {picker === "catalog" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <Input size="sm" style={{ flex: 1 }} value={pickerQuery} placeholder="Search…"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPickerQuery(e.target.value)} />
                <Button variant="secondary" size="sm" leftIcon={<Settings2 size={13} />}
                  title="Add, edit or delete catalog items"
                  onClick={() => { setPicker(null); setManagerOpen(true); }}>
                  Manage catalog
                </Button>
              </div>
              {catalog === null ? (
                <div style={{ display: "grid", placeItems: "center", padding: 20 }}><Spinner /></div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 10 }}>
                  {catalog
                    .filter((c) => !pickerQuery.trim() || `${c.modelCode} ${c.name}`.toLowerCase().includes(pickerQuery.toLowerCase()))
                    .map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <button
                          type="button"
                          style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "none", cursor: "pointer", fontFamily: "var(--font-sans)", padding: 0 }}
                          onClick={() => addLine({ name: c.name, qty: 1, unit: c.unit, unitPrice: c.unitPrice, amount: c.unitPrice })}
                        >
                          <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name.split("\n")[0]}
                          </span>
                          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
                            {c.modelCode ? `${c.modelCode} · ` : ""}{c.unit} · {c.currency} {c.unitPrice.toLocaleString("en-US")}
                          </span>
                        </button>
                        <Button variant="ghost" size="sm" iconOnly aria-label="Remove from catalog"
                          onClick={async () => {
                            try { await deactivateCatalogItem(c.id); setCatalog((prev) => prev?.filter((x) => x.id !== c.id) ?? null); }
                            catch { setPickerError("Failed to remove the item."); }
                          }}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    ))}
                  {catalog.length === 0 && (
                    <div style={{ padding: 16, fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>
                      The catalog is empty · save a line with the bookmark button next to it to reuse it here.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {picker === "build" && (
            builds === null ? (
              <div style={{ display: "grid", placeItems: "center", padding: 20 }}><Spinner /></div>
            ) : builds.length === 0 ? (
              <div style={{ padding: 12, fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>
                This company has no Engineering builds yet. Create one on the Engineering screen first.
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 10 }}>
                {builds.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", cursor: "pointer", fontFamily: "var(--font-sans)", padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}
                    onClick={() => addLine({ name: buildSpecDescription(b), qty: 1, unit: "pcs", unitPrice: 0, amount: 0 })}
                  >
                    <span style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>{b.modelCode || "(no model code)"}</span>
                    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{b.status} · spec summary becomes the line description (enter the unit price yourself)</span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </Modal>

      {/* 라인아이템 이미지 픽커 — 파일 업로드 또는 이 회사 Engineering 빌드 사진 재사용 */}
      <Modal
        open={imgPicker !== null}
        onClose={() => setImgPicker(null)}
        title="Line item image"
        subtitle="Upload a file, or reuse one of this company's Engineering photos"
        size="md"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {imgError && <span style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)" }}>{imgError}</span>}
          <div>
            <input id="doc-line-image-input" type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onLineImageFile(f); }} />
            <Button variant="secondary" size="sm" leftIcon={imgBusy ? <Spinner size="sm" /> : <Upload size={14} />} disabled={imgBusy}
              onClick={() => document.getElementById("doc-line-image-input")?.click()}>
              {imgBusy ? "Uploading…" : "Upload image"}
            </Button>
          </div>
          <span style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)" }}>
            From Engineering photos
          </span>
          {!companyId ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>Engineering photos are not available here.</span>
          ) : engPhotos === null ? (
            <div style={{ display: "grid", placeItems: "center", padding: 20 }}><Spinner /></div>
          ) : engPhotos.length === 0 ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>
              No Engineering photos for this company yet. Upload build photos on the Engineering tab first.
            </span>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, maxHeight: 300, overflowY: "auto" }}>
              {engPhotos.map((p) => (
                <button key={p.id} type="button"
                  style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, background: "none", cursor: "pointer", padding: 6, display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch", fontFamily: "var(--font-sans)" }}
                  onClick={() => {
                    if (imgPicker !== null) setItem(imgPicker, { imagePath: p.path });
                    setImgPicker(null);
                  }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL(1h) 썸네일이라 next/image 최적화 대상이 아니다 */}
                  <img src={p.url} alt={p.label} style={{ width: "100%", height: 72, objectFit: "cover", borderRadius: 4 }} />
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* 문서 AI 임포트 리뷰 — Apply 전엔 아무것도 저장되지 않는다 */}
      <Modal
        open={aiIntake !== null}
        onClose={() => setAiIntake(null)}
        title={`Import ${DOC_LABEL[docType].toLowerCase()} (AI)`}
        subtitle={aiIntake?.fileName}
        size="md"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setAiIntake(null)}>Discard</Button>
            <Button loading={busyId === "ai-intake-save"} disabled={!aiIntake?.r.lineItems.length}
              onClick={() => void applyDocIntake()}>
              Apply as draft
            </Button>
          </div>
        }
      >
        {aiIntake && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {aiError && (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)" }}>
                {aiError} <button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", textDecoration: "underline", font: "inherit" }} onClick={() => setAiError(null)}>dismiss</button>
              </span>
            )}
            {aiIntake.r.notes.length > 0 && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--amber-600, #b45309)" }}>
                {aiIntake.r.notes.map((n, i) => <div key={i}>• {n}</div>)}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "90px 140px 110px 1fr", gap: 10 }}>
              <label style={fieldStyle}>
                <span style={labelStyle}>Currency</span>
                <Input size="sm" list={DL.currency} value={aiIntake.r.currency}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiField({ currency: e.target.value.toUpperCase().slice(0, 3) })} />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Valid until</span>
                <Input size="sm" type="date" value={aiIntake.r.validUntil}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiField({ validUntil: e.target.value })} />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Incoterms</span>
                <Input size="sm" list={DL.incoterms} value={aiIntake.r.incoterms}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiField({ incoterms: e.target.value })} />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Payment terms</span>
                <Input size="sm" list={DL.payment} value={aiIntake.r.paymentTerms}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiField({ paymentTerms: e.target.value })} />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "90px 90px 1fr", gap: 10 }}>
              <label style={fieldStyle}>
                <span style={labelStyle}>Discount %</span>
                <Input size="sm" mono value={String(aiIntake.r.discountPct)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiField({ discountPct: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Tax rate %</span>
                <Input size="sm" mono value={String(aiIntake.r.taxRate)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiField({ taxRate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Deal (commercial spine)</span>
                <Select size="sm" value={aiIntake.dealId}
                  options={[
                    { value: "", label: dealOptions.length ? "(no deal)" : "No deals yet" },
                    ...dealOptions.map((d) => ({ value: d.id, label: `${d.dealNo} · ${d.title.slice(0, 36)}` })),
                  ]}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAiIntake({ ...aiIntake, dealId: e.target.value })} />
              </label>
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
                <thead>
                  <tr>
                    {["Item", "Qty", "Unit price", "Amount"].map((h, i) => (
                      <th key={h} style={{ textAlign: i ? "right" : "left", padding: "5px 8px", borderBottom: "1px solid var(--border-strong)", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiIntake.r.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap" }}>{li.name}</td>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{li.qty} {li.unit}</td>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{li.unitPrice.toLocaleString("en-US")}</td>
                      <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{li.amount.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                  {aiIntake.r.lineItems.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: 12, color: "var(--text-subtle)" }}>No priced lines were found · adjust below or discard.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {aiIntake.r.terms && (
              <label style={fieldStyle}>
                <span style={labelStyle}>Terms summary</span>
                <Textarea rows={3} value={aiIntake.r.terms}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAiField({ terms: e.target.value })} />
              </label>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Input size="sm" style={{ flex: 1 }} value={aiAdjust} placeholder='Adjust with AI · e.g. "change qty of line 2 to 10"'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiAdjust(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !aiAdjustBusy) void adjustDocIntake(); }} />
              <Button variant="soft" size="sm" leftIcon={aiAdjustBusy ? <Spinner size="sm" /> : <Sparkles size={13} />}
                disabled={aiAdjustBusy || !aiAdjust.trim()}
                onClick={() => void adjustDocIntake()}>
                {aiAdjustBusy ? "Adjusting…" : "Adjust"}
              </Button>
            </div>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
              Nothing is saved until you press <b>Apply as draft</b> : the draft opens in this tab&rsquo;s list for further editing.
            </span>
          </div>
        )}
      </Modal>

      {/* 카탈로그 관리자 — 픽커와 같은 캐시(catalog)를 공유해 변경이 즉시 반영된다 */}
      <CatalogManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} items={catalog} onItemsChange={setCatalog} />
    </div>
  );
}
