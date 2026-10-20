"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, Mail, Pencil, PenLine, Phone, Plus, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import type { Activity, Company, CompanyDocument, FeedContext } from "@/types/domain";
import { memberName } from "@/lib/mock/team";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { fetchEmails, reassignEmailCompany, setEmailRecordStatus, type CrmEmail } from "@/lib/data/emails";
import { Modal } from "@/components/ds/feedback/Modal";
import { Select } from "@/components/ds/forms/Select";
import { EmailAiPanel } from "@/components/crm/EmailAiPanel";
import {
  deleteContact, deleteContactLog, fetchCompanyContacts, fetchLogsForContacts, insertContact, updateContact,
  type ContactLog, type CustomerContact,
} from "@/lib/data/customers";
import { Input } from "@/components/ds/forms/Input";
import { SALES_STAGE_LABEL, dealValueOf, salesStageOf, type DealSummary } from "@/lib/data/deals";



type Filter = "all" | "email" | "call" | "note";

const BADGE: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
  email: { bg: "var(--color-primary-soft, #eef4ff)", fg: "var(--color-primary)", icon: <Mail size={13} /> },
  call: { bg: "var(--green-50, #f0fdf4)", fg: "var(--green-600, #16a34a)", icon: <Phone size={13} /> },
  meeting: { bg: "var(--green-50, #f0fdf4)", fg: "var(--green-600, #16a34a)", icon: <CalendarDays size={13} /> },
  note: { bg: "var(--amber-50, #fffbeb)", fg: "var(--amber-600, #b45309)", icon: <StickyNote size={13} /> },
  docs: { bg: "var(--violet-50, #f5f3ff)", fg: "var(--violet-600, #7c3aed)", icon: <FileText size={13} /> },
  system: { bg: "var(--surface-sunken)", fg: "var(--text-muted)", icon: <PenLine size={13} /> },
};

const STAGE_PILL: Record<string, { bg: string; fg: string }> = {
  first_contact: { bg: "var(--color-primary-soft, #eef4ff)", fg: "var(--color-primary)" },
  nda: { bg: "var(--color-primary-soft, #eef4ff)", fg: "var(--color-primary)" },
  spec: { bg: "var(--violet-50, #f5f3ff)", fg: "var(--violet-600, #7c3aed)" },
  quoting: { bg: "var(--amber-50, #fffbeb)", fg: "var(--amber-600, #b45309)" },
  customer_po: { bg: "var(--amber-50, #fffbeb)", fg: "var(--amber-600, #b45309)" },
  invoiced: { bg: "var(--green-50, #f0fdf4)", fg: "var(--green-600, #16a34a)" },
  closed: { bg: "var(--green-50, #f0fdf4)", fg: "var(--green-600, #16a34a)" },
};

const fmtMoney = (n: number, cur: string) => `${cur === "KRW" ? "₩" : "$"}${n.toLocaleString("en-US")}`;
const today = () => new Date().toISOString().slice(0, 10);

interface FeedItem {
  key: string;
  
  addrs?: string;
  
  contactId?: string;
  
  dealId?: string | null;
  
  email?: CrmEmail;
  
  log?: ContactLog;
  kind: keyof typeof BADGE;
  filter: Filter;
  ts: string; // ISO 정렬용
  day: string; // yyyy-mm-dd 그룹
  title: string;
  meta: string;
  body?: string;
  dir?: "in" | "out";
}

