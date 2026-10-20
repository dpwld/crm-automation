import {COMPANY, NDA_TERMS} from '@/lib/config/company';
import {readJson} from '@/lib/http';
"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { Alert } from "@/components/ds/feedback/Alert";
import { Input } from "@/components/ds/forms/Input";
import { Textarea } from "@/components/ds/forms/Textarea";
import { FormField } from "@/components/ds/forms/FormField";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { docHtml } from "@/lib/nda/document";
import { unsupportedChars } from "@/lib/nda/latin";
import { validateNdaTerms, type NdaFields, type NdaKind } from "@/lib/nda/template";
import type { NdaRequestItem } from "@/lib/nda/requests";
import { RecipientInput } from "@/components/common/RecipientInput";
import { rememberRecipients } from "@/lib/recipients";



export type NdaContact = { name: string; email: string };

const EMPTY: NdaFields = { partyBName: "", partyBEntity: "", partyBAddress: "", purpose: "" };

function defaultMessage(recipient: string, party: string, sender: string, kind: NdaKind) {
  const first = recipient.trim().split(/\s+/)[0] || "there";
  return `Dear ${first},\n\nAs discussed, please review and sign the Nondisclosure Agreement between ${COMPANY.name || "your organisation"} and ${kind === "individual" ? "you" : party}. You can read and sign it online using the button below. It only takes a minute.\n\nOnce signed, we will countersign and send you the fully executed copy.\n\nBest regards,\n${sender}`;
}

