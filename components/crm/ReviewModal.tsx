"use client";

import { useMemo, useState } from "react";
import { FileText, ImageIcon, FileSpreadsheet, X } from "lucide-react";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Badge } from "@/components/ds/core/Badge";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import type { Company, Importance, Stage } from "@/types/domain";
import type { SpecSheetSection, SpecSheetRow } from "@/components/ds/sheets/SpecSheet";
import { STAGE_ORDER, STAGE_LABEL } from "@/lib/mock/companies";
import { CRM_OWNERS, TEAM } from "@/lib/mock/team";
import { IMPORTANCE_LABEL, formatValue } from "./crmFormat";
import type { IntakeDraft, IntakeInput } from "@/lib/ai/intake";

const SECTORS = ["Data center", "EV", "Aerospace"];

function fileIcon(name: string) {
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return <ImageIcon size={16} />;
  if (/\.(xlsx?|csv)$/i.test(name)) return <FileSpreadsheet size={16} />;
  return <FileText size={16} />;
}

function SourcePreview({ source }: { source: IntakeInput }) {
  const urls = useMemo(
    () => (source.files ?? []).map((f) => (/\.(png|jpe?g|gif|webp|svg)$/i.test(f.name) ? URL.createObjectURL(f) : null)),
    [source.files],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: 8 }}>
        Uploaded source
      </div>
      <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", padding: 14 }}>
        {source.text ? (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-default)", lineHeight: "var(--leading-normal)" }}>
            {source.text}
          </pre>
        ) : source.files?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {source.files.map((f, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", color: "var(--text-default)" }}>
                  {fileIcon(f.name)}
                  <span style={{ fontWeight: 500, color: "var(--text-strong)" }}>{f.name}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                {urls[i] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[i]!} alt={f.name} style={{ maxWidth: "100%", maxHeight: 260, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", objectFit: "contain" }} />
                )}
                {!urls[i] && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
                    Document preview unavailable · verify the extracted values on the right against the original file.
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-subtle)", fontSize: "var(--text-sm)" }}>No source.</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

const stageOptions = STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABEL[s] }));
const ownerOptions = CRM_OWNERS.map((id) => ({ value: id, label: TEAM[id].fullName }));
const importanceOptions = (["high", "med", "low"] as Importance[]).map((i) => ({ value: i, label: IMPORTANCE_LABEL[i] }));
const sectorOptions = SECTORS.map((s) => ({ value: s, label: s }));


function currentSpecValue(sections: SpecSheetSection[] | undefined, parameter: string, side: "hot" | "cold" | "merged"): string | null {
  if (!sections) return null;
  const target = parameter.trim().toLowerCase();
  for (const sec of sections) {
    for (const r of sec.rows as SpecSheetRow[]) {
      const p = String(r.param ?? "").toLowerCase();
      if (p === target || p.includes(target) || target.includes(p)) {
        if (r.merged) return String(r.value ?? "");
        return String((side === "cold" ? r.cold : r.hot) ?? "");
      }
    }
  }
  return null;
}

function metaLabel(field: string, v: unknown): string {
  if (field === "stage") return STAGE_LABEL[v as Stage] ?? String(v);
  if (field === "importance") return IMPORTANCE_LABEL[v as Importance] ?? String(v);
  if (field === "value") return formatValue((v as number) ?? null);
  return String(v ?? "N/A");
}

