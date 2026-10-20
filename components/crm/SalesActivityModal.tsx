"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ds/core/Button";
import { Modal } from "@/components/ds/feedback/Modal";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Textarea } from "@/components/ds/forms/Textarea";
import { Alert } from "@/components/ds/feedback/Alert";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import {
  fetchCompanyContacts, insertContact, insertContactLog,
  type ContactLogKind, type CustomerContact,
} from "@/lib/data/customers";
import { insertFollowUp } from "@/lib/data/followups";
import type { DealSummary } from "@/lib/data/deals";



const KIND_OPTIONS: { value: ContactLogKind; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "note", label: "Note" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface SalesActivitySaved {
  
  newDeal: { id: string; dealNo: string } | null;
  dealId: string | null;
  summary: string;
}

export function SalesActivityModal({
  open,
  companyId,
  companyName,
  deals,
  defaultDealId = null,
  onSaved,
  onClose,
}: {
  open: boolean;
  companyId: string;
  companyName: string;
  
  deals: DealSummary[];
  defaultDealId?: string | null;
  onSaved: (result: SalesActivitySaved) => void;
  onClose: () => void;
}) {
  const me = useCurrentUser();
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [contactId, setContactId] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [kind, setKind] = useState<ContactLogKind>("email");
  const [dealSel, setDealSel] = useState<string>(() => defaultDealId ?? (deals.find((d) => d.companyId === companyId)?.id ?? "company"));
  const [logDate, setLogDate] = useState(today);
  const [body, setBody] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDeals = useMemo(() => deals.filter((d) => d.companyId === companyId), [deals, companyId]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchCompanyContacts(companyId, companyName, "crm")
      .then((cs) => {
        if (!alive) return;
        setContacts(cs);
        setContactId(cs[0]?.id ?? "new");
      })
      .catch(() => { if (alive) { setContacts([]); setContactId("new"); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, defaultDealId]);

  async function save() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      // 1) 연락처 — 없으면 이름으로 즉석 등록
      let targetContactId = contactId;
      if (contactId === "new") {
        if (!newContactName.trim()) { setError("Enter the contact's name."); setSaving(false); return; }
        const saved = await insertContact({
          space: "crm", companyId, companyName,
          name: newContactName.trim(), title: "", email: "", phone: "",
          createdByKey: me.id,
        });
        targetContactId = saved.id;
      }

      // 2) 딜 — 새 First contact 딜 생성 경로 (v3 원칙: 첫 컨택도 딜로 시작)
      // 딜 생성·채번은 Spec sheet에서만 (2026-09-17 대표 지시) — 여기선 연결만.
      const dealId: string | null = dealSel === "company" || dealSel === "" ? null : dealSel;
      const newDeal: { id: string; dealNo: string } | null = null;

      // 3) 활동 기록
      await insertContactLog({
        contactId: targetContactId, kind, body: body.trim(), logDate, authorKey: me.id, space: "crm",
        ...(dealId ? { dealId } : {}),
      });

      // 4) 다음 행동 — 입력했을 때만 (crm_followups 미실행 DB면 기록은 남고 이건 경고)
      if (nextAction.trim()) {
        try {
          await insertFollowUp({
            companyId, dealId, title: nextAction.trim(),
            dueDate: nextDue || null, ownerKey: me.id, createdByKey: me.id,
          });
        } catch (err) {
          console.error("follow-up save failed:", err);
          setError("Activity saved, but the follow-up couldn't be saved (run the 2026-09-17 SQL).");
        }
      }

      onSaved({ newDeal, dealId, summary: body.trim() });
      onClose();
    } catch (err) {
      console.error("sales activity save failed:", err);
      setError("Couldn't save the activity.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const contactOptions = [
    ...(contacts ?? []).map((c) => ({ value: c.id, label: c.name + (c.title ? ` · ${c.title}` : "") })),
    { value: "new", label: "+ New contact" },
  ];
  const dealOptions = [
    ...openDeals.map((d) => ({ value: d.id, label: `${d.dealNo} · ${d.title}` })),
    { value: "company", label: "Company only (no deal yet)" },
  ];

  return (
    <Modal open onClose={onClose} title={`Log sales activity · ${companyName}`} size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Contact
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)} options={contactOptions} style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Channel
            <Select value={kind} onChange={(e) => setKind(e.target.value as ContactLogKind)} options={KIND_OPTIONS} style={{ marginTop: 4 }} />
          </label>
          {contactId === "new" && (
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              New contact name *
              <Input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Who did you talk to?" style={{ marginTop: 4 }} />
            </label>
          )}
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Link to deal
            <Select value={dealSel} onChange={(e) => setDealSel(e.target.value)} options={dealOptions} style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Date
            <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} style={{ marginTop: 4 }} />
          </label>
        </div>

        <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          What happened *
          <Textarea rows={4} value={body} placeholder="Customer needs, what was discussed, agreed next steps…"
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)} style={{ marginTop: 4 }} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Next action
            <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Confirm project requirements" style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Due
            <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} style={{ marginTop: 4 }} />
          </label>
        </div>

        {error && <Alert tone="warning" title="Check">{error}</Alert>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
            Manual record · nothing is sent. First contacts start as deals so later documents and parts stay linked.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={saving} disabled={!body.trim()} onClick={() => void save()}>Save activity</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
