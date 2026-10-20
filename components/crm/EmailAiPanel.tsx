import {COMPANY} from '@/lib/config/company';
import {readJson} from '@/lib/http';
"use client";

import { useState } from "react";
import { ArrowRight, Copy, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Alert } from "@/components/ds/feedback/Alert";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { Modal } from "@/components/ds/feedback/Modal";
import { Spinner } from "@/components/ds/core/Spinner";
import { Textarea } from "@/components/ds/forms/Textarea";
import type { FeedContext } from "@/types/domain";
import type { CrmEmail, EmailAiBrief } from "@/lib/data/emails";
import { createClient } from "@/lib/supabase/client";
import { signatureHtml } from "@/lib/email/signature";
import { RecipientInput } from "@/components/common/RecipientInput";
import { rememberRecipients } from "@/lib/recipients";



const STEP_LABEL: Record<string, string> = {
  targeting: "Targeting",
  first_contact: "First contact",
  nda: "NDA",
  spec: "Spec sheet",
  quotation: "Quotation",
  purchase_order: "Purchase Order",
  invoice: "Invoice",
};

interface StepSuggestion { step: string; reason: string; entryText: string; nextAction: string }

function counterpartOf(email: CrmEmail): string {
  if (email.direction === "inbound") return email.fromAddr;
  const ext = email.toAddrs.split(/[,;]\s*/).map((s) => s.trim()).find((a) => a && a.toLowerCase() !== COMPANY.email.toLowerCase());
  return ext ?? "";
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await readJson(res).catch(() => ({}));
  if (!res.ok) throw new Error((json as { detail?: string; error?: string }).detail || (json as { error?: string }).error || `HTTP ${res.status}`);
  return json as T;
}

