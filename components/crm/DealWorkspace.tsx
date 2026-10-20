"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Building2, PenLine } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Badge } from "@/components/ds/core/Badge";
import { Select } from "@/components/ds/forms/Select";
import { Textarea } from "@/components/ds/forms/Textarea";
import type { Company, CompanyDocument } from "@/types/domain";
import { fetchDocuments } from "@/lib/data/documents";
import { fetchEmails, type CrmEmail } from "@/lib/data/emails";
import { fetchCompanyContacts, fetchLogsForContacts, type ContactLog, type CustomerContact } from "@/lib/data/customers";
import { fetchFollowUps, type FollowUp } from "@/lib/data/followups";
import { memberName } from "@/lib/mock/team";
import {
  DEAL_STATUS_LABEL, DEAL_STATUS_ORDER, INHOUSE_STATUS,
  SALES_STAGE_LABEL, SALES_STAGE_ORDER, execBadgeOf, salesStageOf, updateDeal,
  type DealStatus, type DealSummary, type SalesStage,
} from "@/lib/data/deals";



type WorkTab = "targeting" | SalesStage | "parts" | "execution" | "records";

const EXTRA_TABS: { key: WorkTab; label: string }[] = [
  { key: "parts", label: "Parts · Procurement" },
  { key: "execution", label: "Mfg · Test · Ship" },
  { key: "records", label: "Notes & records" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th style={{ width: "32%", textAlign: "left", fontWeight: 400, color: "var(--text-muted)", padding: "8px 6px", borderBottom: "1px solid var(--border-subtle)", fontSize: "var(--text-xs)", verticalAlign: "top" }}>{label}</th>
      <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border-subtle)", fontSize: "var(--text-xs)", color: "var(--text-strong)", overflowWrap: "anywhere" }}>{children}</td>
    </tr>
  );
}

function fmtMoney(n: number | null, currency: string): string {
  if (n == null) return "Not priced yet";
  return `${currency === "KRW" ? "₩" : "$"}${n.toLocaleString("en-US")}`;
}

