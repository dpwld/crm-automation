"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Modal } from "@/components/ds/feedback/Modal";
import { Spinner } from "@/components/ds/core/Spinner";
import { Input } from "@/components/ds/forms/Input";
import { Textarea } from "@/components/ds/forms/Textarea";
import { deactivateCatalogItem, fetchCatalog, insertCatalogItem, updateCatalogItem } from "@/lib/data/catalog";
import type { CatalogItem } from "@/types/domain";
import { DL } from "@/lib/formOptions";



interface DraftRow {
  name: string;
  modelCode: string;
  unit: string;
  
  unitPrice: string;
  currency: string;
}

const rowToDraft = (c: CatalogItem): DraftRow => ({
  name: c.name,
  modelCode: c.modelCode,
  unit: c.unit,
  unitPrice: String(c.unitPrice),
  currency: c.currency,
});

const emptyDraft = (): DraftRow => ({ name: "", modelCode: "", unit: "pcs", unitPrice: "0", currency: "USD" });


function normalizeDraft(d: DraftRow) {
  return {
    name: d.name.trim(),
    modelCode: d.modelCode.trim(),
    unit: d.unit.trim() || "pcs",
    unitPrice: Number(d.unitPrice.replace(/[^0-9.]/g, "")) || 0,
    currency: d.currency.trim().toUpperCase().slice(0, 3) || "USD",
  };
}

