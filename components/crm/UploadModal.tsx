"use client";

import { useRef, useState } from "react";
import { FileUp, Sparkles, Upload } from "lucide-react";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { ProgressBar } from "@/components/ds/feedback/ProgressBar";
import type { IntakeInput } from "@/lib/ai/intake";

// AI intake reads PDFs and images directly; Excel/Word aren't supported yet
// (processUpload rejects them with a hint to convert or paste the text).
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";


export function UploadModal({
  open,
  busy,
  onIntake,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  onIntake: (input: IntakeInput) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function submitText() {
    if (!text.trim() || busy) return;
    onIntake({ text: text.trim() });
    setText("");
  }

  function onFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    onIntake({ files: Array.from(files) });
  }

  return (
    <Modal
      open={open}
      onClose={busy ? null : onClose}
      size="md"
      title="Upload to CRM"
      subtitle="AI reads it and proposes new records or updates. You review before anything applies."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input
              value={text}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && !e.nativeEvent.isComposing && submitText()}
              placeholder="Paste a requirement, email, or company note…"
              icon={<Sparkles size={16} />}
              disabled={busy}
            />
          </div>
          <Button variant="primary" onClick={submitText} disabled={busy || !text.trim()}>
            Add
          </Button>
        </div>

        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
          style={{
            height: 120,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            border: `1.5px dashed ${dragging ? "var(--color-primary)" : "var(--border-strong)"}`,
            borderRadius: "var(--radius-md)",
            background: dragging ? "var(--color-primary-soft)" : "var(--surface-sunken)",
            color: "var(--text-muted)",
            fontSize: "var(--text-sm)",
            cursor: busy ? "wait" : "pointer",
            transition: "border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
          }}
        >
          <FileUp size={22} />
          Drag & drop an RFQ / email (PDF, image) · or click to browse
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            disabled={busy}
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
          />
        </label>

        {busy && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <ProgressBar value={70} tone="primary" size="sm" />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Upload size={12} /> Processing with AI. The review screen opens when it&apos;s done.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
