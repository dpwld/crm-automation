import {readJson} from '@/lib/http';
"use client";

import { useEffect, useRef, useState } from "react";
import { Braces, Mail, Paperclip, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Modal } from "@/components/ds/feedback/Modal";
import { Badge } from "@/components/ds/core/Badge";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Textarea } from "@/components/ds/forms/Textarea";
import { quotationEmailHtml } from "@/lib/email/quotationEmail";
import { signatureHtml, type SignatureIdentity } from "@/lib/email/signature";
import { fetchAppSettingJson, saveAppSettingJson } from "@/lib/data/settings";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { createClient } from "@/lib/supabase/client";
import type { CompanyDocument } from "@/types/domain";
import { RecipientInput } from "@/components/common/RecipientInput";
import { rememberRecipients } from "@/lib/recipients";



export interface EmailTemplate {
  name: string;
  subject: string;
  message: string;
}

const TEMPLATES_KEY = "email_templates";


const VARS: { token: string; label: string }[] = [
  { token: "{{company}}", label: "Company name" },
  { token: "{{docNo}}", label: "Document number" },
  { token: "{{contact}}", label: "Contact" },
  { token: "{{sender}}", label: "My name" },
  { token: "{{total}}", label: "Total" },
  { token: "{{validUntil}}", label: "Valid until" },
];

function money(n: number | null, currency: string): string {
  if (n == null) return "-";
  return `${currency === "KRW" ? "₩" : currency === "USD" ? "$" : `${currency} `}${n.toLocaleString("en-US")}`;
}


function stripDashes(s: string): string {
  return s.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "-");
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;


function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


function docSummaryOf(doc: CompanyDocument, companyName: string): string {
  const items = doc.lineItems
    .filter((li) => li.name.trim())
    .map((li) => `- ${li.name.split("\n")[0]} × ${li.qty} ${li.unit ?? "pcs"} @ ${money(li.unitPrice, doc.currency)} = ${money(li.amount, doc.currency)}`)
    .join("\n");
  return [
    `Document: ${doc.docNo ?? "(draft)"} (${doc.docType})`,
    `Company: ${companyName}`,
    `Total: ${money(doc.total, doc.currency)} (${doc.currency})`,
    items ? `Line items:\n${items}` : "",
    doc.paymentTerms ? `Payment terms: ${doc.paymentTerms}` : "",
    doc.incoterms ? `Incoterms: ${doc.incoterms}` : "",
    doc.validUntil ? `Valid until: ${doc.validUntil}` : "",
  ].filter(Boolean).join("\n");
}