export function EmailAiPanel({
  email,
  myEmail,
  onOpenStep,
  onBriefSaved,
}: {
  email: CrmEmail;
  
  myEmail: string;
  
  onOpenStep?: (step: FeedContext, prefill?: { body?: string; nextAction?: string }) => void;
  
  onBriefSaved?: (emailId: string, brief: EmailAiBrief) => void;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<EmailAiBrief | null>(email.aiBrief);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [suggest, setSuggest] = useState<StepSuggestion | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [replyBcc, setReplyBcc] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  // 발송 시 자동 첨부되는 본인 서명 미리보기 (profiles의 이름·직함·휴대폰)
  const [sigHtml, setSigHtml] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [replyError, setReplyError] = useState("");

  const ownMailbox = email.mailbox === myEmail.toLowerCase();

  async function loadBrief(refresh = false) {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await postJson<{ brief: EmailAiBrief; saveError?: string }>("/api/crm/email-brief", { emailId: email.id, refresh });
      setBrief(res.brief);
      onBriefSaved?.(email.id, res.brief);
      if (res.saveError) setError(res.saveError);
    } catch (err) {
      setError(`Couldn't build the brief — ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !brief) void loadBrief();
  }

  async function loadSuggestion() {
    if (suggesting) return;
    setSuggesting(true);
    setError("");
    try {
      const res = await postJson<StepSuggestion>("/api/crm/email-step", { emailId: email.id });
      setSuggest(res);
      setSuggestOpen(true);
    } catch (err) {
      setError(`Couldn't suggest a step — ${(err as Error).message}`);
    } finally {
      setSuggesting(false);
    }
  }

  function openReply() {
    setReplyTo(counterpartOf(email));
    setReplyCc("");
    setReplyBcc("");
    setReplySubject(email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`);
    setReplyBody(brief?.suggestedReply ?? "");
    setReplyError("");
    setReplyOpen(true);
    // 서명 미리보기 — 발송 서버가 쓰는 것과 같은 profiles 값으로 그린다.
    if (sigHtml === null) {
      const sb = createClient();
      sb.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return;
        const { data: p } = await sb.from("profiles").select("full_name, title, mobile, email, office").eq("id", user.id).maybeSingle();
        setSigHtml(signatureHtml({
          name: ((p?.full_name as string) || "").trim() || myEmail,
          title: ((p?.title as string) || "").trim() || undefined,
          email: ((p?.email as string) || "").trim() || myEmail,
          mobile: ((p?.mobile as string) || "").trim() || undefined,
          office: p?.office as string | undefined,
        }));
      }).catch(() => {});
    }
  }

  const parseAddrs = (s: string) =>
    [...new Set(s.split(/[,;]\s*/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];

  async function refine() {
    if (!instruction.trim() || refining) return;
    setRefining(true);
    setReplyError("");
    try {
      const res = await postJson<{ subject: string; message: string }>("/api/email-draft", {
        instruction,
        currentSubject: replySubject,
        currentMessage: replyBody,
        docSummary: brief ? `EMAIL BRIEF: ${brief.summary}\nKEY POINTS: ${brief.keyPoints.join("; ")}` : email.snippet,
        language: /[가-힣]/.test(instruction) ? "ko" : "en",
      });
      if (res.subject) setReplySubject(res.subject);
      if (res.message) setReplyBody(res.message);
      setInstruction("");
    } catch (err) {
      setReplyError(`AI refine failed — ${(err as Error).message}`);
    } finally {
      setRefining(false);
    }
  }

  async function send() {
    const to = replyTo.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { setReplyError("Enter a valid recipient address."); return; }
    if (!replyBody.trim() || sending) return;
    setSending(true);
    setReplyError("");
    try {
      const res = await postJson<{ sent: number; error?: string; detail?: string }>("/api/pm/notify", {
        external: true,
        recipients: [to],
        cc: parseAddrs(replyCc),
        bcc: parseAddrs(replyBcc),
        subject: replySubject.trim() || `Re: ${email.subject}`,
        bodyText: replyBody,
        inReplyTo: email.messageId || undefined,
      });
      if (!res.sent) {
        setReplyError(res.error === "no_gmail_scope"
          ? "Your Google sign-in doesn't have the send permission yet — sign out and sign in to Pulse again, then retry."
          : `Send failed — ${res.error ?? "unknown"}${res.detail ? ` (${res.detail})` : ""}`);
        return;
      }
      rememberRecipients([to, ...parseAddrs(replyCc), ...parseAddrs(replyBcc)].map((email) => ({ email })));
      setReplyOpen(false);
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 4000);
    } catch (err) {
      setReplyError(`Send failed — ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Button size="sm" variant="ghost" leftIcon={<Send size={12} />} onClick={openReply}>Reply…</Button>
        {onOpenStep && (
          <Button size="sm" variant="ghost" loading={suggesting} leftIcon={<ArrowRight size={12} />} onClick={() => void loadSuggestion()}>
            Suggest step
          </Button>
        )}
        <Button size="sm" variant={open ? "secondary" : "ghost"} leftIcon={<Sparkles size={12} />} onClick={toggle}>
          {open ? "Hide AI brief" : brief ? "AI brief" : "AI brief (summarize)"}
        </Button>
        {sentFlash && <span style={{ fontSize: "var(--text-xs)", color: "var(--green-600, #16a34a)" }}>✓ Reply sent — it will appear in the feed on the next mail sync.</span>}
      </div>

      {open && (
        <div style={{ marginTop: 8, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--surface-sunken)", padding: "10px 12px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
              <Spinner size="sm" /> Reading the email{ownMailbox ? " and attachments" : ""}…
            </div>
          ) : brief ? (
            <>
              {brief.partial && (
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--amber-600, #b45309)", marginBottom: 6 }}>
                  Summarized from the subject and snippet only — the full body and attachments are readable by the mailbox owner ({email.mailbox || "unknown"}).
                </div>
              )}
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-strong)", whiteSpace: "pre-wrap" }}>{brief.summary}</div>
              {brief.keyPoints.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: "var(--text-xs)", color: "var(--text-default)", display: "flex", flexDirection: "column", gap: 2 }}>
                  {brief.keyPoints.map((k, idx) => <li key={idx}>{k}</li>)}
                </ul>
              )}
              {brief.attachments.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: 3 }}>Attachments</div>
                  {brief.attachments.map((a) => (
                    <div key={a.name} style={{ fontSize: "var(--text-xs)", color: "var(--text-default)", marginBottom: 2 }}>
                      <span style={{ fontWeight: 600 }}>{a.name}</span> — {a.gist}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <Button size="sm" variant="primary" leftIcon={<Send size={12} />} onClick={openReply}>Reply…</Button>
                {onOpenStep && (
                  <Button size="sm" variant="secondary" loading={suggesting} leftIcon={<ArrowRight size={12} />} onClick={() => void loadSuggestion()}>
                    Suggest step
                  </Button>
                )}
                <Button size="sm" variant="ghost" iconOnly aria-label="Refresh brief" onClick={() => void loadBrief(true)}>
                  <RefreshCw size={12} />
                </Button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>No brief yet.</div>
          )}
          {error && <div style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)", marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {}
      {suggestOpen && suggest && (
        <Modal open onClose={() => setSuggestOpen(false)} title="Where this email belongs" size="md">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", borderRadius: 999, padding: "3px 12px" }}>
                {STEP_LABEL[suggest.step] ?? suggest.step}
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{suggest.reason}</span>
            </div>
            <div>
              <div style={{ fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: 4 }}>Suggested entry</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-strong)", whiteSpace: "pre-wrap", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "8px 10px", background: "var(--surface-sunken)" }}>
                {suggest.entryText}
              </div>
            </div>
            {suggest.nextAction && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-default)" }}>
                <b>Next action:</b> {suggest.nextAction}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button variant="ghost" size="sm" leftIcon={<Copy size={12} />}
                onClick={() => { void navigator.clipboard?.writeText(suggest.entryText).catch(() => {}); }}>
                Copy text
              </Button>
              <Button variant="ghost" size="sm" leftIcon={<X size={12} />} onClick={() => setSuggestOpen(false)}>Close</Button>
              {onOpenStep && (
                <Button variant="primary" size="sm" leftIcon={<ArrowRight size={12} />}
                  onClick={() => {
                    setSuggestOpen(false);
                    onOpenStep(suggest.step as FeedContext, { body: suggest.entryText, nextAction: suggest.nextAction });
                  }}>
                  Open {STEP_LABEL[suggest.step] ?? suggest.step} →
                </Button>
              )}
            </div>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
              Nothing is recorded until you save it on that step — the First contact form comes pre-filled with this text.
            </div>
          </div>
        </Modal>
      )}

      {}
      {replyOpen && (
        <Modal open onClose={() => setReplyOpen(false)} title={`Reply — ${email.subject || "(no subject)"}`} size="lg">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <RecipientInput label="To" single values={replyTo ? [replyTo] : []} onChange={(v) => setReplyTo(v[0] ?? "")} placeholder="Type a name or email" />
              <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Subject
                <Input size="sm" value={replySubject} onChange={(e) => setReplySubject(e.target.value)} style={{ marginTop: 4 }} />
              </label>
              <RecipientInput label="Cc" values={parseAddrs(replyCc)} onChange={(v) => setReplyCc(v.join(", "))} placeholder="Type a name or email" />
              <RecipientInput label="Bcc" values={parseAddrs(replyBcc)} onChange={(v) => setReplyBcc(v.join(", "))} placeholder="Type a name or email" />
            </div>
            <Textarea rows={9} value={replyBody} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReplyBody(e.target.value)} />
            {}
            <div style={{ border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 12px", background: "var(--surface-card)" }}>
              <div style={{ fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: 6 }}>
                Signature — added automatically
              </div>
              {sigHtml ? (
                <div dangerouslySetInnerHTML={{ __html: sigHtml }} />
              ) : (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Loading…</div>
              )}
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 6 }}>
                Name · title · mobile come from Settings → Account.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Input size="sm" placeholder="AI instruction — e.g. use a formal tone, emphasize delivery timing" value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void refine(); }}
                style={{ flex: 1, minWidth: 200 }} />
              <Button size="sm" variant="secondary" loading={refining} disabled={!instruction.trim()} leftIcon={<Sparkles size={12} />} onClick={() => void refine()}>
                AI refine
              </Button>
            </div>
            {replyError && <Alert tone="warning" title="Couldn’t send">{replyError}</Alert>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginRight: "auto" }}>
                Sent from your Gmail with your signature · threads with the original email.
              </span>
              <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" loading={sending} disabled={!replyBody.trim()} leftIcon={<Send size={12} />} onClick={() => void send()}>
                Send reply
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
