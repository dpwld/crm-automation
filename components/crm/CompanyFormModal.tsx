"use client";

import { useState } from "react";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Textarea } from "@/components/ds/forms/Textarea";
import type { Company, Importance, Stage } from "@/types/domain";
import { STAGE_ORDER, STAGE_LABEL } from "@/lib/mock/companies";
import { CRM_OWNERS, TEAM } from "@/lib/mock/team";
import { IMPORTANCE_LABEL } from "./crmFormat";

export const SECTORS = ["Data center", "EV", "Aerospace"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

export function CompanyFormModal({
  open,
  mode,
  initial,
  onSubmit,
  onCancel,
  sectors = SECTORS,
  saving = false,
  error,
}: {
  open: boolean;
  saving?: boolean;
  error?: string | null;
  mode: "create" | "edit";
  initial: Company;
  onSubmit: (company: Company) => void;
  onCancel: () => void;
  
  sectors?: string[];
}) {
  const [c, setC] = useState<Company>(initial);
  function set(p: Partial<Company>) {
    setC((prev) => ({ ...prev, ...p }));
  }

  const stageOptions = STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABEL[s] }));
  const ownerOptions = CRM_OWNERS.map((id) => ({ value: id, label: TEAM[id].fullName }));
  const importanceOptions = (["high", "med", "low"] as Importance[]).map((i) => ({ value: i, label: IMPORTANCE_LABEL[i] }));
  // Include the company's current sector even if restricted, so an edit form
  // never silently drops a value the user isn't allowed to newly assign.
  const sectorList = c.sector && !sectors.includes(c.sector) ? [...sectors, c.sector] : sectors;
  const sectorOptions = sectorList.map((s) => ({ value: s, label: s }));

  return (
    <Modal
      open={open}
      onClose={saving ? null : onCancel}
      closeOnBackdrop={false}
      size="md"
      title={mode === "create" ? "New company" : "Edit company"}
      subtitle={mode === "create" ? "Add a company to the pipeline manually." : c.ref}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => onSubmit(c)} disabled={!c.name.trim()}>
            {mode === "create" ? "Add company" : "Save changes"}
          </Button>
        </>
      }
    >
      {error && <p role="alert" style={{ color: "var(--color-danger)", margin: "0 0 12px" }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Company">
            <Input value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Tesla" autoFocus />
          </Field>
        </div>
        <Field label="Sector">
          <Select options={sectorOptions} value={c.sector} onChange={(e) => set({ sector: e.target.value })} />
        </Field>
        <Field label="Stage">
          <Select options={stageOptions} value={c.stage} onChange={(e) => set({ stage: e.target.value as Stage })} />
        </Field>
        <Field label="Owner">
          <Select options={ownerOptions} value={c.ownerId} onChange={(e) => set({ ownerId: e.target.value })} />
        </Field>
        <Field label="Priority">
          <Select options={importanceOptions} value={c.importance} onChange={(e) => set({ importance: e.target.value as Importance })} />
        </Field>
        {}
        <Field label="Customer code (3 letters)">
          <Input mono maxLength={3} value={c.partyCode ?? ""} placeholder="ACC"
            error={!!c.partyCode && !/^[A-Z]{3}$/.test(c.partyCode)}
            onChange={(e) => set({ partyCode: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) })} />
        </Field>
        <Field label="Contact">
          <Input value={c.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="email or name" />
        </Field>
        <Field label="Value (USD)">
          <Input mono value={c.value == null ? "" : String(c.value)}
            onChange={(e) => set({ value: e.target.value.trim() === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")) })}
            placeholder="N/A" />
        </Field>
        {}
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Address">
            <Textarea rows={3} value={c.address ?? ""} placeholder={"Address line 1\nCity, Country"}
              onChange={(e) => set({ address: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