export function EmailComposerModal({
  doc,
  companyName,
  companyContact,
  initialTo,
  initialSubject,
  initialMessage,
  richQuote,
  toSuggestions,
  attachment,
  onClose,
  onSend,
}: {
  doc: CompanyDocument;
  companyName: string;
  
  companyContact?: string;
  initialTo: string;
  initialSubject: string;
  initialMessage: string;
  
  richQuote: boolean;
  
  toSuggestions?: { name: string; email: string }[];
  
  attachment?: { filename: string; build: () => Promise<{ filename: string; mimeType: string; dataBase64: string }> };
  onClose: () => void;
  
  onSend: (opts: { to: string[]; cc: string[]; bcc: string[]; subject: string; message: string; html?: string; attachments?: { filename: string; mimeType: string; dataBase64: string }[] }) => Promise<void>;
}) {
  const me = useCurrentUser();
  const [toList, setToList] = useState<string[]>(() => (initialTo && EMAIL_RE.test(initialTo.trim()) ? [initialTo.trim()] : []));
  const [ccList, setCcList] = useState<string[]>([]);
  const [bccList, setBccList] = useState<string[]>([]);
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachPdf, setAttachPdf] = useState(!!attachment);

  // 변수 삽입 — 마지막 포커스된 입력(제목/본문)의 커서 위치에 토큰을 꽂는다.
  // DS Input/Textarea는 ref를 안 받으므로 onFocus에서 DOM 엘리먼트를 붙잡는다.
  const lastFocus = useRef<{ field: "subject" | "message"; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  function insertVar(token: string) {
    const target = lastFocus.current;
    const field = target?.field ?? "message";
    const value = field === "subject" ? subject : message;
    const start = target?.el.selectionStart ?? value.length;
    const end = target?.el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    if (field === "subject") setSubject(next);
    else setMessage(next);
    requestAnimationFrame(() => {
      const el = target?.el;
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // ── 서명 미리보기 — profiles에서 본인 행 조회, 실패 시 이름/이메일 폴백 ──
  const [sig, setSig] = useState<SignatureIdentity>({ name: me.fullName, title: me.title || undefined, email: me.email });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from("profiles")
          .select("full_name, title, mobile, email, office")
          .eq("id", uid)
          .maybeSingle();
        if (alive && data) {
          setSig({
            name: (data.full_name as string) || me.fullName,
            title: (data.title as string) || undefined,
            email: (data.email as string) || me.email,
            mobile: (data.mobile as string) || undefined,
            office: data.office as string | undefined,
          });
        }
      } catch {
        
      }
    })();
    return () => { alive = false; };
  }, [me.fullName, me.email]);

  // ── 템플릿 — app_settings "email_templates"에 저장 (열 때 lazy 로드) ──
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [templatePick, setTemplatePick] = useState("");
  const [templateName, setTemplateName] = useState("");
  useEffect(() => {
    fetchAppSettingJson<EmailTemplate[]>(TEMPLATES_KEY)
      .then((v) => setTemplates(v ?? []))
      .catch(() => setTemplates([]));
  }, []);

  async function persistTemplates(next: EmailTemplate[]) {
    setTemplates(next);
    try {
      await saveAppSettingJson(TEMPLATES_KEY, next);
    } catch (err) {
      console.error("template save failed:", err);
      setError("Could not save the template.");
    }
  }

  function applyTemplate(name: string) {
    setTemplatePick(name);
    const t = templates?.find((x) => x.name === name);
    if (!t) return;
    setSubject(t.subject);
    setMessage(t.message);
  }

  // ── AI 멘트 제작 — 결과는 초안으로 들고 있다가 "적용"으로만 반영 ──
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDraft, setAiDraft] = useState<{ subject: string; message: string } | null>(null);

  async function runAiDraft() {
    const instruction = aiInstruction.trim();
    if (!instruction) return;
    setAiBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          currentSubject: subject,
          currentMessage: message,
          docSummary: docSummaryOf(doc, companyName),
          language: /[가-힣]/.test(instruction) ? "ko" : "en",
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      // 서버도 대시를 걸러 주지만, 클라이언트에서 한 번 더 — 절대 노출 금지.
      setAiDraft({ subject: stripDashes(json.subject ?? ""), message: stripDashes(json.message ?? "") });
    } catch (err) {
      console.error("email draft failed:", err);
      setError(`AI draft failed · ${(err as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  }

  // ── 미리보기/발송 — 변수 토큰을 실제 값으로 치환 ──
  const varValues: Record<string, string> = {
    company: companyName,
    docNo: doc.docNo ?? "(draft)",
    contact: companyContact ?? "",
    sender: me.fullName,
    total: money(doc.total, doc.currency),
    validUntil: doc.validUntil ?? "",
  };
  const previewSubject = stripDashes(substituteVars(subject, varValues));
  const previewMessage = stripDashes(substituteVars(message, varValues));
  const previewBodyHtml = richQuote
    ? quotationEmailHtml(doc, companyName, previewMessage)
    : `<div style="font-family:-apple-system,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',sans-serif;font-size:14px;line-height:1.7;color:#1f2430;white-space:pre-wrap">${escHtml(previewMessage)}</div>`;

  const canSend = toList.length > 0 && !!previewSubject.trim();

  const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
  const labelStyle: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--text-muted)" };
  const sectionTitle: React.CSSProperties = { fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-subtle)" };

  return (
    <Modal
      open
      onClose={onClose}
      title={richQuote ? "Email quotation to customer" : "Email customer"}
      subtitle={doc.docNo ?? undefined}
      size="xl"
      style={{ width: "100%", maxWidth: "min(1280px, 96vw)" }}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, width: "100%" }}>
          {error && (
            <span style={{ flex: 1, textAlign: "left", fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)" }}>{error}</span>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button leftIcon={<Mail size={13} />} loading={sending} disabled={!canSend}
            onClick={() => {
              setSending(true);
              setError(null);
              (async () => {
                let attachments: { filename: string; mimeType: string; dataBase64: string }[] | undefined;
                if (attachPdf && attachment) {
                  try {
                    attachments = [await attachment.build()];
                  } catch (err) {
                    throw new Error(`PDF attach failed: ${(err as Error).message}`);
                  }
                }
                await onSend({
                  to: toList,
                  cc: ccList,
                  bcc: bccList,
                  subject: previewSubject.trim(),
                  message: previewMessage,
                  html: richQuote ? quotationEmailHtml(doc, companyName, previewMessage) : undefined,
                  attachments,
                });
                rememberRecipients([...toList, ...ccList, ...bccList].map((email) => ({ email })));
              })()
                .catch((err) => setError(`Delivery failed · ${(err as Error).message}`))
                .finally(() => setSending(false));
            }}>
            Send
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 1fr) minmax(360px, 1.1fr)", gap: 16 }}>
        {}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <RecipientInput label="To (customer email)" values={toList} onChange={setToList}
            suggestions={toSuggestions ?? []} placeholder="Type a name or email" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <RecipientInput label="Cc" values={ccList} onChange={setCcList} suggestions={toSuggestions ?? []} placeholder="Type a name or email" />
            <RecipientInput label="Bcc (hidden copy)" values={bccList} onChange={setBccList} suggestions={toSuggestions ?? []} placeholder="Type a name or email" />
          </div>
          <label style={fieldStyle}>
            <span style={labelStyle}>Subject</span>
            <Input size="sm" value={subject}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => { lastFocus.current = { field: "subject", el: e.target }; }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)} />
          </label>

          {}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <span style={{ ...labelStyle, display: "inline-flex", alignItems: "center", gap: 4 }}><Braces size={11} /> Variables</span>
            {VARS.map((v) => (
              <button key={v.token} type="button" title={`${v.label}: insert ${v.token} at the cursor`}
                onClick={() => insertVar(v.token)}
                style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", border: "1px solid transparent", borderRadius: 999, padding: "2px 8px", cursor: "pointer" }}>
                {v.token}
              </button>
            ))}
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Message</span>
            <Textarea rows={richQuote ? 9 : 12} value={message}
              onFocus={(e: React.FocusEvent<HTMLTextAreaElement>) => { lastFocus.current = { field: "message", el: e.target }; }}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)} />
          </label>

          {}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 10 }}>
            <span style={sectionTitle}>Templates</span>
            <div style={{ display: "flex", gap: 6 }}>
              <Select size="sm" value={templatePick} style={{ flex: 1, minWidth: 0 }} aria-label="Choose template"
                options={[
                  { value: "", label: templates === null ? "Loading…" : templates.length ? "Choose a template to apply its subject and message" : "No saved templates" },
                  ...(templates ?? []).map((t) => ({ value: t.name, label: t.name })),
                ]}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => applyTemplate(e.target.value)} />
              <Button variant="ghost" size="sm" iconOnly aria-label="Delete template" disabled={!templatePick}
                title={templatePick ? `"${templatePick}" · delete` : "Choose a template to delete"}
                onClick={() => {
                  const name = templatePick;
                  setTemplatePick("");
                  void persistTemplates((templates ?? []).filter((t) => t.name !== name));
                }}>
                <Trash2 size={13} />
              </Button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Input size="sm" value={templateName} placeholder="Name and save the current subject and message" style={{ flex: 1 }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemplateName(e.target.value)} />
              <Button variant="secondary" size="sm" leftIcon={<Save size={13} />} disabled={!templateName.trim()}
                onClick={() => {
                  const name = templateName.trim();
                  setTemplateName("");
                  setTemplatePick(name);
                  void persistTemplates([...(templates ?? []).filter((t) => t.name !== name), { name, subject, message }]);
                }}>
                Save
              </Button>
            </div>
          </div>

          {}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 10 }}>
            <span style={sectionTitle}>AI drafting</span>
            <div style={{ display: "flex", gap: 6 }}>
              <Input size="sm" value={aiInstruction} placeholder="e.g. use a formal tone, emphasize delivery timing" style={{ flex: 1 }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiInstruction(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !aiBusy) void runAiDraft(); }} />
              <Button variant="secondary" size="sm" leftIcon={<Sparkles size={13} />} loading={aiBusy} disabled={!aiInstruction.trim()}
                onClick={() => void runAiDraft()}>
                Draft with AI
              </Button>
            </div>
            {aiDraft && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", padding: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Badge tone="info" size="sm">AI draft</Badge>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aiDraft.subject}</span>
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-default)", whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>{aiDraft.message}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <Button variant="ghost" size="sm" onClick={() => setAiDraft(null)}>Discard</Button>
                  <Button variant="soft" size="sm"
                    onClick={() => {
                      setSubject(aiDraft.subject);
                      setMessage(aiDraft.message);
                      setAiDraft(null);
                    }}>
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>

          {attachment && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-default)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "8px 10px", cursor: "pointer" }}>
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
              <Paperclip size={13} style={{ color: "var(--text-muted)" }} />
              <span>Attach PDF <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{attachment.filename}</span></span>
            </label>
          )}
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
            Sent from your Gmail with your signature appended.
            {attachment ? " The document PDF is attached automatically while the checkbox is on." : ""}
          </span>
        </div>

        {}
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 12, maxHeight: 560, overflowY: "auto", background: "#fff", minWidth: 0 }}>
          <div style={{ ...sectionTitle, marginBottom: 8 }}>Preview</div>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "#1f2430", marginBottom: 10, wordBreak: "break-word" }}>
            {previewSubject || "(no subject)"}
          </div>
          {}
          <div dangerouslySetInnerHTML={{ __html: previewBodyHtml }} />
          <div style={{ height: 28 }} />
          <div dangerouslySetInnerHTML={{ __html: signatureHtml(sig) }} />
        </div>
      </div>
    </Modal>
  );
}
