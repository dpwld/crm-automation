import {COMPANY} from '@/lib/config/company';
import {readJson} from '@/lib/http';
"use client";

import { useEffect, useState } from "react";
import { FileText, PenLine, RotateCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ds/core/Badge";
import { Button } from "@/components/ds/core/Button";
import { Spinner } from "@/components/ds/core/Spinner";
import { Alert } from "@/components/ds/feedback/Alert";
import type { NdaRequestItem } from "@/lib/nda/requests";



const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  sending: { label: "Sending", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  viewed: { label: "Opened", tone: "info" },
  signed: { label: "Awaiting Workspace signature", tone: "warning" },
  completed: { label: "Fully executed", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  voided: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Link expired", tone: "neutral" },
  failed: { label: "Send failed", tone: "danger" },
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

export function NdaRequestsList({
  companyId, refreshKey = 0, canCountersign, onCompleted, emptyText = "No NDAs sent for signature yet.",
}: {
  
  companyId?: string | null;
  refreshKey?: number;
  canCountersign: boolean;
  onCompleted?: (item: NdaRequestItem, docId: string) => void;
  emptyText?: string;
}) {
  const [items, setItems] = useState<NdaRequestItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/nda/requests${companyId ? `?companyId=${companyId}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await readJson(res);
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (alive) { setItems(json as NdaRequestItem[]); setLoadError(""); }
      })
      .catch((e) => { if (alive) { setItems([]); setLoadError(e instanceof Error ? e.message : String(e)); } });
    return () => { alive = false; };
  }, [companyId, refreshKey]);

  const replace = (next: NdaRequestItem) => setItems((list) => (list ?? []).map((i) => (i.id === next.id ? next : i)));

  async function act(item: NdaRequestItem, action: "resend" | "void") {
    if (action === "void" && !window.confirm(`Cancel the NDA request to ${item.recipientEmail}? The signing link stops working.`)) return;
    setBusyId(item.id); setNotice(null);
    try {
      const res = await fetch("/api/nda/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action }) });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      replace(json as NdaRequestItem);
      setNotice({ tone: "success", text: action === "resend" ? `Sent a new 14-day link to ${item.recipientEmail}.` : "Request cancelled." });
    } catch (e) {
      setNotice({ tone: "warning", text: e instanceof Error ? e.message : String(e) });
    } finally { setBusyId(""); }
  }

  async function countersign(item: NdaRequestItem) {
    if (!window.confirm(`Sign for ${COMPANY.name || "your organisation"} (your configured authorised signer) and complete the NDA with ${item.fields.partyBName}?\n\nThe executed copy is saved to Library → Engineering → NDA and emailed to ${item.recipientEmail}.`)) return;
    setBusyId(item.id); setNotice(null);
    try {
      const res = await fetch("/api/nda/requests/countersign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      replace(json.request as NdaRequestItem);
      onCompleted?.(json.request as NdaRequestItem, json.docId as string);
      setNotice(json.emailError
        ? { tone: "warning", text: `NDA executed and saved to Library, but the email failed: ${json.emailError} Download the PDF and send it manually.` }
        : { tone: "success", text: `NDA executed. Saved to Library and emailed to ${item.recipientEmail}.` });
    } catch (e) {
      setNotice({ tone: "warning", text: e instanceof Error ? e.message : String(e) });
    } finally { setBusyId(""); }
  }

  if (items === null) return <div style={{ padding: 16, display: "grid", placeItems: "center" }}><Spinner size="sm" /></div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      {loadError && <Alert tone="warning" title="Couldn’t load NDA requests">{loadError}</Alert>}
      {!loadError && items.length === 0 && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "6px 0" }}>{emptyText}</div>}
      {items.map((item) => {
        const st = STATUS[item.status] ?? STATUS.sent;
        const busy = busyId === item.id;
        const canResend = ["sent", "viewed", "expired", "failed"].includes(item.status);
        const canVoid = !["completed", "voided", "declined"].includes(item.status);
        return (
          <div key={item.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", display: "grid", gap: 8, background: "var(--surface-raised, #fff)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{item.fields.partyBName}</span>
              <Badge size="sm" tone="neutral" variant="outline">{item.kind === "individual" ? "Individual" : "Company"}</Badge>
              <Badge size="sm" tone={st.tone} dot>{st.label}</Badge>
              <span style={{ marginLeft: "auto", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                {item.recipientName} · {item.recipientEmail}
              </span>
            </div>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
              {item.sentAt && <span>Sent {day(item.sentAt)} by {item.sentByName}</span>}
              {item.viewedAt && <span>Opened {day(item.viewedAt)}</span>}
              {item.signedAt && <span>Signed by {item.signerName}{item.signerTitle ? `, ${item.signerTitle}` : ""} on {day(item.signedAt)}</span>}
              {item.countersignedAt && <span>Workspace signed {day(item.countersignedAt)}</span>}
              {(item.status === "sent" || item.status === "viewed") && item.expiresAt && <span>Link valid until {day(item.expiresAt)}</span>}
            </div>
            {item.status === "declined" && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-danger, #b42318)" }}>Declined {day(item.declinedAt)}{item.declineReason ? `: “${item.declineReason}”` : " (no reason given)"}</div>
            )}
            {item.status === "failed" && item.error && <div style={{ fontSize: "var(--text-xs)", color: "var(--color-danger, #b42318)" }}>{item.error}</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {item.status === "signed" && canCountersign && (
                <Button variant="primary" size="sm" leftIcon={<PenLine size={13} />} loading={busy} onClick={() => void countersign(item)}>Sign for Workspace &amp; complete</Button>
              )}
              {item.status === "signed" && !canCountersign && (
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", alignSelf: "center" }}>Waiting for someone with countersign access to sign for Workspace.</span>
              )}
              <Button variant="ghost" size="sm" leftIcon={<FileText size={13} />}
                onClick={() => window.open(`/api/nda/requests/pdf?id=${item.id}`, "_blank", "noopener")}>
                {item.status === "completed" ? "Executed PDF" : "View PDF"}
              </Button>
              {canResend && <Button variant="ghost" size="sm" leftIcon={<RotateCw size={13} />} disabled={busy} onClick={() => void act(item, "resend")}>Resend link</Button>}
              {canVoid && <Button variant="ghost" size="sm" leftIcon={<XCircle size={13} />} disabled={busy} onClick={() => void act(item, "void")}>Cancel</Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
