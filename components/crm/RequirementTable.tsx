"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, Pencil, RotateCw, Trash2, Users, Info } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Alert } from "@/components/ds/feedback/Alert";
import type { SpecSheetRow as SpecSheetRowT, SpecSheetSection } from "@/components/ds/sheets/SpecSheet";
import { Stepper } from "@/components/ds/navigation/Stepper";
import { EngineeringPanel } from "./EngineeringPanel";
import { ExperimentsPanel } from "./ExperimentsPanel";
import { ProcurementPanel } from "./ProcurementPanel";
import { InspectionPanel } from "./InspectionPanel";
import type { Build, BuildFile, ChangeRequest, Company, CompanyDocument, DocType, FeedContext} from "@/types/domain";
import { DocumentPanel, STANDARD_TERMS, type DocCreateMeta, type DocFormValue } from "./DocumentPanel";
import { SpecBuildsPanel } from "./SpecBuildsPanel";
import { FirstContactPanel } from "./FirstContactPanel";
import { CrmManualModal } from "./CrmManualModal";
import { NdaPanel } from "./NdaPanel";
import { TargetingPanel } from "./TargetingPanel";
import type { DealSummary } from "@/lib/data/deals";
import type { EmailAttachment } from "@/lib/mentions";


function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


function quotationFormFromSpec(company: Company, sections: SpecSheetSection[]): DocFormValue {
  const vals: string[] = [];
  outer: for (const sec of sections) {
    for (const row of sec.rows as SpecSheetRowT[]) {
      const v = row.merged ? row.value : [row.hot, row.cold].filter((x) => String(x ?? "").trim()).join(" / ");
      if (v && String(v).trim()) vals.push(`${String(row.param)}: ${String(v)}${row.unit ? ` ${String(row.unit)}` : ""}`);
      if (vals.length >= 6) break outer;
    }
  }
  return {
    lineItems: [{
      name: `${company.name} deliverable (per spec sheet)`,
      qty: 1, unit: "set", unitPrice: 0, amount: 0,
      note: vals.join(" · "),
    }],
    currency: "USD",
    validUntil: daysFromToday(14),
    incoterms: "EXW",
    paymentTerms: "100% before shipment",
    billTo: company.name,
    shipTo: "",
    projectRef: company.ref,
    discountPct: 0,
    taxRate: 0,
    terms: STANDARD_TERMS,
    memo: "Created from the spec sheet.",
    fromAddr: "us",
    dealId: "",
  };
}

const ENG_TABS: FeedContext[] = ["spec", "engineering", "procurement", "inspection", "experiments"];
const SALES_TABS: FeedContext[] = ["targeting", "first_contact", "nda", "spec", "quotation", "purchase_order", "invoice"];