export function CatalogManagerModal({
  open,
  onClose,
  items,
  onItemsChange,
}: {
  open: boolean;
  onClose: () => void;
  
  items: CatalogItem[] | null;
  onItemsChange: (items: CatalogItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 행별 편집 드래프트 — blur에서 저장하고 비운다 (없는 행은 저장값 그대로 표시).
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [adding, setAdding] = useState<DraftRow | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  // 삭제 확인 — Trash 클릭 시 해당 행만 Delete?/Cancel로 바뀐다.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // 열릴 때 캐시가 비어 있으면 로드 — 픽커가 나중에 열려도 같은 목록을 본다.
  useEffect(() => {
    if (!open || items !== null) return;
    fetchCatalog()
      .then(onItemsChange)
      .catch(() => setError("Failed to load the catalog. Check that the 2026-08-06b SQL has been applied."));
  }, [open, items, onItemsChange]);

  const draftOf = (c: CatalogItem): DraftRow => drafts[c.id] ?? rowToDraft(c);

  function setDraft(c: CatalogItem, patch: Partial<DraftRow>) {
    setDrafts((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] ?? rowToDraft(c)), ...patch } }));
  }

  
  async function commitRow(c: CatalogItem) {
    const d = drafts[c.id];
    if (!d) return;
    setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== c.id)));
    const next = normalizeDraft(d);
    if (!next.name) {
      setError("Item name can't be empty. The change was not saved.");
      return;
    }
    const changed =
      next.name !== c.name || next.modelCode !== c.modelCode || next.unit !== c.unit ||
      next.unitPrice !== c.unitPrice || next.currency !== c.currency;
    if (!changed) return;
    try {
      await updateCatalogItem(c.id, next);
      onItemsChange((items ?? []).map((x) => (x.id === c.id ? { ...x, ...next } : x)));
      setError(null);
    } catch (err) {
      console.error("catalog update failed:", err);
      setError("Failed to save the change.");
    }
  }

  async function saveNew() {
    if (!adding) return;
    const next = normalizeDraft(adding);
    if (!next.name) {
      setError("Item name is required.");
      return;
    }
    setAddBusy(true);
    try {
      const item = await insertCatalogItem(next);
      onItemsChange([...(items ?? []), item]);
      setAdding(null);
      setError(null);
    } catch (err) {
      console.error("catalog insert failed:", err);
      setError("Failed to add the item. Check that the 2026-08-06b SQL has been applied.");
    } finally {
      setAddBusy(false);
    }
  }

  async function remove(c: CatalogItem) {
    try {
      await deactivateCatalogItem(c.id);
      onItemsChange((items ?? []).filter((x) => x.id !== c.id));
      setConfirmId(null);
      setError(null);
    } catch (err) {
      console.error("catalog delete failed:", err);
      setError("Failed to delete the item.");
    }
  }

  const filtered = (items ?? []).filter(
    (c) => !query.trim() || `${c.modelCode} ${c.name}`.toLowerCase().includes(query.toLowerCase()),
  );

  const cell: React.CSSProperties = { padding: "4px 6px", borderBottom: "1px solid var(--border-subtle)", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)", borderBottom: "1px solid var(--border-strong)", textAlign: "left" };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage catalog"
      subtitle="Edits save when you leave a field. The quotation picker reflects changes immediately."
      size="lg"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <span style={{ fontSize: "var(--text-xs)", color: "var(--red-600, #dc2626)" }}>{error}</span>}
        <div style={{ display: "flex", gap: 8 }}>
          <Input size="sm" style={{ flex: 1 }} value={query} placeholder="Search by name or model code…"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} />
          <Button size="sm" leftIcon={<Plus size={13} />} disabled={adding !== null} onClick={() => setAdding(emptyDraft())}>
            Add item
          </Button>
        </div>

        {items === null ? (
          <div style={{ display: "grid", placeItems: "center", padding: 24 }}><Spinner /></div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr>
                  <th style={{ ...head, width: "40%" }}>Item</th>
                  <th style={{ ...head, width: 140 }}>Model code</th>
                  <th style={{ ...head, width: 70 }}>Unit</th>
                  <th style={{ ...head, width: 110 }}>Unit price</th>
                  <th style={{ ...head, width: 70 }}>Currency</th>
                  <th style={{ ...head, width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {adding && (
                  <tr>
                    <td style={cell}>
                      <Textarea rows={2} style={{ width: "100%" }} value={adding.name} placeholder="Description"
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAdding({ ...adding, name: e.target.value })} />
                    </td>
                    <td style={cell}>
                      <Input size="sm" mono style={{ width: "100%" }} value={adding.modelCode} placeholder="e.g. DOC-26-001"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdding({ ...adding, modelCode: e.target.value })} />
                    </td>
                    <td style={cell}>
                      <Input size="sm" list={DL.unit} style={{ width: "100%" }} value={adding.unit}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdding({ ...adding, unit: e.target.value })} />
                    </td>
                    <td style={cell}>
                      <Input size="sm" mono style={{ width: "100%" }} value={adding.unitPrice}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdding({ ...adding, unitPrice: e.target.value.replace(/[^0-9.]/g, "") })} />
                    </td>
                    <td style={cell}>
                      <Input size="sm" style={{ width: "100%" }} list={DL.currency} value={adding.currency}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdding({ ...adding, currency: e.target.value.toUpperCase().slice(0, 3) })} />
                    </td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      <Button size="sm" loading={addBusy} disabled={!adding.name.trim()} onClick={() => void saveNew()}>Save</Button>{" "}
                      <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>Cancel</Button>
                    </td>
                  </tr>
                )}
                {filtered.map((c) => {
                  const d = draftOf(c);
                  return (
                    <tr key={c.id}>
                      <td style={cell}>
                        <Textarea style={{ width: "100%" }} rows={Math.min(4, Math.max(1, d.name.split("\n").length))} value={d.name}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(c, { name: e.target.value })}
                          onBlur={() => void commitRow(c)} />
                      </td>
                      <td style={cell}>
                        <Input size="sm" mono style={{ width: "100%" }} value={d.modelCode}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(c, { modelCode: e.target.value })}
                          onBlur={() => void commitRow(c)} />
                      </td>
                      <td style={cell}>
                        <Input size="sm" list={DL.unit} style={{ width: "100%" }} value={d.unit}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(c, { unit: e.target.value })}
                          onBlur={() => void commitRow(c)} />
                      </td>
                      <td style={cell}>
                        <Input size="sm" mono style={{ width: "100%" }} value={d.unitPrice}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(c, { unitPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                          onBlur={() => void commitRow(c)} />
                      </td>
                      <td style={cell}>
                        <Input size="sm" style={{ width: "100%" }} list={DL.currency} value={d.currency}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(c, { currency: e.target.value.toUpperCase().slice(0, 3) })}
                          onBlur={() => void commitRow(c)} />
                      </td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {confirmId === c.id ? (
                          <>
                            <Button variant="danger" size="sm" onClick={() => void remove(c)}>Delete?</Button>{" "}
                            <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>Cancel</Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="sm" iconOnly aria-label="Delete item"
                            title="Delete this item. Existing quotations keep their lines"
                            onClick={() => setConfirmId(c.id)}>
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && !adding && (
                  <tr>
                    <td colSpan={6} style={{ padding: 16, fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>
                      {query.trim() ? "No items match the search." : "The catalog is empty. Press Add item to create the first entry."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