export function DealWorkspace({
  deal,
  companyName,
  onOpenCompany,
  onStatusChange,
  onLogActivity,
}: {
  deal: DealSummary;
  companyName: string;
  
  onOpenCompany: (companyId: string, tab: "overview" | "documents") => void;
  onStatusChange: (deal: DealSummary, status: DealStatus) => void;
  
  onLogActivity: (deal: DealSummary) => void;
}) {
  const stage = salesStageOf(deal.status);
  const [tab, setTab] = useState<WorkTab>(stage);
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [emails, setEmails] = useState<CrmEmail[]>([]);
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [notes, setNotes] = useState(deal.notes);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // 연결 데이터 로드 — 딜/단계가 바뀌면 호출부가 key로 리마운트한다.
  useEffect(() => {
    let alive = true;
    if (deal.companyId) {
      fetchDocuments(deal.companyId)
        .then((all) => { if (alive) setDocs(all.filter((d) => d.dealId === deal.id)); })
        .catch(() => { if (alive) setDocs([]); });
      fetchEmails(deal.companyId)
        .then((all) => { if (alive) setEmails(all.filter((e) => e.dealId === deal.id)); })
        .catch(() => { if (alive) setEmails([]); });
      fetchCompanyContacts(deal.companyId, companyName, "crm")
        .then(async (cs) => {
          if (!alive) return;
          setContacts(cs);
          const ls = await fetchLogsForContacts(cs.map((c) => c.id));
          if (alive) setLogs(ls.filter((l) => l.dealId === deal.id));
        })
        .catch(() => { if (alive) { setContacts([]); setLogs([]); } });
      fetchFollowUps(deal.companyId)
        .then((fs) => { if (alive) setFollowUps(fs.filter((f) => f.dealId === deal.id && !f.done)); })
        .catch(() => { if (alive) setFollowUps([]); }); // 테이블 미실행 DB — 조용히
    }
    // companyId 없는 딜(인하우스)은 초기 빈 상태 그대로 — key 리마운트라 리셋 불필요
    return () => { alive = false; };
    // companyName은 표시용 — companyId와 함께 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id, deal.status, deal.companyId]);

  const latestDoc = (docType: string): CompanyDocument | null =>
    docs.filter((d) => d.docType === docType && d.status !== "void")
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0] ?? null;

  const primaryContact = contacts[0] ?? null;
  const lastTouch = useMemo(() => {
    const dates = [
      ...logs.map((l) => l.logDate),
      ...emails.map((e) => (e.sentAt ?? "").slice(0, 10)),
    ].filter(Boolean).sort();
    return dates[dates.length - 1] ?? null;
  }, [logs, emails]);

  async function saveNotes() {
    setNotesSaving(true);
    try {
      await updateDeal(deal.id, { notes });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      console.error("deal notes save failed:", err);
    } finally {
      setNotesSaving(false);
    }
  }

  const openDocs = () => { if (deal.companyId) onOpenCompany(deal.companyId, "documents"); };

  const quote = latestDoc("quotation");
  const po = latestDoc("purchase_order");
  const invoice = latestDoc("invoice");
  const execBadge = execBadgeOf(deal.status);

  const stageBody: Record<SalesStage, React.ReactNode> = {
    first_contact: (
      <tbody>
        <Row label="Primary contact">{primaryContact ? `${primaryContact.name}${primaryContact.title ? ` · ${primaryContact.title}` : ""}` : "No contact linked yet — add one in the company screen"}</Row>
        <Row label="Last touch">{lastTouch ?? "No recorded touch yet"}</Row>
        <Row label="Open follow-ups">{followUps.length ? `${followUps.length} — next: ${followUps[0].title}${followUps[0].dueDate ? ` (${followUps[0].dueDate})` : ""}` : "None"}</Row>
        <Row label="Records on this deal">{logs.length + emails.length} activities · emails</Row>
      </tbody>
    ),
    nda: (
      <tbody>
        <Row label="Counterparty">{companyName}</Row>
        <Row label="Signers">{primaryContact ? `${primaryContact.name} / Workspace` : "Workspace"}</Row>
        <Row label="Where">Attach signed files or manage signature requests in the company NDA step</Row>
        <Row label="After signing">Move the deal to Spec sheet — history stays on this deal</Row>
      </tbody>
    ),
    spec: (
      <tbody>
        <Row label="Spec sheet">Versions · confidential rows are managed in Documents</Row>
        <Row label="Parts linked">{deal.partCount}</Row>
        <Row label="Engineering">Handoff and builds continue from the company screen</Row>
      </tbody>
    ),
    quoting: (
      <tbody>
        <Row label="Quotation">{quote ? `${quote.docNo ?? "(draft)"} · ${quote.status}` : "No quotation on this deal yet"}</Row>
        <Row label="Amount">{quote ? fmtMoney(quote.total, quote.currency) : fmtMoney(deal.quoteTotal, deal.quoteCurrency)}</Row>
        <Row label="Send">Email composer (AI draft · PDF attach) lives in Documents</Row>
      </tbody>
    ),
    customer_po: (
      <tbody>
        <Row label="Customer PO">{po ? `${po.docNo ?? "(draft)"} · ${po.status}` : "No customer PO on this deal yet"}</Row>
        <Row label="Linked quote">{po?.linkedDocId ? (docs.find((d) => d.id === po.linkedDocId)?.docNo ?? "linked") : quote?.docNo ?? "Not linked"}</Row>
        <Row label="Execution">{execBadge ? `${execBadge} in progress` : "Manufacturing · testing · adoption are tracked as execution states"}</Row>
      </tbody>
    ),
    invoiced: (
      <tbody>
        <Row label="Invoice">{invoice ? `${invoice.docNo ?? "(draft)"} · ${invoice.status}` : "No invoice on this deal yet"}</Row>
        <Row label="Amount">{invoice ? fmtMoney(invoice.total, invoice.currency) : "Not issued"}</Row>
        <Row label="Finance">Issued invoices flow to Finance from Documents</Row>
        <Row label="Delivery">{execBadge === "Shipping" || execBadge === "Aftercare" ? `${execBadge} in progress` : "Shipping · aftercare tracked as execution states"}</Row>
      </tbody>
    ),
    closed: (
      <tbody>
        <Row label="Closed">{deal.updatedAt ? deal.updatedAt.slice(0, 10) : ""}</Row>
        <Row label="History">{`${docs.length} documents · ${deal.partCount} parts · ${logs.length + emails.length} records stay on ${deal.dealNo}`}</Row>
        <Row label="Reorder">Start a reorder deal from the company Spec sheet — it reuses existing specs and parts</Row>
      </tbody>
    ),
  };

  const extraBody: Record<"parts" | "execution", React.ReactNode> = {
    parts: (
      <tbody>
        <Row label="Parts">{deal.partCount} linked</Row>
        <Row label="Vendor POs">{deal.vendorPoCount}</Row>
        <Row label="Where">Link parts from the company Spec sheet; separate procurement service is not connected</Row>
      </tbody>
    ),
    execution: (
      <tbody>
        <Row label="Current">{execBadge || "Not in execution — sales stage " + SALES_STAGE_LABEL[stage]}</Row>
        <Row label="States">Manufacturing → Testing → Adopted → Shipping → Aftercare</Row>
        <Row label="Note">Execution states keep the deal pinned on its sales column in the board</Row>
      </tbody>
    ),
  };

  return (
    <section style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 16, marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {deal.dealNo} · {companyName}{deal.ownerKey ? ` · ${memberName(deal.ownerKey)}` : ""}
          </div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-strong)", marginTop: 2 }}>
            {deal.title}
            {execBadge && <Badge tone="warning" size="sm" style={{ marginLeft: 8, verticalAlign: "middle" }}>{execBadge}</Badge>}
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Stage
          <Select size="sm" value={deal.status}
            options={(deal.kind === "inhouse" ? INHOUSE_STATUS : DEAL_STATUS_ORDER).map((st) => ({ value: st, label: DEAL_STATUS_LABEL[st] }))}
            onChange={(e) => onStatusChange(deal, e.target.value as DealStatus)} />
        </label>
      </div>

      {}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", borderBottom: "1px solid var(--border-subtle)", padding: "12px 0", marginBottom: 14 }}>
        <button type="button" onClick={() => setTab("targeting")}
          style={{
            fontSize: "var(--text-xs)", padding: "5px 10px", borderRadius: "var(--radius-sm)", cursor: "pointer",
            border: `1px solid ${tab === "targeting" ? "var(--color-primary)" : "var(--border-subtle)"}`,
            background: tab === "targeting" ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-card)",
            color: "var(--color-primary)",
          }}>
          ✓ Targeting
        </button>
        {SALES_STAGE_ORDER.map((s) => {
          const si = SALES_STAGE_ORDER.indexOf(s);
          const cur = SALES_STAGE_ORDER.indexOf(stage);
          const mark = si < cur ? "✓ " : si === cur ? "● " : "";
          return (
            <button key={s} type="button" onClick={() => setTab(s)}
              style={{
                fontSize: "var(--text-xs)", padding: "5px 10px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                border: `1px solid ${tab === s ? "var(--color-primary)" : "var(--border-subtle)"}`,
                background: tab === s ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-card)",
                color: si < cur ? "var(--color-primary)" : si === cur ? "var(--text-strong)" : "var(--text-muted)",
                fontWeight: si === cur ? 600 : 400,
              }}>
              {mark}{SALES_STAGE_LABEL[s]}
            </button>
          );
        })}
        {EXTRA_TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{
              fontSize: "var(--text-xs)", padding: "5px 10px", borderRadius: "var(--radius-sm)", cursor: "pointer",
              border: `1px solid ${tab === t.key ? "var(--color-primary)" : "var(--border-subtle)"}`,
              background: tab === t.key ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-card)",
              color: "var(--text-muted)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "records" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }} className="sx-dealws-grid">
          <div>
            {logs.length + emails.length === 0 ? (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>No records linked directly to this deal yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {emails.slice(0, 6).map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    {e.direction === "outbound"
                      ? <ArrowUpRight size={13} style={{ color: "var(--color-primary)", marginTop: 2, flexShrink: 0 }} />
                      : <ArrowDownLeft size={13} style={{ color: "var(--green-600, #16a34a)", marginTop: 2, flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)" }}>{e.subject || "(no subject)"}</div>
                      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>Email · {(e.sentAt ?? "").slice(0, 10)}</div>
                    </div>
                  </div>
                ))}
                {logs.slice(0, 6).map((l) => (
                  <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <PenLine size={13} style={{ color: "var(--color-primary)", marginTop: 2, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-strong)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>{l.body}</div>
                      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{l.kind} · {l.logDate} · {memberName(l.authorKey)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 6 }}>Deal notes</div>
            <Textarea rows={5} value={notes} placeholder="Notes that belong to this deal…"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center", marginTop: 6 }}>
              {notesSaved && <span style={{ fontSize: "var(--text-2xs)", color: "var(--green-600, #16a34a)" }}>✓ Saved</span>}
              <Button size="sm" variant="secondary" loading={notesSaving} disabled={notes === deal.notes} onClick={() => void saveNotes()}>Save notes</Button>
            </div>
          </div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          {tab === "targeting" ? (
            <tbody>
              <Row label="Company">{companyName}</Row>
              <Row label="Status">Targeting research done — this company already has an active deal</Row>
              <Row label="Where">Targeting notes live on the company screen (Documents → Targeting)</Row>
            </tbody>
          ) : tab === "parts" || tab === "execution" ? extraBody[tab] : stageBody[tab as SalesStage]}
        </table>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {deal.companyId && (
          <>
            <Button size="sm" variant="secondary" leftIcon={<Building2 size={13} />}
              onClick={() => onOpenCompany(deal.companyId!, "overview")}>
              Open company & contacts
            </Button>
            <Button size="sm" variant="secondary" onClick={openDocs}>Open documents</Button>
          </>
        )}
        <Button size="sm" variant="secondary" leftIcon={<PenLine size={13} />} onClick={() => onLogActivity(deal)}>
          Log activity on this deal
        </Button>
      </div>
    </section>
  );
}



export type CompanyBoardStage = "targeting" | "first_contact" | "nda";

const COMPANY_PROCESS: ("targeting" | SalesStage)[] = ["targeting", ...SALES_STAGE_ORDER];
const processLabel = (s: "targeting" | SalesStage) => (s === "targeting" ? "Targeting" : SALES_STAGE_LABEL[s]);

export function CompanyStagePanel({
  company,
  stage,
  onOpenCompany,
  onLogActivity,
  onClose,
}: {
  company: Company;
  
  stage: CompanyBoardStage;
  onOpenCompany: (companyId: string, tab: "overview" | "documents") => void;
  onLogActivity: (companyId: string) => void;
  onClose: () => void;
}) {
  const cur = COMPANY_PROCESS.indexOf(stage);
  const [tab, setTab] = useState<"targeting" | SalesStage>(stage);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  useEffect(() => {
    let alive = true;
    fetchCompanyContacts(company.id, company.name, "crm")
      .then((cs) => { if (alive) setContacts(cs); })
      .catch(() => { if (alive) setContacts([]); });
    fetchFollowUps(company.id)
      .then((fs) => { if (alive) setFollowUps(fs.filter((f) => !f.done)); })
      .catch(() => { if (alive) setFollowUps([]); });
    return () => { alive = false; };
  }, [company.id, company.name]);

  const primaryContact = contacts[0] ?? null;
  const nda = company.ndaStatus ?? "not started";

  const body: React.ReactNode =
    tab === "targeting" ? (
      <tbody>
        <Row label="Sector">{company.sector || "—"}</Row>
        <Row label="Owner">{company.ownerId ? memberName(company.ownerId) : "Unassigned"}</Row>
        <Row label="Where">Targeting research notes live on the company screen (Documents → Targeting)</Row>
      </tbody>
    ) : tab === "first_contact" ? (
      <tbody>
        <Row label="Primary contact">{primaryContact ? `${primaryContact.name}${primaryContact.title ? ` · ${primaryContact.title}` : ""}` : "No contact linked yet — add one in the company screen"}</Row>
        <Row label="Open follow-ups">{followUps.length ? `${followUps.length} — next: ${followUps[0].title}${followUps[0].dueDate ? ` (${followUps[0].dueDate})` : ""}` : "None"}</Row>
        <Row label="NDA">{nda}</Row>
        <Row label="Value">{company.value != null ? `$${company.value.toLocaleString()}` : "—"}</Row>
      </tbody>
    ) : tab === "nda" ? (
      <tbody>
        <Row label="Counterparty">{company.name}</Row>
        <Row label="Status">{nda}</Row>
        <Row label="Signers">{primaryContact ? `${primaryContact.name} / Workspace` : "Workspace"}</Row>
        <Row label="After signing">Create a deal — the process continues from Spec sheet</Row>
      </tbody>
    ) : (
      <tbody>
        <Row label={processLabel(tab)}>Starts with a deal — create one from the company&apos;s Spec sheet in Documents.</Row>
      </tbody>
    );

  return (
    <section style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 16, marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {company.partyCode || company.ref} · {company.sector || "—"}{company.ownerId ? ` · ${memberName(company.ownerId)}` : ""}
          </div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-strong)", marginTop: 2 }}>{company.name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge tone="info" size="sm">{processLabel(stage)}</Badge>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", borderBottom: "1px solid var(--border-subtle)", padding: "12px 0", marginBottom: 14 }}>
        {COMPANY_PROCESS.map((s) => {
          const si = COMPANY_PROCESS.indexOf(s);
          const mark = si < cur ? "✓ " : si === cur ? "● " : "";
          return (
            <button key={s} type="button" onClick={() => setTab(s)}
              style={{
                fontSize: "var(--text-xs)", padding: "5px 10px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                border: `1px solid ${tab === s ? "var(--color-primary)" : "var(--border-subtle)"}`,
                background: tab === s ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-card)",
                color: si < cur ? "var(--color-primary)" : si === cur ? "var(--text-strong)" : "var(--text-muted)",
                fontWeight: si === cur ? 600 : 400,
              }}>
              {mark}{processLabel(s)}
            </button>
          );
        })}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>{body}</table>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <Button size="sm" variant="secondary" leftIcon={<Building2 size={13} />} onClick={() => onOpenCompany(company.id, "overview")}>
          Open company & contacts
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onOpenCompany(company.id, "documents")}>Open documents</Button>
        <Button size="sm" variant="secondary" leftIcon={<PenLine size={13} />} onClick={() => onLogActivity(company.id)}>
          Log activity on this company
        </Button>
      </div>
    </section>
  );
}
