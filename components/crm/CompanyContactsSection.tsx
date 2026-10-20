"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Mail, Pencil, Phone, Plus, StickyNote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Spinner } from "@/components/ds/core/Spinner";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Textarea } from "@/components/ds/forms/Textarea";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { memberName } from "@/lib/mock/team";
import {
  deleteContact, deleteContactLog, fetchCompanyContacts, fetchLogsForContacts,
  insertContact, insertContactLog, updateContact,
  type ContactLog, type ContactLogKind, type CustomerContact, type CustomerSpace,
} from "@/lib/data/customers";
import { fetchDealsLight } from "@/lib/data/deals";



const KIND_ICON: Record<ContactLogKind, React.ReactNode> = {
  note: <StickyNote size={12} />,
  call: <Phone size={12} />,
  email: <Mail size={12} />,
  meeting: <CalendarDays size={12} />,
};

const KIND_OPTIONS: { value: ContactLogKind; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em",
  textTransform: "uppercase", color: "var(--text-subtle)",
};

type ContactForm = { name: string; title: string; email: string; phone: string };
const EMPTY_FORM: ContactForm = { name: "", title: "", email: "", phone: "" };

export function CompanyContactsSection({
  companyId,
  companyName,
  space,
}: {
  companyId: string;
  companyName: string;
  space: CustomerSpace;
}) {
  const me = useCurrentUser();
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [logs, setLogs] = useState<ContactLog[] | null>(null);
  const [dealOpts, setDealOpts] = useState<{ id: string; dealNo: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 연락처 추가/수정 인라인 폼 ("new" = 추가)
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // 접촉 기록 컴포저
  const [logOpen, setLogOpen] = useState(false);
  const [logContactId, setLogContactId] = useState("");
  const [logKind, setLogKind] = useState<ContactLogKind>("note");
  const [logDate, setLogDate] = useState(today);
  const [logDealId, setLogDealId] = useState("");
  const [logBody, setLogBody] = useState("");
  const [logSaving, setLogSaving] = useState(false);
  const [removingLogId, setRemovingLogId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCompanyContacts(companyId, companyName, space)
      .then(async (cs) => {
        if (!alive) return;
        setContacts(cs);
        const ls = await fetchLogsForContacts(cs.map((c) => c.id), space);
        if (alive) setLogs(ls);
      })
      .catch((err) => {
        console.error("company contacts load failed:", err);
        if (alive) { setContacts([]); setLogs([]); setError("Couldn't load contacts"); }
      });
    fetchDealsLight()
      .then((all) => { if (alive) setDealOpts(all.filter((d) => d.companyId === companyId).map((d) => ({ id: d.id, dealNo: d.dealNo }))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [companyId, companyName, space]);

  const contactName = useMemo(() => {
    const byId = new Map((contacts ?? []).map((c) => [c.id, c.name] as const));
    return (id: string) => byId.get(id) ?? "?";
  }, [contacts]);

  function openEdit(c: CustomerContact | null) {
    setEditing(c ? c.id : "new");
    setForm(c ? { name: c.name, title: c.title, email: c.email, phone: c.phone } : EMPTY_FORM);
    setError(null);
  }

  async function saveContact() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing === "new") {
        const saved = await insertContact({
          space, companyId, companyName,
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
    } catch (err) {
      console.error("contact save failed:", err);
      setError("Couldn't save the contact");
    } finally {
      setSaving(false);
    }
  }

  async function removeContact(c: CustomerContact) {
    if (!window.confirm(`Delete ${c.name}? Their activity log goes too.`)) return;
    try {
      await deleteContact(c.id);
      setContacts((cs) => (cs ?? []).filter((x) => x.id !== c.id));
      setLogs((ls) => (ls ?? []).filter((l) => l.contactId !== c.id));
    } catch (err) {
      console.error("contact delete failed:", err);
      setError("Couldn't delete the contact");
    }
  }

  async function saveLog() {
    const contactId = logContactId || (contacts ?? [])[0]?.id;
    if (!contactId || !logBody.trim() || logSaving) return;
    setLogSaving(true);
    setError(null);
    try {
      const saved = await insertContactLog({
        contactId, kind: logKind, body: logBody.trim(), logDate, authorKey: me.id, space,
        ...(logDealId ? { dealId: logDealId } : {}),
      });
      setLogs((ls) => [saved, ...(ls ?? [])]);
      setLogBody("");
      setLogOpen(false);
    } catch (err) {
      console.error("contact log save failed:", err);
      setError("Couldn't save the activity");
    } finally {
      setLogSaving(false);
    }
  }

  async function removeLog(log: ContactLog) {
    setRemovingLogId(log.id);
    try {
      await deleteContactLog(log.id);
      setLogs((ls) => (ls ?? []).filter((l) => l.id !== log.id));
    } catch (err) {
      console.error("contact log delete failed:", err);
      setError("Couldn't delete the activity");
    } finally {
      setRemovingLogId(null);
    }
  }

  const dealNoOf = (id: string | null) => dealOpts.find((d) => d.id === id)?.dealNo ?? null;

  return (
    <div style={{ marginTop: 14 }}>
      {}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 6 }}>
        <span style={SECTION_TITLE}>Contacts{contacts ? ` (${contacts.length})` : ""}</span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" leftIcon={<Plus size={12} />} onClick={() => openEdit(null)}>
          Add
        </Button>
      </div>

      {contacts === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "var(--text-xs)", padding: "4px 0" }}>
          <Spinner size="sm" /> Loading…
        </div>
      ) : contacts.length === 0 && editing !== "new" ? (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "2px 0 4px" }}>
          No contacts yet · add the people you talk to at {companyName}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {contacts.map((c) => (
            <div key={c.id} style={{ borderBottom: "1px solid var(--border-subtle)", padding: "6px 0" }}>
              {editing === c.id ? (
                <ContactFormRow form={form} setForm={setForm} saving={saving}
                  onSave={() => void saveContact()} onCancel={() => setEditing(null)} />
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)" }}>{c.name}</span>
                      {c.title && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>}
                    </div>
                    {(c.email || c.phone) && (
                      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[c.email, c.phone].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" iconOnly aria-label={`Edit ${c.name}`} onClick={() => openEdit(c)}>
                    <Pencil size={12} />
                  </Button>
                  <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${c.name}`} onClick={() => void removeContact(c)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {editing === "new" && (
            <div style={{ borderBottom: "1px solid var(--border-subtle)", padding: "6px 0" }}>
              <ContactFormRow form={form} setForm={setForm} saving={saving}
                onSave={() => void saveContact()} onCancel={() => setEditing(null)} />
            </div>
          )}
        </div>
      )}
      {}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0 6px" }}>
        <span style={SECTION_TITLE}>Activities</span>
        <span style={{ flex: 1 }} />
        {(contacts?.length ?? 0) > 0 && (
          <Button variant="ghost" size="sm" leftIcon={logOpen ? <X size={12} /> : <Plus size={12} />} onClick={() => setLogOpen((v) => !v)}>
            {logOpen ? "Close" : "Log"}
          </Button>
        )}
      </div>

      {logOpen && (contacts?.length ?? 0) > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Select size="sm" aria-label="Contact" value={logContactId || (contacts ?? [])[0]?.id || ""}
              onChange={(e) => setLogContactId(e.target.value)}
              options={(contacts ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            <Select size="sm" aria-label="Kind" value={logKind}
              onChange={(e) => setLogKind(e.target.value as ContactLogKind)} options={KIND_OPTIONS} />
            <Input size="sm" type="date" aria-label="Date" value={logDate}
              onChange={(e) => setLogDate(e.target.value)} />
            <Select size="sm" aria-label="Deal" value={logDealId}
              onChange={(e) => setLogDealId(e.target.value)}
              options={[{ value: "", label: "No deal" }, ...dealOpts.map((d) => ({ value: d.id, label: d.dealNo }))]} />
          </div>
          <Textarea rows={2} placeholder="What happened? (call summary, meeting notes…)" value={logBody}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLogBody(e.target.value)} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button size="sm" loading={logSaving} disabled={!logBody.trim()} onClick={() => void saveLog()}>
              Log activity
            </Button>
          </div>
        </div>
      )}

      {logs !== null && logs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {logs.slice(0, 8).map((log) => (
            <div key={log.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: "var(--color-primary)", marginTop: 2, flexShrink: 0 }}>{KIND_ICON[log.kind]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{contactName(log.contactId)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{log.logDate}</span>
                  {memberName(log.authorKey) !== "Unknown" && <span>{memberName(log.authorKey)}</span>}
                  {log.dealId && dealNoOf(log.dealId) && (
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", borderRadius: 999, padding: "0 6px" }}>
                      {dealNoOf(log.dealId)}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  {(log.authorKey === me.id || me.role === "admin") && (
                    <Button variant="ghost" size="sm" iconOnly aria-label="Delete activity"
                      loading={removingLogId === log.id} onClick={() => void removeLog(log)}>
                      <Trash2 size={11} />
                    </Button>
                  )}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-strong)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                  {log.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: "var(--text-2xs)", color: "var(--red-600, #dc2626)", paddingTop: 4 }}>{error}</div>
      )}
    </div>
  );
}


function ContactFormRow({
  form, setForm, saving, onSave, onCancel,
}: {
  form: ContactForm;
  setForm: React.Dispatch<React.SetStateAction<ContactForm>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
        <Button size="sm" loading={saving} disabled={!form.name.trim()} onClick={onSave}>Save</Button>
      </div>
    </div>
  );
}
