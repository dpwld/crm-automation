"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Mail, Phone, Plus, Send, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Input } from "@/components/ds/forms/Input";
import { Spinner } from "@/components/ds/core/Spinner";
import { Textarea } from "@/components/ds/forms/Textarea";
import type { Activity, Company } from "@/types/domain";
import { memberName } from "@/lib/mock/team";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { deleteActivity, fetchContextActivities } from "@/lib/data/crm";
import {
  deleteContact, deleteContactLog, fetchCompanyContacts, fetchLogsForContacts, insertContact, insertContactLog,
  type ContactLog, type ContactLogKind, type CustomerContact,
} from "@/lib/data/customers";
import { Select } from "@/components/ds/forms/Select";
import { insertFollowUp } from "@/lib/data/followups";



const PROMPTS = [
  "Why this company? (fit with Workspace cooling)",
  "What do they build · how would our product fit?",
  "Who to reach first · warm intro available?",
];

type ContactForm = { name: string; title: string; email: string; phone: string };
const EMPTY_FORM: ContactForm = { name: "", title: "", email: "", phone: "" };

export function TargetingPanel({
  company,
  onLogged,
}: {
  company: Company;
  
  onLogged?: (summary: string) => void | Promise<void>;
}) {
  const me = useCurrentUser();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<Activity[] | null>(null);
  const [error, setError] = useState("");

  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [contactBusy, setContactBusy] = useState(false);

  // 연락 시도 기록 (2026-09-22 지시) — First contact 폼과 같은 구성, step="targeting"
  const [attempts, setAttempts] = useState<ContactLog[]>([]);
  const [tContact, setTContact] = useState("");
  const [tNewName, setTNewName] = useState("");
  const [tKind, setTKind] = useState<ContactLogKind>("email");
  const [tDate, setTDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tBody, setTBody] = useState("");
  const [tNext, setTNext] = useState("");
  const [tDue, setTDue] = useState("");
  const [tSaving, setTSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchContextActivities(company.id, "targeting")
      .then((list) => { if (alive) setNotes(list); })
      .catch(() => { if (alive) { setNotes([]); setError("Couldn't load research notes."); } });
    fetchCompanyContacts(company.id, company.name, "crm")
      .then(async (cs) => {
        if (!alive) return;
        setContacts(cs);
        const ls = await fetchLogsForContacts(cs.map((c) => c.id), "crm").catch(() => []);
        if (alive) setAttempts(ls.filter((l) => l.step === "targeting"));
      })
      .catch(() => { if (alive) setContacts([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  async function save() {
    if (!note.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      // 저장 완료를 기다린 뒤 재조회 — 목록에 바로 보이게 (fire-and-forget 금지).
      await onLogged?.(note.trim());
      setNote("");
      const list = await fetchContextActivities(company.id, "targeting").catch(() => null);
      if (list) setNotes(list);
    } finally {
      setSaving(false);
    }
  }

  const KIND_OPTIONS: { value: ContactLogKind; label: string }[] = [
    { value: "email", label: "Email" }, { value: "call", label: "Call" },
    { value: "meeting", label: "Meeting" }, { value: "note", label: "Note" },
  ];
  const KIND_ICON: Record<ContactLogKind, React.ReactNode> = {
    note: <StickyNote size={12} />, call: <Phone size={12} />, email: <Mail size={12} />, meeting: <CalendarDays size={12} />,
  };
  const effectiveTContact = (contacts ?? []).some((c) => c.id === tContact) ? tContact : ((contacts ?? [])[0]?.id ?? "new");

  
  async function saveAttempt() {
    if (!tBody.trim() || tSaving) return;
    setTSaving(true);
    setError("");
    try {
      let target = effectiveTContact;
      if (target === "new") {
        if (!tNewName.trim()) { setError("Enter the contact's name."); setTSaving(false); return; }
        const saved = await insertContact({
          space: "crm", companyId: company.id, companyName: company.name,
          name: tNewName.trim(), title: "", email: "", phone: "", createdByKey: me.id,
        });
        setContacts((cs) => [...(cs ?? []), saved]);
        target = saved.id;
      }
      const log = await insertContactLog({ contactId: target, kind: tKind, body: tBody.trim(), logDate: tDate, authorKey: me.id, space: "crm", step: "targeting" });
      if (tNext.trim()) {
        await insertFollowUp({ companyId: company.id, dealId: null, title: tNext.trim(), dueDate: tDue || null, ownerKey: me.id, createdByKey: me.id })
          .catch((err) => console.error("follow-up save failed:", err));
      }
      setAttempts((ls) => [log, ...ls]);
      setTBody(""); setTNext(""); setTDue(""); setTNewName("");
      await onLogged?.(`Outreach attempt (${tKind}) logged.`);
    } catch (err) {
      console.error("attempt save failed:", err);
      setError(`Couldn't save the attempt — ${(err as { message?: string })?.message ?? "run db/migrations/2026-09-22_targeting_fc.sql first"}.`);
    } finally {
      setTSaving(false);
    }
  }

  async function removeAttempt(l: ContactLog) {
    if (!window.confirm("Delete this outreach attempt?")) return;
    try {
      await deleteContactLog(l.id);
      setAttempts((ls) => ls.filter((x) => x.id !== l.id));
    } catch (err) {
      console.error("attempt delete failed:", err);
      setError("Couldn't delete the attempt.");
    }
  }

  async function removeNote(a: Activity) {
    if (!window.confirm("Delete this research note?")) return;
    try {
      await deleteActivity(a.id);
      setNotes((list) => (list ?? []).filter((x) => x.id !== a.id));
    } catch (err) {
      console.error("note delete failed:", err);
      setError("Couldn't delete the note — you can only delete your own notes unless you're an admin.");
    }
  }

  async function saveContact() {
    if (!form.name.trim() || contactBusy) return;
    setContactBusy(true);
    setError("");
    try {
      const saved = await insertContact({
        space: "crm", companyId: company.id, companyName: company.name,
        name: form.name.trim(), title: form.title.trim(), email: form.email.trim(), phone: form.phone.trim(),
        createdByKey: me.id,
      });
      setContacts((cs) => [...(cs ?? []), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(EMPTY_FORM);
      setAdding(false);
    } catch (err) {
      console.error("contact save failed:", err);
      setError("Couldn't save the contact — check your access and try again.");
    } finally {
      setContactBusy(false);
    }
  }

  async function removeContact(c: CustomerContact) {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try {
      await deleteContact(c.id);
      setContacts((cs) => (cs ?? []).filter((x) => x.id !== c.id));
    } catch (err) {
      console.error("contact delete failed:", err);
      setError("Couldn't delete the contact — check your access and try again.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 980 }}>
      <Card>
        <CardBody>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)", marginBottom: 6 }}>
            Targeting — research before the first touch
          </div>
          <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {company.name} is on the target list. Log why it fits and how to get in — a note also puts
            this company on the Pipeline board&apos;s Targeting column. Once you actually reach out,
            move on to <b>First contact</b>.
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: "var(--text-xs)", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 3 }}>
            {PROMPTS.map((q) => <li key={q}>{q}</li>)}
          </ul>
          <Textarea rows={3} value={note} placeholder="Research note — market, product line, likely need, entry path…"
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <Button variant="primary" size="sm" loading={saving} disabled={!note.trim()} onClick={() => void save()}>
              Log research note
            </Button>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              No deal yet — deals are numbered when the Spec sheet starts.
            </span>
          </div>

          {}
          <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 14, paddingTop: 4 }}>
            {notes === null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                <Spinner size="sm" /> Loading notes…
              </div>
            ) : notes.length === 0 ? (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "10px 0" }}>
                No research notes yet — log the first one above.
              </div>
            ) : (
              notes.map((a) => (
                <div key={a.id} className="sx-feed-row" style={{ display: "flex", gap: 9, padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ width: 24, height: 24, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", display: "grid", placeItems: "center", color: "var(--amber-600, #b45309)", background: "var(--amber-50, #fffbeb)", flexShrink: 0 }}>
                    <StickyNote size={12} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                      {(a.createdAt ?? "").slice(0, 10)}{memberName(a.actorId) !== "Unknown" ? ` · ${memberName(a.actorId)}` : ""}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-strong)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>{a.summary}</div>
                  </div>
                  {(a.actorId === me.id || me.role === "admin") && (
                    <span className="sx-feed-actions" style={{ flexShrink: 0 }}>
                      <Button variant="ghost" size="sm" iconOnly aria-label="Delete note" onClick={() => void removeNote(a)}>
                        <Trash2 size={12} />
                      </Button>
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      {}
      <Card>
        <CardBody>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)", marginBottom: 12 }}>
            Log an outreach attempt — no reply yet
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Contact
              <Select value={effectiveTContact} onChange={(e) => setTContact(e.target.value)} style={{ marginTop: 4 }}
                options={[...(contacts ?? []).map((c) => ({ value: c.id, label: c.name + (c.title ? ` · ${c.title}` : "") })), { value: "new", label: "+ New contact" }]} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Channel
              <Select value={tKind} onChange={(e) => setTKind(e.target.value as ContactLogKind)} options={KIND_OPTIONS} style={{ marginTop: 4 }} />
            </label>
            {effectiveTContact === "new" && (
              <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", gridColumn: "1 / -1" }}>
                New contact name *
                <Input value={tNewName} onChange={(e) => setTNewName(e.target.value)} placeholder="Who did you reach out to?" style={{ marginTop: 4 }} />
              </label>
            )}
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Date
              <Input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <span />
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              What was attempted *
              <Textarea rows={2} value={tBody} placeholder="Cold email sent to sales alias, LinkedIn DM, intro request…"
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTBody(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Next action
              <Input value={tNext} onChange={(e) => setTNext(e.target.value)} placeholder="e.g. Follow up in a week" style={{ marginTop: 4 }} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Due
              <Input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} style={{ marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <Button variant="primary" size="sm" leftIcon={<Send size={12} />} loading={tSaving} disabled={!tBody.trim()} onClick={() => void saveAttempt()}>
              Log attempt
            </Button>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              When they reply, pick the email into <b>First contact</b>.
            </span>
          </div>
          <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 14, paddingTop: 4 }}>
            {attempts.length === 0 ? (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "10px 0" }}>
                No outreach attempts logged yet.
              </div>
            ) : (
              attempts.map((l) => (
                <div key={l.id} className="sx-feed-row" style={{ display: "flex", gap: 9, padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ width: 24, height: 24, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", display: "grid", placeItems: "center", color: "var(--color-primary)", flexShrink: 0 }}>
                    {KIND_ICON[l.kind]}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                      {l.kind[0].toUpperCase()}{l.kind.slice(1)} · {l.logDate} · {memberName(l.authorKey)} · {(contacts ?? []).find((c) => c.id === l.contactId)?.name ?? "Contact"}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-strong)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>{l.body}</div>
                  </div>
                  {(l.authorKey === me.id || me.role === "admin") && (
                    <span className="sx-feed-actions" style={{ flexShrink: 0 }}>
                      <Button variant="ghost" size="sm" iconOnly aria-label="Delete attempt" onClick={() => void removeAttempt(l)}>
                        <Trash2 size={12} />
                      </Button>
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      {}
      <Card>
        <CardBody>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>
              Contacts{contacts ? ` · ${contacts.length}` : ""}
            </span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" leftIcon={<Plus size={12} />} onClick={() => setAdding((v) => !v)}>Add</Button>
          </div>
          {adding && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", padding: 10, marginBottom: 10 }}>
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
                <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                <Button size="sm" loading={contactBusy} disabled={!form.name.trim()} onClick={() => void saveContact()}>Save</Button>
              </div>
            </div>
          )}
          {contacts === null ? (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Loading…</div>
          ) : contacts.length === 0 && !adding ? (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              No contacts yet — add emails and phone numbers as you find them.
            </div>
          ) : (
            contacts.map((c) => (
              <div key={c.id} className="sx-feed-row" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)" }}>{c.name}</span>
                  {c.title && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginLeft: 6 }}>{c.title}</span>}
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "No email · phone yet"}
                  </div>
                </div>
                <span className="sx-feed-actions" style={{ flexShrink: 0 }}>
                  <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${c.name}`} onClick={() => void removeContact(c)}>
                    <Trash2 size={12} />
                  </Button>
                </span>
              </div>
            ))
          )}
          {error && <div style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)", marginTop: 8 }}>{error}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