function dayLabel(day: string): string {
  if (day === today()) return `Today · ${day.slice(5).replace("-", "/")}`;
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Section({ title, count, action, children, style }: {
  title: string; count?: number; action?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <section style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-strong)" }}>
          {title}{count != null && <span style={{ fontWeight: 500, color: "var(--text-muted)" }}> · {count}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

type ContactForm = { name: string; title: string; email: string; phone: string };
const EMPTY_FORM: ContactForm = { name: "", title: "", email: "", phone: "" };

export function CompanyOverview({
  company,
  deals,
  activities: _activities,
  onLogActivity,
  comments,
  onAddComment,
  allCompanies,
  // activities/documents props stay in the signature for compatibility (feed와 문서칩이
  // 각각 Log 탭·Documents 화면으로 옮겨가며 이 컴포넌트에선 더 안 쓴다)
  onSelectDeal,
  onOpenStep,
  documents: _documents = [],
  documentsLoading: _documentsLoading = false,
  refreshKey = 0,
}: {
  company: Company;
  deals: DealSummary[];
  activities: Activity[];
  documents?: CompanyDocument[];
  documentsLoading?: boolean;
  onLogActivity: () => void;
  
  comments?: { id: string; authorId: string; body: string }[];
  onAddComment?: (text: string) => Promise<void>;
  
  allCompanies?: { id: string; name: string }[];
  
  onSelectDeal: (deal: DealSummary) => void;
  
  onOpenStep?: (step: import("@/types/domain").FeedContext, prefill?: { body?: string; nextAction?: string }) => void;
  
  refreshKey?: number;
}) {
  const me = useCurrentUser();
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [emails, setEmails] = useState<CrmEmail[]>([]);

  const [filter, setFilter] = useState<Filter>("all");
  // 컨택트 카드 클릭 = 그 사람과의 대화·작업만 보기 (2026-09-16 지시)
  const [focusContact, setFocusContact] = useState<string | null>(null);
  // 딜 카드 클릭 = 그 딜의 대화만 보기 (2026-09-17 지시)
  const [focusDeal, setFocusDeal] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  // Exclude 확인 팝업 — 제외 전에 "다른 기업 이동인지" 묻는다 (2026-10-01)
  const [excludeTarget, setExcludeTarget] = useState<CrmEmail | null>(null);
  const [moveCompanyId, setMoveCompanyId] = useState("");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  // 메일 클릭 = 본문 전문 펼치기 (2026-09-17 지시, body_text는 봇이 수집 시 저장)
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  // 연락처 인라인 편집 ("new" = 추가)
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [contactBusy, setContactBusy] = useState(false);

  // Next action 빠른 추가


  useEffect(() => {
    let alive = true;
    fetchCompanyContacts(company.id, company.name, "crm")
      .then(async (cs) => {
        if (!alive) return;
        setContacts(cs);
        const ls = await fetchLogsForContacts(cs.map((c) => c.id), "crm");
        if (alive) setLogs(ls);
      })
      .catch(() => { if (alive) { setContacts([]); setLogs([]); } });
    fetchEmails(company.id)
      .then((list) => { if (alive) setEmails(list); })
      .catch(() => { if (alive) setEmails([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, refreshKey]);

  const companyDeals = useMemo(() => deals.filter((d) => d.companyId === company.id), [deals, company.id]);
  const openDeals = companyDeals.filter((d) => d.status !== "closed");
  const contactNameOf = (id: string) => (contacts ?? []).find((c) => c.id === id)?.name ?? "";

  // 스탯 — Pipeline value(인보이스 우선 합), Last touch(D-n), NDA
  const pipeline = useMemo(() => {
    const vals = openDeals.map(dealValueOf).filter((v): v is NonNullable<ReturnType<typeof dealValueOf>> => v != null);
    const sum = vals.reduce((a, v) => a + v.amount, 0);
    return { sum, currency: vals[0]?.currency ?? "USD", invoiced: vals.some((v) => v.source === "invoice") };
  }, [openDeals]);
  const lastTouchDay = useMemo(() => {
    const days = [...logs.map((l) => l.logDate), ...emails.map((e) => (e.sentAt ?? "").slice(0, 10))].filter(Boolean).sort();
    return days[days.length - 1] ?? null;
  }, [logs, emails]);
  const lastTouchD = lastTouchDay ? Math.max(0, Math.round((Date.parse(today()) - Date.parse(lastTouchDay)) / 86400000)) : null;

  // 활동 피드 — 접촉 기록 + 메일 + 시스템/문서 활동을 날짜 그룹으로
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const l of logs) {
      items.push({
        key: `l-${l.id}`, kind: l.kind, filter: l.kind === "email" ? "email" : l.kind === "call" || l.kind === "meeting" ? "call" : "note",
        ts: `${l.logDate}T12:00:00Z`, day: l.logDate,
        title: `${l.kind === "meeting" ? "Meeting" : l.kind === "call" ? "Call" : l.kind === "email" ? "Email" : "Note"}${contactNameOf(l.contactId) ? ` with ${contactNameOf(l.contactId)}` : ""}`,
        meta: memberName(l.authorKey) !== "Unknown" ? memberName(l.authorKey) : "", body: l.body,
        contactId: l.contactId,
        dealId: l.dealId,
        log: l,
      });
    }
    for (const e of emails) {
      if (e.recordStatus === "excluded" && !showExcluded) continue; // 반영 제외 건 — Show excluded로 복구

      items.push({
        key: `e-${e.id}`, kind: "email", filter: "email",
        ts: e.sentAt ?? "", day: (e.sentAt ?? "").slice(0, 10),
        title: e.subject || "(no subject)",
        meta: `${e.direction === "outbound" ? `to ${e.toAddrs}` : `from ${e.fromAddr}`}${e.recordStatus === "pending" ? " · pending review" : ""}`,
        dir: e.direction === "outbound" ? "out" : "in",
        addrs: `${e.fromAddr} ${e.toAddrs}`.toLowerCase(),
        dealId: e.dealId,
        email: e,
      });
    }
    return items.filter((i) => i.day).sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, emails, contacts, showExcluded]);

  const focused = focusContact ? (contacts ?? []).find((c) => c.id === focusContact) ?? null : null;
  const visible = feed
    .filter((i) => filter === "all" || i.filter === filter)
    .filter((i) => {
      if (focusDeal && i.dealId !== focusDeal) return false;
      if (!focused) return true;
      if (i.contactId) return i.contactId === focused.id;
      if (i.addrs) return Boolean(focused.email) && i.addrs.includes(focused.email.toLowerCase());
      return false;
    })
    .slice(0, 20);
  const groups: { day: string; items: FeedItem[] }[] = [];
  for (const item of visible) {
    const last = groups[groups.length - 1];
    if (last && last.day === item.day) last.items.push(item);
    else groups.push({ day: item.day, items: [item] });
  }

  function openEdit(c: CustomerContact | null) {
    setEditing(c ? c.id : "new");
    setForm(c ? { name: c.name, title: c.title, email: c.email, phone: c.phone } : EMPTY_FORM);
  }

  async function saveContact() {
    if (!form.name.trim() || contactBusy) return;
    setContactBusy(true);
    try {
      if (editing === "new") {
        const saved = await insertContact({
          space: "crm", companyId: company.id, companyName: company.name,
          name: form.name.trim(), title: form.title.trim(), email: form.email.trim(), phone: form.phone.trim(),
          createdByKey: me.id,
        });
        setContacts((cs) => [...(cs ?? []), saved].sort((a, b) => a.name.localeCompare(b.name)));
      } else if (editing) {
        const saved = await updateContact(editing, {
          name: form.name.trim(), title: form.title.trim(), email: form.email.trim(), phone: form.phone.trim(),
        });
        setContacts((cs) => (cs ?? []).map((c) => (c.id === saved.id ? saved : c)));
      }
      setEditing(null);
    } catch (err) { console.error("contact save failed:", err); }
    finally { setContactBusy(false); }
  }

  async function removeContact(c: CustomerContact) {
    if (!window.confirm(`Delete ${c.name}? Their activity log goes too.`)) return;
    try {
      await deleteContact(c.id);
      setContacts((cs) => (cs ?? []).filter((x) => x.id !== c.id));
      setLogs((ls) => ls.filter((l) => l.contactId !== c.id));
    } catch (err) { console.error("contact delete failed:", err); }
  }

  async function submitComment() {
    if (!onAddComment || !commentDraft.trim() || commentBusy) return;
    setCommentBusy(true);
    try {
      await onAddComment(commentDraft.trim());
      setCommentDraft("");
    } finally { setCommentBusy(false); }
  }


  async function removeLog(log: ContactLog) {
    if (!window.confirm("Delete this activity record?")) return;
    try {
      await deleteContactLog(log.id);
      setLogs((ls) => ls.filter((x) => x.id !== log.id));
    } catch (err) { console.error("activity delete failed:", err); }
  }

  async function decideEmail(email: CrmEmail, status: "accepted" | "excluded") {
    setDecidingId(email.id);
    try {
      await setEmailRecordStatus(email.id, status);
      setEmails((list) => list.map((e) => (e.id === email.id ? { ...e, recordStatus: status } : e)));
    } catch (err) { console.error("email record decision failed:", err); }
    finally { setDecidingId(null); }
  }


  const statBox = (k: string, v: React.ReactNode) => (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{k}</div>
      <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--text-strong)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{v}</div>
    </div>
  );

  return (
    <div className="sx-overview" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="primary" leftIcon={<PenLine size={13} />} onClick={onLogActivity}>
          Log sales activity
        </Button>
      </div>

      {}
      <div className="sx-overview-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {statBox("Open deals", openDeals.length)}
        {statBox("Pipeline value", pipeline.sum
          ? <>{fmtMoney(pipeline.sum, pipeline.currency)} <small style={{ fontSize: "var(--text-2xs)", fontWeight: 500, color: "var(--text-muted)" }}>{pipeline.invoiced ? "invoiced" : "quoted"}</small></>
          : "—")}
        {statBox("Last touch", lastTouchD == null ? "—"
          : <>{lastTouchD === 0 ? "Today" : `D-${lastTouchD}`} <small style={{ fontSize: "var(--text-2xs)", fontWeight: 500, color: "var(--text-muted)" }}>{lastTouchDay?.slice(5).replace("-", "/")}</small></>)}
        {statBox("NDA", <span style={{ color: company.ndaStatus === "signed" ? "var(--green-600, #16a34a)" : company.ndaStatus === "in_review" ? "var(--amber-600, #b45309)" : "var(--text-muted)" }}>
          {company.ndaStatus === "signed" ? "Signed" : company.ndaStatus === "in_review" ? "In review" : "Not started"}
        </span>)}
      </div>


      {}
      <div className="sx-overview-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, alignItems: "start" }}>
      <Section title="Contacts" count={contacts?.length}
        action={<Button variant="ghost" size="sm" leftIcon={<Plus size={12} />} onClick={() => openEdit(null)}>Add</Button>}>
        {contacts === null ? (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Loading…</div>
        ) : contacts.length === 0 && editing !== "new" ? (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            No contacts yet — add the people you talk to at {company.name}.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: 8 }}>
            {contacts.map((c) => editing === c.id ? (
              <div key={c.id} style={{ gridColumn: "1 / -1" }}>
                <ContactFormRow form={form} setForm={setForm} busy={contactBusy}
                  onSave={() => void saveContact()} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <div key={c.id} className="sx-contact-card" role="button" tabIndex={0}
                onClick={() => setFocusContact((cur) => (cur === c.id ? null : c.id))}
                onKeyDown={(e) => { if (e.key === "Enter") setFocusContact((cur) => (cur === c.id ? null : c.id)); }}
                style={{ position: "relative", display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", borderRadius: "var(--radius-sm)", padding: 8, minWidth: 0,
                  border: `1px solid ${focusContact === c.id ? "var(--color-primary)" : "var(--border-subtle)"}`,
                  background: focusContact === c.id ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-card)" }}>
                <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", background: "var(--color-primary-soft, #eef3fb)", color: "var(--color-primary)", borderRadius: "50%", flexShrink: 0, fontSize: 12, fontWeight: 700 }}>
                  {c.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)" }}>{c.name}</div>
                  {c.title && <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{c.title}</div>}
                  {c.email && <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", overflowWrap: "anywhere" }}>{c.email}</div>}
                  {c.phone && <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{c.phone}</div>}
                </div>
                <span className="sx-contact-actions" style={{ position: "absolute", top: 7, right: 7, display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" iconOnly aria-label={`Edit ${c.name}`} onClick={() => openEdit(c)}><Pencil size={12} /></Button>
                  <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${c.name}`} onClick={() => void removeContact(c)}><Trash2 size={12} /></Button>
                </span>
              </div>
            ))}
            {editing === "new" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <ContactFormRow form={form} setForm={setForm} busy={contactBusy}
                  onSave={() => void saveContact()} onCancel={() => setEditing(null)} />
              </div>
            )}
          </div>
        )}
        {contacts !== null && contacts.length === 0 && editing === "new" && (
          <ContactFormRow form={form} setForm={setForm} busy={contactBusy}
            onSave={() => void saveContact()} onCancel={() => setEditing(null)} />
        )}
      </Section>

      <Section title="Deals">
        {companyDeals.length === 0 ? (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            No deals yet — deals are created in the Spec sheet step.
          </div>
        ) : companyDeals.map((d) => {
          const stage = salesStageOf(d.status);
          const pill = STAGE_PILL[stage] ?? STAGE_PILL.spec;
          const v = dealValueOf(d);
          return (
            <div key={d.id} role="button" tabIndex={0}
              onClick={() => setFocusDeal((cur) => (cur === d.id ? null : d.id))}
              onKeyDown={(e) => { if (e.key === "Enter") setFocusDeal((cur) => (cur === d.id ? null : d.id)); }}
              title="Click: show only this deal's activity"
              style={{ display: "block", width: "100%", textAlign: "left", borderRadius: "var(--radius-sm)", padding: 9, marginBottom: 8, cursor: "pointer",
                border: `1px solid ${focusDeal === d.id ? "var(--color-primary)" : "var(--border-subtle)"}`,
                background: focusDeal === d.id ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-card)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: "calc(var(--text-2xs) - 1px)", fontWeight: 700, color: "var(--color-primary)" }}>{d.dealNo}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); onSelectDeal(d); }}
                  style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-primary)" }}>
                  Open →
                </button>
              </div>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)", overflowWrap: "anywhere", marginTop: 1 }}>{d.title}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 7 }}>
                <span style={{ fontSize: "calc(var(--text-2xs) - 1px)", fontWeight: 700, borderRadius: 5, padding: "2px 7px", background: pill.bg, color: pill.fg }}>
                  {SALES_STAGE_LABEL[stage]}
                </span>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>
                  {v ? <>{fmtMoney(v.amount, v.currency)}{v.source === "quote" && <small style={{ fontWeight: 500, color: "var(--text-subtle)", fontSize: "calc(var(--text-2xs) - 1px)", marginLeft: 4 }}>quote</small>}</> : <span style={{ color: "var(--text-subtle)", fontWeight: 500 }}>—</span>}
                </span>
              </div>
            </div>
          );
        })}
      </Section>
      </div>

      {}
      <Section title="Activity">
          {emails.some((e) => e.recordStatus === "pending") && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--amber-50, #fffbeb)", border: "1px solid var(--amber-200, #fde68a)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: "var(--text-2xs)", color: "var(--amber-600, #b45309)", fontWeight: 600, marginBottom: 8 }}>
              ⏳ {emails.filter((e) => e.recordStatus === "pending").length} captured email(s) waiting — Accept keeps it as an official record, Exclude hides it.
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4, alignItems: "center" }}>
            {(["all", "email", "call", "note"] as Filter[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                style={{
                  fontSize: "var(--text-2xs)", fontWeight: 600, padding: "3px 11px", borderRadius: 999, cursor: "pointer", textTransform: "capitalize",
                  border: `1px solid ${filter === f ? "var(--color-primary)" : "var(--border-subtle)"}`,
                  background: filter === f ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-card)",
                  color: filter === f ? "var(--color-primary)" : "var(--text-muted)",
                }}>
                {f}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setShowExcluded((v) => !v)}
              style={{
                fontSize: "var(--text-2xs)", fontWeight: 600, padding: "3px 11px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${showExcluded ? "var(--color-primary)" : "var(--border-subtle)"}`,
                background: showExcluded ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-card)",
                color: showExcluded ? "var(--color-primary)" : "var(--text-subtle)",
              }}>
              Show excluded
            </button>
          </div>
          {(focused || focusDeal) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 6px", flexWrap: "wrap" }}>
              {focused && (
                <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", borderRadius: 999, padding: "2px 10px" }}>
                  Showing {focused.name} only
                </span>
              )}
              {focusDeal && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", borderRadius: 999, padding: "2px 10px" }}>
                  {companyDeals.find((d) => d.id === focusDeal)?.dealNo ?? "Deal"} only
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={() => { setFocusContact(null); setFocusDeal(null); }}>Clear</Button>
            </div>
          )}
          {groups.length === 0 ? (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "8px 0" }}>
              No records yet. Log a sales activity — team emails are captured automatically.
            </div>
          ) : groups.map((g) => (
            <div key={g.day}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 4px", fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-subtle)" }}>
                {dayLabel(g.day)}
                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
              </div>
              {g.items.map((i) => (
                <div key={i.key} className="sx-feed-row" style={{ display: "flex", gap: 10, padding: "8px 0" }}>
                  <span style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", display: "grid", placeItems: "center", flexShrink: 0, background: BADGE[i.kind].bg, color: BADGE[i.kind].fg }}>
                    {BADGE[i.kind].icon}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)", overflowWrap: "anywhere" }}>{i.title}</span>
                      {i.dir === "out" && <span style={{ fontSize: "calc(var(--text-2xs) - 1px)", fontWeight: 700, color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", borderRadius: 4, padding: "1px 5px" }}>SENT</span>}
                      {i.dir === "in" && <span style={{ fontSize: "calc(var(--text-2xs) - 1px)", fontWeight: 700, color: "var(--green-600, #16a34a)", background: "var(--green-50, #f0fdf4)", borderRadius: 4, padding: "1px 5px" }}>RECEIVED</span>}
                      {i.dealId && companyDeals.find((d) => d.id === i.dealId) && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "calc(var(--text-2xs) - 1px)", fontWeight: 700, color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", borderRadius: 999, padding: "0 7px" }}>
                          {companyDeals.find((d) => d.id === i.dealId)!.dealNo}
                        </span>
                      )}
                      {i.email?.recordStatus === "pending" && <span style={{ fontSize: "calc(var(--text-2xs) - 1px)", fontWeight: 700, color: "var(--amber-600, #b45309)", background: "var(--amber-50, #fffbeb)", borderRadius: 4, padding: "1px 5px" }}>PENDING</span>}
                      {i.email?.recordStatus === "excluded" && <span style={{ fontSize: "calc(var(--text-2xs) - 1px)", fontWeight: 700, color: "var(--text-muted)", background: "var(--surface-sunken)", borderRadius: 4, padding: "1px 5px" }}>EXCLUDED</span>}
                    </div>
                    {i.meta && <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", overflowWrap: "anywhere" }}>{i.meta}</div>}
                    {i.email ? (
                      <div
                        onClick={() => setExpandedEmails((s) => { const n = new Set(s); if (n.has(i.email!.id)) n.delete(i.email!.id); else n.add(i.email!.id); return n; })}
                        style={{ cursor: "pointer", marginTop: 2 }}
                        title={expandedEmails.has(i.email.id) ? "Collapse" : "Click to read the full email"}
                      >
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-default)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                          {expandedEmails.has(i.email.id) ? (i.email.bodyText || i.body) : i.body}
                        </div>
                        {expandedEmails.has(i.email.id) && !i.email.bodyText && (
                          <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 3 }}>
                            Full text wasn&rsquo;t stored for this email — newly captured emails keep their full body.
                          </div>
                        )}
                        <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-primary)" }}>
                          {expandedEmails.has(i.email.id) ? "Show less ▲" : "Read full email ▼"}
                        </span>
                      </div>
                    ) : (
                      i.body && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-default)", whiteSpace: "pre-wrap", overflowWrap: "break-word", marginTop: 2 }}>{i.body}</div>
                    )}
                    {i.email?.recordStatus === "pending" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <Button size="sm" variant="primary" loading={decidingId === i.email.id} onClick={() => void decideEmail(i.email!, "accepted")}>Accept</Button>
                        <Button size="sm" variant="ghost" disabled={decidingId === i.email.id} onClick={() => { setMoveCompanyId(""); setExcludeTarget(i.email!); }}>Exclude</Button>
                      </div>
                    )}
                    {i.email && i.email.recordStatus !== "excluded" && (
                      <EmailAiPanel
                        email={i.email}
                        myEmail={me.email ?? ""}
                        onOpenStep={onOpenStep}
                        onBriefSaved={(id, brief) => setEmails((list) => list.map((e) => (e.id === id ? { ...e, aiBrief: brief } : e)))}
                      />
                    )}
                    {i.email?.recordStatus === "excluded" && (
                      <div style={{ marginTop: 6 }}>
                        <Button size="sm" variant="ghost" loading={decidingId === i.email.id} onClick={() => void decideEmail(i.email!, "accepted")}>Restore</Button>
                      </div>
                    )}
                  </div>
                  {i.log && (i.log.authorKey === me.id || me.role === "admin") && (
                    <span className="sx-feed-actions" style={{ flexShrink: 0 }}>
                      <Button variant="ghost" size="sm" iconOnly aria-label="Delete activity" onClick={() => void removeLog(i.log!)}>
                        <Trash2 size={12} />
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </Section>

      {}
      {onAddComment && (
        <Section title="Comments" count={comments?.length || undefined}>
          {(comments ?? []).slice(-5).map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "var(--text-xs)" }}>
              <span style={{ fontWeight: 600, color: "var(--text-strong)", flexShrink: 0 }}>{memberName(c.authorId)}</span>
              <span style={{ color: "var(--text-default)", overflowWrap: "anywhere", flex: 1 }}>{c.body}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Input size="sm" placeholder="Write a comment… (@mention to notify)" value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) void submitComment(); }} />
            <Button size="sm" variant="secondary" loading={commentBusy} disabled={!commentDraft.trim()} onClick={() => void submitComment()}>
              Post
            </Button>
          </div>
        </Section>
      )}
      {}
      {excludeTarget && (
        <Modal open onClose={() => setExcludeTarget(null)} title="How should this email be handled?" size="sm"
          subtitle={excludeTarget.subject || "(no subject)"}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button variant="ghost" size="sm" onClick={() => setExcludeTarget(null)}>Cancel</Button>
              <Button variant="secondary" size="sm" disabled={!moveCompanyId}
                onClick={() => {
                  const email = excludeTarget;
                  setExcludeTarget(null);
                  void (async () => {
                    try {
                      await reassignEmailCompany(email.id, moveCompanyId);
                      setEmails((list) => list.filter((e) => e.id !== email.id));
                    } catch (err) { console.error("email move failed:", err); }
                  })();
                }}>
                Move to selected company
              </Button>
              <Button variant="danger" size="sm"
                onClick={() => { const email = excludeTarget; setExcludeTarget(null); void decideEmail(email, "excluded"); }}>
                Exclude from this company
              </Button>
            </div>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "var(--text-sm)" }}>
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              Move an email assigned to the wrong company to review it in that company’s activity.
              <br />
              Exclude emails that are not sales records. Use Show excluded to restore them.
            </p>
            <Select size="sm" value={moveCompanyId} aria-label="Destination company"
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMoveCompanyId(e.target.value)}
              options={[{ value: "", label: "Choose a destination company…" }, ...(allCompanies ?? []).filter((c) => c.id !== company.id).map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
        </Modal>
      )}
    </div>
  );
}


function ContactFormRow({
  form, setForm, busy, onSave, onCancel,
}: {
  form: ContactForm;
  setForm: React.Dispatch<React.SetStateAction<ContactForm>>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", padding: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <Input size="sm" placeholder="Name *" value={form.name} autoFocus
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input size="sm" placeholder="Title / role" value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <Input size="sm" placeholder="Email" value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <Input size="sm" placeholder="Phone" value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" loading={busy} disabled={!form.name.trim()} onClick={onSave}>Save</Button>
      </div>
    </div>
  );
}