export function RequirementTable({
  view,
  buildsLoading = false,
  documentsLoading = false,
  focusBuildId,
  specRequestId,
  company,
  tab,
  onTabChange,
  documents,
  pendingForCompany,
  canSendToFinance,
  onBack,
  headerRight,
  onDelete,
  onEditCompany,
  onShowCompanies,
  onUpload,
  onCreateDoc,
  onCreateInvoiceFromPo,
  onVoidDoc,
  onLinkDealDoc,
  selectedDeal,
  onSelectDeal,
  onSaveDoc,
  onIssueDoc,
  onDeleteDoc,
  onSendToFinance,
  onCreateRevision,
  meId,
  builds,
  buildFiles,
  onBuildsChanged,
  onLogEngineering,
  onSelectSpecVersion,
  onLogSpec,
  onSpecSynced,
  onSelectDoc,
  onEmailDoc,
  onRefresh,
  onLogFeed,
  onCompanyPatch,
  fcPrefill,
}: {
  
  view: "sales" | "engineering";
  
  buildsLoading?: boolean;
  documentsLoading?: boolean;
  
  focusBuildId?: string | null;
  specRequestId?: string | null;
  company: Company;
  tab: FeedContext;
  onTabChange: (tab: FeedContext) => void;
  
  onLogFeed?: (summary: string, context: FeedContext) => void | Promise<void>;
  
  onCompanyPatch?: (patch: Partial<Company>) => Promise<void> | void;
  
  fcPrefill?: { body?: string; nextAction?: string } | null;
  documents: CompanyDocument[];
  pendingForCompany: ChangeRequest[];
  canSendToFinance: boolean;
  onBack: () => void;
  
  headerRight?: React.ReactNode;
  onDelete?: () => void;
  
  onEditCompany?: () => void;
  
  onShowCompanies?: () => void;
  onUpload: () => void;
  onCreateDoc: (docType: DocType, form: DocFormValue, meta?: DocCreateMeta) => Promise<void>;
  
  onCreateInvoiceFromPo?: (po: CompanyDocument) => Promise<void>;
  
  onVoidDoc?: (doc: CompanyDocument) => Promise<void>;
  
  onLinkDealDoc?: (doc: CompanyDocument, dealId: string) => Promise<void>;
  
  selectedDeal?: DealSummary | null;
  onSelectDeal?: (deal: DealSummary | null) => void;
  onSaveDoc: (doc: CompanyDocument, form: DocFormValue) => Promise<void>;
  onIssueDoc: (doc: CompanyDocument) => Promise<void>;
  onDeleteDoc: (doc: CompanyDocument) => Promise<void>;
  onSendToFinance: (doc: CompanyDocument) => Promise<void>;
  
  onCreateRevision: (doc: CompanyDocument) => Promise<void>;
  meId: string;
  builds: Build[];
  buildFiles: Record<string, BuildFile[]>;
  onBuildsChanged: () => Promise<void>;
  onLogEngineering: (summary: string) => Promise<void>;
  
  onSelectSpecVersion: (v: { id: string; label: string } | null) => void;
  onLogSpec: (summary: string, targetId?: string | null) => Promise<void>;
  onSpecSynced: () => void;
  
  onSelectDoc: (v: { id: string; label: string } | null) => void;
  
  onEmailDoc: (doc: CompanyDocument, opts: { to: string[]; cc: string[]; bcc: string[]; subject: string; message: string; html?: string; attachments?: EmailAttachment[] }) => Promise<void>;
  
  onRefresh: () => Promise<void>;
}) {
  // 고객사의 spec sheet는 딜 단위로 나뉜다 (CRM·Engineering 동일) — In-house만 빌드/버전.
  const isInhouseCo = company.name === "In-house";

  const [createdBuildId, setCreatedBuildId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  function switchTab(next: FeedContext) {
    onTabChange(next);
  }

  const docCount = (t: DocType) => documents.filter((d) => d.docType === t).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {view !== "sales" && (
          <Button variant="ghost" size="sm" iconOnly aria-label="Back to list" onClick={onBack}>
            <ArrowLeft size={18} />
          </Button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10 }}>
          {onShowCompanies ? (
            <button type="button" className="sx-company-switch" onClick={onShowCompanies} title="Switch company" aria-label={`${company.name} — switch company`}>
              {company.name}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          ) : (
            <span style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>
              {company.name}
            </span>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            {company.partyCode || company.ref}
          </span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{company.sector}</span>
        </div>
        {view === "sales" && (
          <Button variant="ghost" size="sm" iconOnly aria-label="How the CRM works" title="How the CRM works" onClick={() => setManualOpen(true)}>
            <Info size={15} />
          </Button>
        )}
        {onEditCompany && (
          <Button variant="ghost" size="sm" iconOnly aria-label="Edit company info" title="Edit company info (name, code, sector…)" onClick={onEditCompany}>
            <Pencil size={15} />
          </Button>
        )}
        <Button variant="ghost" size="sm" iconOnly aria-label="Refresh" title="Refresh" onClick={() => onRefresh()}>
          <RotateCw size={15} />
        </Button>
        {onDelete && (
          <Button variant="ghost" size="sm" iconOnly aria-label="Delete company" title="Delete company" className="sx-danger-ghost" onClick={onDelete}>
            <Trash2 size={16} />
          </Button>
        )}
        {headerRight}
      </div>

      <CrmManualModal open={manualOpen} onClose={() => setManualOpen(false)} />
      {}
      {}
      <div className="sx-mobile-xscroll sx-stepper-fit" style={{ flexShrink: 0, padding: "16px 20px 0", overflowX: "auto" }}>
        <div style={{ minWidth: 560 }}>
        {view === "engineering" ? (
          <Stepper
            steps={[
              { title: "Spec sheet", subtitle: selectedDeal ? selectedDeal.dealNo : "per deal · parts" },
              {
                title: "Printing verification",
                subtitle: builds.length
                  ? `${builds.length} build${builds.length === 1 ? "" : "s"} \u00b7 ${builds.filter((b) => b.status === "passed").length} passed`
                  : "per model",
              },
              { title: "Procurement", subtitle: "parts · vendors" },
              { title: "Inspection", subtitle: "receive · verify" },
              { title: "Experiments", subtitle: "test runs · accept" },
            ]}
            current={-1} // 진행도 색 표시 안 함 — 순수 탭 버튼 (2026-09-17 지시)
            active={ENG_TABS.indexOf(tab)}
            clickAny
            onStepClick={(i: number) => switchTab(ENG_TABS[i])}
          />
        ) : (
          <Stepper
            steps={[
              { title: "Targeting", subtitle: "research & fit" },
              { title: "First contact", subtitle: "touches · no deal" },
              { title: "NDA", subtitle: company.ndaStatus === "signed" ? `signed${company.ndaSignedOn ? ` ${company.ndaSignedOn}` : ""}` : company.ndaStatus === "in_review" ? "in review" : "sign & file" },
              { title: "Spec sheet", subtitle: selectedDeal ? selectedDeal.dealNo : "deals start here" },
              { title: "Quotation", subtitle: docCount("quotation") ? `${docCount("quotation")} doc${docCount("quotation") === 1 ? "" : "s"}` : "price the job" },
              { title: "Purchase Order", subtitle: docCount("purchase_order") ? `${docCount("purchase_order")} doc${docCount("purchase_order") === 1 ? "" : "s"}` : "customer commits" },
              { title: "Invoice", subtitle: docCount("invoice") ? `${docCount("invoice")} doc${docCount("invoice") === 1 ? "" : "s"}` : "get paid" },
            ]}
            current={-1} // 진행도 색 표시 안 함 — 순수 탭 버튼 (2026-09-17 지시)
            active={SALES_TABS.indexOf(tab)}
            clickAny
            onStepClick={(i: number) => switchTab(SALES_TABS[i])}
          />
        )}
        </div>
      </div>

      <div key={tab} className="sx-scroll sx-anim-view" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 20 }}>
        {pendingForCompany.length > 0 && (
          <Alert tone="warning" title={`${pendingForCompany.length} change${pendingForCompany.length === 1 ? "" : "s"} awaiting approval`} style={{ marginBottom: 12 }}>
            {pendingForCompany
              .map((r) => {
                const p = r.payload as { label?: string; edits?: unknown[] };
                if (p.edits?.length) return `${p.edits.length} spec edit${p.edits.length === 1 ? "" : "s"}`;
                return p.label ?? r.targetKind;
              })
              .join(" · ")}
            {" · approvers act on these in the Approvals tab of the CRM list."}
          </Alert>
        )}

        {tab === "targeting" ? (
          <TargetingPanel company={company}
            onLogged={(summary) => onLogFeed?.(summary, "targeting")} />
        ) : tab === "first_contact" ? (
          <FirstContactPanel company={company} meId={meId} prefill={fcPrefill ?? undefined}
            onLogged={(summary) => onLogFeed?.(summary, "first_contact")} />
        ) : tab === "nda" ? (
          <NdaPanel company={company}
            onPatch={(patch) => onCompanyPatch?.(patch)}
            onLogged={(summary) => onLogFeed?.(summary, "nda")} />
        ) : tab === "engineering" ? (
          <EngineeringPanel
            loading={buildsLoading}
            focusBuildId={createdBuildId ?? focusBuildId}
            companyId={company.id}
            meId={meId}
            builds={builds}
            filesByBuild={buildFiles}
            onBuildsChanged={onBuildsChanged}
            onLog={onLogEngineering}
            onOpenExperiments={() => switchTab("procurement")}
          />
        ) : tab === "procurement" ? (
          
          <ProcurementPanel
            company={company}
            meId={meId}
            builds={builds}
            onLog={(summary) => void onLogFeed?.(summary, "procurement")}
          />
        ) : tab === "inspection" ? (
          
          <InspectionPanel
            company={company}
            meId={meId}
            builds={builds}
            onLog={(summary) => void onLogFeed?.(summary, "inspection")}
            onOpenExperiments={() => switchTab("experiments")}
          />
        ) : tab === "experiments" ? (
          
          <ExperimentsPanel
            company={company}
            meId={meId}
            builds={builds}
            onLog={(summary) => void onLogFeed?.(summary, "experiments")}
            onSpecSynced={onSpecSynced}
          />
        ) : tab === "spec" && view === "engineering" ? (
          
          <SpecBuildsPanel
            key={company.id}
            company={company}
            meId={meId}
            dealMode={!isInhouseCo}
            onLog={onLogSpec}
            onSelectVersion={onSelectSpecVersion}
            onSelectDeal={onSelectDeal}
            onPvBuildCreated={async (buildId) => { await onBuildsChanged(); setCreatedBuildId(buildId); switchTab("engineering"); }}
          />
        ) : tab === "spec" ? (
          
          <SpecBuildsPanel
            key={`crm-${company.id}`}
            company={company}
            meId={meId}
            dealMode={!isInhouseCo}
            hideConfidential
            specRequestId={specRequestId}
            onQuotationFromSpec={(specSections, dealId) => {
              void onCreateDoc("quotation", { ...quotationFormFromSpec(company, specSections), dealId: dealId ?? "" }).then(() => onTabChange("quotation"));
            }}
            onLog={onLogSpec}
            onSelectVersion={onSelectSpecVersion}
            onSelectDeal={onSelectDeal}
            onPvBuildCreated={onBuildsChanged}
          />
        ) : (
          <DocumentPanel loading={documentsLoading}
            docType={tab as DocType}
            onCreateInvoiceFromPo={onCreateInvoiceFromPo}
            onVoid={onVoidDoc}
            onLinkDeal={onLinkDealDoc}
            companyId={company.id}
            companyName={company.name}
            companyContact={company.contact}
            onSelectDoc={onSelectDoc}
            onEmail={onEmailDoc}
            documents={documents}
            canSendToFinance={canSendToFinance}
            onUpload={onUpload}
            onCreate={(form, meta) => onCreateDoc(tab as DocType, form, meta)}
            onSave={onSaveDoc}
            onIssue={onIssueDoc}
            onDelete={onDeleteDoc}
            onSendToFinance={onSendToFinance}
            onCreateRevision={onCreateRevision}
          />
        )}
      </div>
    </div>
  );
}