export function NdaSendModal({
  open, onClose, kind, companyId = null, initialFields = null, contacts = [], onSent,
}: {
  open: boolean;
  onClose: () => void;
  kind: NdaKind;
  companyId?: string | null;
  initialFields?: NdaFields | null;
  contacts?: NdaContact[];
  onSent: (item: NdaRequestItem) => void;
}) {
  const me = useCurrentUser();
  const [fields, setFields] = useState<NdaFields>(initialFields ?? EMPTY);
  const [why, setWhy] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [recipientName, setRecipientName] = useState(contacts[0]?.name ?? "");
  const [recipientEmail, setRecipientEmail] = useState(contacts[0]?.email ?? "");
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [messageEdited, setMessageEdited] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const party = fields.partyBName.trim();
  const autoSubject = `NDA for signature: ${COMPANY.name || "your organisation"} & ${party || "…"}`;
  const autoMessage = defaultMessage(recipientName, party || "your company", me.fullName || "Workspace", kind);
  const finalSubject = subject || autoSubject;
  const finalMessage = messageEdited ? message : autoMessage;
  const set = (patch: Partial<NdaFields>) => setFields((f) => ({ ...f, ...patch }));

  const required: [keyof NdaFields, string][] = kind === "individual"
    ? [["partyBName", "Name"], ["partyBAddress", "Address"], ["purpose", "Purpose"]]
    : [["partyBName", "Legal name"], ["partyBEntity", "Entity phrase"], ["partyBAddress", "Address"], ["purpose", "Purpose"]];
  const missing = required.filter(([k]) => !fields[k].trim() || /\[_*\]/.test(fields[k])).map(([, l]) => l);
  const nonLatin = required.flatMap(([k, l]) => (unsupportedChars(fields[k]).length ? [l] : []));
  const emailOk = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(recipientEmail.trim());
  const termsError = validateNdaTerms(NDA_TERMS);
  const ready = !termsError && !missing.length && !nonLatin.length && !!recipientName.trim() && emailOk;

  async function draftPurpose() {
    setDrafting(true); setError("");
    try {
      const res = await fetch("/api/nda", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, company: fields.partyBName, address: fields.partyBAddress, purpose: why }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      const keep = (v: string, next: unknown) => (v.trim() ? v : typeof next === "string" && !next.startsWith("[") ? next : v);
      setFields((f) => ({
        partyBName: keep(f.partyBName, json.partyBName),
        partyBEntity: kind === "individual" ? "" : typeof json.partyBEntity === "string" && !json.partyBEntity.startsWith("[") ? json.partyBEntity : f.partyBEntity,
        partyBAddress: keep(f.partyBAddress, json.partyBAddress),
        purpose: typeof json.purpose === "string" ? json.purpose : f.purpose,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setDrafting(false); }
  }

  async function send() {
    if (!ready || sending) return;
    setSending(true); setError("");
    try {
      const res = await fetch("/api/nda/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, companyId, fields, recipientName: recipientName.trim(), recipientEmail: recipientEmail.trim(),
          cc, subject: finalSubject, message: finalMessage,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      rememberRecipients([{ name: recipientName.trim(), email: recipientEmail.trim() }, ...cc.map((email) => ({ email }))]);
      onSent(json as NdaRequestItem);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSending(false); }
  }

  return (
    <Modal
      open={open}
      onClose={sending ? null : onClose}
      size="lg"
      title={kind === "individual" ? "Send NDA for signature · Individual" : "Send NDA for signature"}
      subtitle="The signer receives a private link valid for 14 days. After countersignature, the executed copy is emailed and saved with the customer’s NDA records."
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          {!ready && (
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginRight: "auto" }}>
              {termsError || (missing.length ? `Fill in: ${missing.join(", ")}` : nonLatin.length ? `Use English letters in: ${nonLatin.join(", ")}` : "Enter the signer's name and email")}
            </span>
          )}
          <Button variant="ghost" size="sm" disabled={sending} onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" leftIcon={<Send size={14} />} loading={sending} disabled={!ready} onClick={() => void send()}>
            Send for signature
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        {termsError && <p role="alert">{termsError}</p>}
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Agreement</div>
          <div style={{ display: "grid", gridTemplateColumns: kind === "individual" ? "1fr" : "1fr 1fr", gap: 10 }}>
            <FormField label={kind === "individual" ? "Individual's full name" : "Counterparty legal name"}>
              <Input size="sm" id="nda-send-party" value={fields.partyBName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ partyBName: e.target.value })} />
            </FormField>
            {kind === "company" && (
              <FormField label="Entity phrase" hint='e.g. "a Korean corporation", "a Delaware Company"'>
                <Input size="sm" id="nda-send-entity" value={fields.partyBEntity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ partyBEntity: e.target.value })} />
              </FormField>
            )}
          </div>
          <FormField label={kind === "individual" ? "Residential address" : "Address"}>
            <Input size="sm" id="nda-send-address" value={fields.partyBAddress} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ partyBAddress: e.target.value })} />
          </FormField>
          <FormField label="Purpose" hint="Describe this agreement’s purpose. Your saved agreement terms appear unchanged in the document.">
            <Textarea rows={2} id="nda-send-purpose" value={fields.purpose} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set({ purpose: e.target.value })} />
          </FormField>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <FormField label="Draft with AI (optional)" hint="Describe why in plain language (Korean is fine). Fills the entity phrase and Purpose.">
                <Input size="sm" id="nda-send-why" value={why} placeholder="e.g. supplier reviewing our project requirements"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWhy(e.target.value)} />
              </FormField>
            </div>
            <Button variant="soft" size="sm" leftIcon={<Sparkles size={13} />} loading={drafting} disabled={!why.trim()} onClick={() => void draftPurpose()}>Draft</Button>
          </div>
          <button type="button" onClick={() => setShowPreview((v) => !v)}
            style={{ justifySelf: "start", background: "none", border: 0, padding: 0, color: "var(--color-primary)", cursor: "pointer", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
            {showPreview ? "Hide agreement preview" : "Preview agreement"}
          </button>
          {showPreview && (
            <div className="sx-scroll" style={{ maxHeight: 320, overflowY: "auto", background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "28px 32px" }}
              dangerouslySetInnerHTML={{ __html: docHtml(fields, null, false, kind) }} />
          )}
        </section>

        <section style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Signer</div>
          {}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <RecipientInput id="nda-send-email" label="Signer email" single values={recipientEmail ? [recipientEmail] : []}
              onChange={(v) => setRecipientEmail(v[0] ?? "")}
              onPick={(r) => { if (r.name) setRecipientName(r.name); }}
              suggestions={contacts} placeholder="Type a name or email" />
            <FormField label="Signer name"><Input size="sm" id="nda-send-recipient" value={recipientName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipientName(e.target.value)} /></FormField>
          </div>
          <RecipientInput id="nda-send-cc" label="CC (optional)" values={cc} onChange={setCc} placeholder="Type a name or email" />
          <FormField label="Subject">
            <Input size="sm" id="nda-send-subject" value={finalSubject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)} />
          </FormField>
          <FormField label="Message" hint="Sent from your Gmail with your signature and a “Review & sign” button.">
            <Textarea rows={7} id="nda-send-message" value={finalMessage}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setMessageEdited(true); setMessage(e.target.value); }} />
          </FormField>
        </section>
        {error && <Alert tone="warning" title="Couldn’t send" onClose={() => setError("")}>{error}</Alert>}
      </div>
    </Modal>
  );
}
