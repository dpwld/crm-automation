"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Inbox, Mail, Phone, Plus, StickyNote, Undo2 } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Spinner } from "@/components/ds/core/Spinner";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Textarea } from "@/components/ds/forms/Textarea";
import type { Company } from "@/types/domain";
import { memberName } from "@/lib/mock/team";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { fetchEmails, setEmailFirstContact, type CrmEmail } from "@/lib/data/emails";
import { EmailAiPanel } from "@/components/crm/EmailAiPanel";
import {
  fetchCompanyContacts, fetchLogsForContacts, insertContact, insertContactLog, updateContact,
  type ContactLog, type ContactLogKind, type CustomerContact,
} from "@/lib/data/customers";
import { insertFollowUp } from "@/lib/data/followups";



const KIND_OPTIONS: { value: ContactLogKind; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "note", label: "Note" },
];

const STATUS_OPTIONS = ["Not contacted", "Waiting for reply", "In conversation"];

const KIND_ICON: Record<ContactLogKind, React.ReactNode> = {
  note: <StickyNote size={12} />, call: <Phone size={12} />, email: <Mail size={12} />, meeting: <CalendarDays size={12} />,
};

const today = () => new Date().toISOString().slice(0, 10);

export function FirstContactPanel({
  company,
  meId,
  onLogged,
  prefill,
}: {
  company: Company;
  meId: string;
  
  onLogged?: (summary: string) => void;
  
  prefill?: { body?: string; nextAction?: string };
}) {
  const me = useCurrentUser();
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [emails, setEmails] = useState<CrmEmail[]>([]);
  const [reload, setReload] = useState(0);

  const [contactSel, setContactSel] = useState("");
  const [newName, setNewName] = useState("");
  const [kind, setKind] = useState<ContactLogKind>("email");
  const [logDate, setLogDate] = useState(today);
  const [contactStatus, setContactStatus] = useState("");
  const [body, setBody] = useState(prefill?.body ?? "");
  const [nextAction, setNextAction] = useState(prefill?.nextAction ?? "");
  const [nextDue, setNextDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  // 메일 클릭 = 본문 전문 펼치기
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  // 수신 메일 선별 담기 (2026-09-22 지시) — 픽커 열림 + 처리 중 id
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fcBusy, setFcBusy] = useState<string | null>(null);

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
  }, [company.id, reload]);

  const effectiveContact = (contacts ?? []).some((c) => c.id === contactSel)
    ? contactSel
    : ((contacts ?? [])[0]?.id ?? "new");

  async function save() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      let target = effectiveContact;
      let targetName = (contacts ?? []).find((c) => c.id === target)?.name ?? "";
      if (target === "new") {
        if (!newName.trim()) { setError("Enter the contact's name."); setSaving(false); return; }
        const saved = await insertContact({
          space: "crm", companyId: company.id, companyName: company.name,
          name: newName.trim(), title: "", email: "", phone: "", createdByKey: meId,
        });
        target = saved.id;
        targetName = saved.name;
      }
      await insertContactLog({ contactId: target, kind, body: body.trim(), logDate, authorKey: meId, space: "crm" });
      if (contactStatus) {
        await updateContact(target, { stageNote: contactStatus }).catch((err) => console.error("contact status save failed:", err));
      }
      if (nextAction.trim()) {
        try {
          await insertFollowUp({ companyId: company.id, dealId: null, title: nextAction.trim(), dueDate: nextDue || null, ownerKey: meId, createdByKey: meId });
        } catch (err) { console.error("follow-up save failed:", err); }
      }
      onLogged?.(`${kind[0].toUpperCase()}${kind.slice(1)} with ${targetName || "a contact"} logged.`);
      setBody(""); setNextAction(""); setNextDue(""); setNewName("");
      setReload((n) => n + 1);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      console.error("first contact save failed:", err);
      setError("Couldn't save the touch.");
    } finally {
      setSaving(false);
    }
  }

  
  async function setFc(e: CrmEmail, on: boolean) {
    setFcBusy(e.id);
    setError("");
    try {
      await setEmailFirstContact(e.id, on);
      setEmails((list) => list.map((x) => (x.id === e.id ? { ...x, firstContact: on } : x)));
      onLogged?.(on ? `Email "${e.subject || "(no subject)"}" added to First contact.` : `Email removed from First contact.`);
    } catch (err) {
      console.error("first-contact flag failed:", err);
      setError(`Couldn't update — ${(err as { message?: string })?.message ?? "run db/migrations/2026-09-22_targeting_fc.sql first"}.`);
    } finally {
      setFcBusy(null);
    }
  }

  const fcCandidates = emails.filter((e) => !e.firstContact && e.recordStatus !== "excluded");

  // 피드 — 접촉 기록 + 담은 수집 메일 시간순
  const feed = [
    ...logs.filter((l) => l.step !== "targeting").map((l) => ({
      key: `l-${l.id}`, ts: `${l.logDate}T12:00:00Z`, icon: KIND_ICON[l.kind],
      meta: `${l.kind[0].toUpperCase()}${l.kind.slice(1)} · ${l.logDate} · ${memberName(l.authorKey)}`,
      title: (contacts ?? []).find((c) => c.id === l.contactId)?.name ?? "Contact",
      body: l.body, dir: null as null | "in" | "out",
    })),
    // 수신 메일 전체가 아니라 "컨택 성공"으로 담은 메일만 (2026-09-22 지시)
    ...emails.filter((e) => e.firstContact).map((e) => ({
      key: `e-${e.id}`, ts: e.sentAt ?? "", icon: <Mail size={12} />,
      meta: `Email · ${(e.sentAt ?? "").slice(0, 10)}`,
      title: e.subject || "(no subject)", body: e.snippet ?? "",
      dir: (e.direction === "outbound" ? "out" : "in") as "in" | "out",
      email: e as CrmEmail | undefined,
    })),
  ].sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 980 }}>
      <Card>
        <CardBody>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)", marginBottom: 12 }}>
            Log a touch — company level, no deal needed yet
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Contact
              <Select value={effectiveContact} onChange={(e) => setContactSel(e.target.value)} style={{ marginTop: 4 }}
                options={[...(contacts ?? []).map((c) => ({ value: c.id, label: c.name + (c.title ? ` · ${c.title}` : "") })), { value: "new", label: "+ New contact" }]} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Channel
              <Select value={kind} onChange={(e) => setKind(e.target.value as ContactLogKind)} options={KIND_OPTIONS} style={{ marginTop: 4 }} />
            </label>
            {effectiveContact === "new" && (
              <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", gridColumn: "1 / -1" }}>
                New contact name *
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Who did you talk to?" style={{ marginTop: 4 }} />
              </label>
            )}
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Date
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Contact status
              <Select value={contactStatus} onChange={(e) => setContactStatus(e.target.value)} style={{ marginTop: 4 }}
                options={[{ value: "", label: "Keep as is" }, ...STATUS_OPTIONS.map((x) => ({ value: x, label: x }))]} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              What happened *
              <Textarea rows={3} value={body} placeholder="Customer needs, what was discussed, agreed next steps…"
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Next action
              <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Confirm project requirements" style={{ marginTop: 4 }} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Due
              <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} style={{ marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" loading={saving} disabled={!body.trim()} onClick={() => void save()}>Save touch</Button>
            {savedFlash && <span style={{ fontSize: "var(--text-xs)", color: "var(--green-600, #16a34a)" }}>✓ Saved</span>}
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Recorded on the company · emails from team Gmail land here automatically
            </span>
          </div>
          {error && <div style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)", marginTop: 8 }}>{error}</div>}

          {}
          <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 14, paddingTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant={pickerOpen ? "secondary" : "ghost"} leftIcon={<Inbox size={12} />}
                onClick={() => setPickerOpen((v) => !v)}>
                Add from captured emails{fcCandidates.length ? ` (${fcCandidates.length})` : ""}
              </Button>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                Pick the emails where contact actually succeeded — only those show in this list.
              </span>
            </div>
            {pickerOpen && (
              <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
                {fcCandidates.length === 0 ? (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "10px 12px" }}>
                    No captured emails left to add — new mail lands here automatically after capture.
                  </div>
                ) : (
                  fcCandidates.map((e) => (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <Mail size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-strong)", overflowWrap: "anywhere" }}>{e.subject || "(no subject)"}</span>
                        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginLeft: 8 }}>
                          {(e.sentAt ?? "").slice(0, 10)} · {e.direction === "outbound" ? "sent" : "received"}
                        </span>
                      </div>
                      <Button size="sm" variant="soft" leftIcon={<Plus size={11} />} loading={fcBusy === e.id}
                        onClick={() => void setFc(e, true)}>
                        Add
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ paddingTop: 4 }}>
            {contacts === null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                <Spinner size="sm" /> Loading activity…
              </div>
            ) : feed.length === 0 ? (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "10px 0" }}>
                No touches yet — log the first one above.
              </div>
            ) : (
              feed.slice(0, 12).map((f) => (
                <div key={f.key} style={{ display: "flex", gap: 9, padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ width: 24, height: 24, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", display: "grid", placeItems: "center", color: "var(--color-primary)", flexShrink: 0 }}>{f.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", display: "flex", gap: 5, alignItems: "center" }}>
                      {f.meta}
                      {f.dir === "out" && <ArrowUpRight size={11} style={{ color: "var(--color-primary)" }} />}
                      {f.dir === "in" && <ArrowDownLeft size={11} style={{ color: "var(--green-600, #16a34a)" }} />}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)", overflowWrap: "anywhere" }}>{f.title}</div>
                    {"email" in f && f.email ? (
                      <div
                        onClick={() => { const id = ("email" in f && f.email) ? f.email.id : ""; setExpandedEmails((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }}
                        style={{ cursor: "pointer" }}
                        title={expandedEmails.has(f.email.id) ? "Collapse" : "Click to read the full email"}
                      >
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                          {expandedEmails.has(f.email.id) ? (f.email.bodyText || f.body) : f.body}
                        </div>
                        {expandedEmails.has(f.email.id) && !f.email.bodyText && (
                          <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 3 }}>
                            Full text wasn&rsquo;t stored for this email — newly captured emails keep their full body.
                          </div>
                        )}
                        <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-primary)" }}>
                          {expandedEmails.has(f.email.id) ? "Show less ▲" : "Read full email ▼"}
                        </span>
                      </div>
                    ) : (
                      f.body && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>{f.body}</div>
                    )}
                    {"email" in f && f.email && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <EmailAiPanel email={f.email} myEmail={me.email ?? ""}
                            onBriefSaved={(id, brief) => setEmails((list) => list.map((e) => (e.id === id ? { ...e, aiBrief: brief } : e)))} />
                        </div>
                        <Button size="sm" variant="ghost" iconOnly aria-label="Remove from First contact"
                          title="Remove from this list (the captured email itself is kept)"
                          disabled={fcBusy === f.email.id}
                          onClick={() => { const em = f.email; if (em) void setFc(em, false); }}>
                          <Undo2 size={11} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
