"use client";

import { useState } from "react";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { Textarea } from "@/components/ds/forms/Textarea";

export interface PendingEdit {
  
  label: string;
  from: string;
  to: string;
}


export function ReasonModal({
  open,
  edits,
  isApprover,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  edits: PendingEdit[];
  isApprover: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    onSubmit(reason.trim());
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title="Request change approval"
      subtitle={isApprover ? "You're an approver. This applies immediately and is recorded." : "An approver has to accept this change before it applies."}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button loading={submitting} disabled={!reason.trim()} onClick={submit}>
            {isApprover ? "Apply & record" : "Submit for approval"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {edits.map((e, i) => (
            <div key={i} style={{ fontSize: "var(--text-sm)", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{e.label}</span>
              <span style={{ textDecoration: "line-through", color: "var(--text-subtle)" }}>{e.from || "N/A"}</span>
              <span style={{ color: "var(--text-muted)" }}>→</span>
              <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{e.to || "N/A"}</span>
            </div>
          ))}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Reason (required)</span>
          <Textarea
            rows={3}
            autoFocus
            placeholder="Why is this change needed? e.g. Customer relaxed the requirement in the July call."
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
