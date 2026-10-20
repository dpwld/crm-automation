"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ds/core/Button";
import { Modal } from "@/components/ds/feedback/Modal";
import { Input } from "@/components/ds/forms/Input";

import { FormField } from "@/components/ds/forms/FormField";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import {insertRegistryPart,type NewRegistryPart,type RegistryPart} from '@/lib/data/registry';
const emptyForm=(customer=''):NewRegistryPart=>({customer,internalLabel:'',descriptor:'',notes:''});

export function PartBuilderModal({
  open,
  onClose,
  onCreated,
  defaultCustomer = "",
}: {
  open: boolean;
  onClose: () => void;
  
  onCreated: (part: RegistryPart) => Promise<void> | void;
  defaultCustomer?: string;
}) {
  const me = useCurrentUser();
  const [form, setForm] = useState<NewRegistryPart>(() => emptyForm(defaultCustomer));
  const [createdPart, setCreatedPart] = useState<RegistryPart | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (savingRef.current) return;
    setForm(emptyForm(defaultCustomer));
    setCreatedPart(null);
    setError(null);
    onClose();
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    let saved = createdPart;
    try {
      if (!saved) {
        saved = await insertRegistryPart(form, me.id);
        setCreatedPart(saved);
      }
      await onCreated(saved);
      savingRef.current = false;
      close();
    } catch (err) {
      console.error("registry insert failed:", err);
      setError(saved ? `${saved.partCode} was registered, but could not be linked. Retry linking or close and link it from the existing parts list.` : "Failed to register the part. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const preview = form.descriptor;

  return (
    <Modal open={open} onClose={close} title="New part · code builder" size="md"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" disabled={saving} onClick={close}>{createdPart ? "Close" : "Cancel"}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>{createdPart ? "Retry linking part" : "Register and link part"}</Button>
        </div>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <span role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--color-danger, #dc2626)" }}>{error}</span>}
        <fieldset disabled={saving || createdPart !== null} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FormField label="Customer"><Input value={form.customer} onChange={e=>setForm({...form,customer:e.target.value})}/></FormField>
          <FormField label="Internal label"><Input value={form.internalLabel} onChange={e=>setForm({...form,internalLabel:e.target.value})}/></FormField>
          <FormField label="Description"><Input value={form.descriptor} onChange={e=>setForm({...form,descriptor:e.target.value})}/></FormField>
        </div>
        <FormField label="Notes">
          <Input value={form.notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, notes: e.target.value })} />
        </FormField>
        </fieldset>
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 18, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>External code</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{createdPart ? createdPart.partCode : <>DOC-{String(new Date().getFullYear()).slice(-2)}-<span style={{ color: "var(--text-subtle)" }}>next serial</span></>}</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>Internal descriptor (never sent)</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{preview}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