export function ReviewModal({
  open,
  source,
  drafts,
  companies,
  specsFor,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  source: IntakeInput;
  drafts: IntakeDraft[];
  companies: Company[];
  specsFor: (companyId: string) => SpecSheetSection[] | undefined;
  onConfirm: (edited: IntakeDraft[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<IntakeDraft[]>(drafts);

  function patchCreate(i: number, p: Partial<Company>) {
    setRows((prev) => prev.map((r, idx) => (idx === i && r.kind === "create" ? { ...r, company: { ...r.company, ...p } } : r)));
  }
  function patchUpdate(i: number, p: Partial<Company>) {
    setRows((prev) => prev.map((r, idx) => (idx === i && r.kind === "update" ? { ...r, patch: { ...r.patch, ...p } } : r)));
  }
  function patchSpec(i: number, si: number, newValue: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, specChanges: r.specChanges.map((s, sj) => (sj === si ? { ...s, newValue } : s)) } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const creates = rows.filter((r) => r.kind === "create").length;
  const updates = rows.length - creates;
  const confirmLabel = [creates ? `add ${creates}` : null, updates ? `update ${updates}` : null].filter(Boolean).join(" · ") || "confirm";

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="xl"
      title="Review AI-extracted records"
      subtitle="New requests become records; revisions from existing customers become changes to that company. Fix anything wrong, then confirm."
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onConfirm(rows)} disabled={rows.length === 0}>
            Confirm · {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 20, height: "min(60vh, 560px)" }}>
        <SourcePreview source={source} />

        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: 8 }}>
            Extracted · review &amp; edit
          </div>
          <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 4 }}>
            {rows.length === 0 && (
              <EmptyState title="Nothing to apply" description="All extracted records were removed." />
            )}
            {rows.map((r, i) => (
              <div key={r.kind === "create" ? r.company.id : `${r.companyId}-${i}`} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: 14, background: "var(--surface-card)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    {r.kind === "create" ? r.company.ref : r.ref}
                  </span>
                  {r.kind === "update" && (
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>{r.name}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  {r.kind === "create" ? <Badge tone="info" dot>New record</Badge> : <Badge tone="warning" dot>Update existing</Badge>}
                  <Button variant="ghost" size="sm" iconOnly aria-label="Skip this record" onClick={() => removeRow(i)}>
                    <X size={14} />
                  </Button>
                </div>

                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 10, fontStyle: "italic" }}>
                  {r.summary}
                </div>

                {r.kind === "create" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <Field label="Company">
                        <Input size="sm" value={r.company.name} onChange={(e) => patchCreate(i, { name: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Sector">
                      <Select size="sm" options={sectorOptions} value={r.company.sector} onChange={(e) => patchCreate(i, { sector: e.target.value })} />
                    </Field>
                    <Field label="Stage">
                      <Select size="sm" options={stageOptions} value={r.company.stage} onChange={(e) => patchCreate(i, { stage: e.target.value as Stage })} />
                    </Field>
                    <Field label="Owner">
                      <Select size="sm" options={ownerOptions} value={r.company.ownerId} onChange={(e) => patchCreate(i, { ownerId: e.target.value })} />
                    </Field>
                    <Field label="Priority">
                      <Select size="sm" options={importanceOptions} value={r.company.importance} onChange={(e) => patchCreate(i, { importance: e.target.value as Importance })} />
                    </Field>
                    <Field label="Contact">
                      <Input size="sm" value={r.company.contact} onChange={(e) => patchCreate(i, { contact: e.target.value })} />
                    </Field>
                    <Field label="Value (USD)">
                      <Input size="sm" mono value={r.company.value == null ? "" : String(r.company.value)}
                        onChange={(e) => patchCreate(i, { value: e.target.value.trim() === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")) })} />
                    </Field>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {Object.keys(r.patch).length === 0 && r.specChanges.length === 0 && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
                        No field changes · confirming will only log this in the activity feed.
                      </div>
                    )}
                    {(Object.keys(r.patch) as (keyof Company)[]).map((field) => {
                      const current = companies.find((c) => c.id === r.companyId);
                      const from = metaLabel(field, current?.[field]);
                      return (
                        <div key={field} style={{ display: "grid", gridTemplateColumns: "88px 1fr auto 1fr", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "capitalize" }}>{field}</span>
                          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)", textDecoration: "line-through" }}>{from}</span>
                          <span style={{ color: "var(--text-subtle)" }}>→</span>
                          {field === "stage" ? (
                            <Select size="sm" options={stageOptions} value={r.patch.stage} onChange={(e) => patchUpdate(i, { stage: e.target.value as Stage })} />
                          ) : field === "importance" ? (
                            <Select size="sm" options={importanceOptions} value={r.patch.importance} onChange={(e) => patchUpdate(i, { importance: e.target.value as Importance })} />
                          ) : field === "value" ? (
                            <Input size="sm" mono value={r.patch.value == null ? "" : String(r.patch.value)}
                              onChange={(e) => patchUpdate(i, { value: e.target.value.trim() === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")) })} />
                          ) : (
                            <Input size="sm" value={String(r.patch[field] ?? "")} onChange={(e) => patchUpdate(i, { [field]: e.target.value } as Partial<Company>)} />
                          )}
                        </div>
                      );
                    })}
                    {r.specChanges.map((s, si) => {
                      const from = currentSpecValue(specsFor(r.companyId), s.parameter, s.side);
                      return (
                        <div key={si} style={{ display: "grid", gridTemplateColumns: "88px 1fr auto 1fr", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Spec</span>
                          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-default)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.parameter}{s.side !== "merged" ? ` (${s.side})` : ""}
                            {from != null && <span style={{ color: "var(--text-subtle)", textDecoration: "line-through", marginLeft: 6 }}>{from}</span>}
                          </span>
                          <span style={{ color: "var(--text-subtle)" }}>→</span>
                          <Input size="sm" mono value={s.newValue} onChange={(e) => patchSpec(i, si, e.target.value)} />
                        </div>
                      );
                    })}
                    {r.note && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                        Will be posted as a comment: “{r.note}”
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
