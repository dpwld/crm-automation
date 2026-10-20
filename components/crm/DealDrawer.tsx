"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Link2, Package, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { DealKpiFields } from "@/components/kpi/DealKpiFields";
import { Drawer } from "@/components/ds/feedback/Drawer";
import { Modal } from "@/components/ds/feedback/Modal";
import { Badge } from "@/components/ds/core/Badge";
import { Button } from "@/components/ds/core/Button";
import { Spinner } from "@/components/ds/core/Spinner";
import { Select } from "@/components/ds/forms/Select";
import { Textarea } from "@/components/ds/forms/Textarea";
import { memberName } from "@/lib/mock/team";
import { PartBuilderModal } from "@/components/engineering/PartBuilderModal";
import { fetchRegistryParts, type RegistryPart } from "@/lib/data/registry";
import {
  DEAL_KIND_LABEL, DEAL_STATUS_LABEL, DEAL_STATUS_ORDER, INHOUSE_STATUS,
  deleteDeal, fetchDealDetail, linkDealPart, unlinkDealPart, updateDeal,
  type DealDetail, type DealStatus, type DealSummary,
} from "@/lib/data/deals";



const ROLE_PRESETS = ["", "sample", "mini", "mid", "full"];

function money(n: number | null, currency: string): string {
  return n == null ? "N/A" : `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: currency === "KRW" || currency === "JPY" ? 0 : 2, maximumFractionDigits: currency === "KRW" || currency === "JPY" ? 0 : 2 })}`;
}

export function DealDrawer({
  deal,
  onClose,
  onChanged,
  onDeleted,
  companyName,
}: {
  deal: DealSummary | null;
  onClose: () => void;
  
  onChanged: () => void;
  
  onDeleted?: () => void;
  companyName?: string;
}) {
  return (
    <Drawer open={deal !== null} onClose={onClose} width={520} scrim
      title={deal ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{deal.dealNo}</span>
          <Badge tone="info" size="sm">{DEAL_KIND_LABEL[deal.kind]}</Badge>
          <Badge tone="neutral" size="sm">{DEAL_STATUS_LABEL[deal.status]}</Badge>
        </span>
      ) : null}>
      {}
      {deal && <DealDrawerBody key={deal.id} deal={deal} onChanged={onChanged} onDeleted={onDeleted} companyName={companyName} />}
    </Drawer>
  );
}

function DealDrawerBody({ deal, onChanged, onDeleted, companyName }: { deal: DealSummary; onChanged: () => void; onDeleted?: () => void; companyName?: string }) {
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [registry, setRegistry] = useState<RegistryPart[]>([]);
  const [linkPartId, setLinkPartId] = useState("");
  const [linkRole, setLinkRole] = useState("");
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [notes, setNotes] = useState(deal.notes);
  const [savedNotes, setSavedNotes] = useState(deal.notes);
  const [status, setStatus] = useState(deal.status);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchDealDetail(deal.id), fetchRegistryParts()])
      .then(([d, r]) => { if (!alive) return; setDetail(d); setRegistry(r); setLoadError(null); })
      .catch((err) => { console.error("deal detail load failed:", err); if (alive) setLoadError("Could not load deal details."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [deal.id, retry]);

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    setRetry((n) => n + 1);
  }

  async function reload() {
    onChanged();
    try {
      setDetail(await fetchDealDetail(deal.id));
      setLoadError(null);
    } catch (err) {
      console.error("deal refresh failed:", err);
      setLoadError("Changes were saved, but deal details could not refresh.");
    }
  }

  async function act(action: () => Promise<void>, message: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      console.error(message, err);
      setActionError(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function addPart() {
    if (!linkPartId) return;
    await act(async () => {
      await linkDealPart(deal.id, linkPartId, linkRole);
      setLinkPartId("");
      setLinkRole("");
      await reload();
    }, "Could not link the part. Please try again.");
  }

  
  async function onPartBuilt(part: RegistryPart) {
    if (busyRef.current) throw new Error("Another change is being saved. Please retry.");
    busyRef.current = true;
    setBusy(true);
    setRegistry((list) => [part, ...list.filter((p) => p.id !== part.id)]);
    try {
      await linkDealPart(deal.id, part.id, linkRole);
      setLinkRole("");
      await reload();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function removePart(partId: string) {
    await act(async () => {
      await unlinkDealPart(deal.id, partId);
      await reload();
    }, "Could not unlink the part. Please try again.");
  }

  async function saveNotes() {
    if (notes === savedNotes) return;
    await act(async () => {
      await updateDeal(deal.id, { notes });
      setSavedNotes(notes);
      onChanged();
    }, "Could not save notes. Your edits are retained; please try again.");
  }

  async function changeStatus(next: DealStatus) {
    await act(async () => {
      await updateDeal(deal.id, { status: next });
      setStatus(next);
      onChanged();
    }, "Could not change deal status. Please try again.");
  }

  async function removeDeal() {
    await act(async () => {
      await deleteDeal(deal.id);
      setConfirmDel(false);
      onDeleted?.();
    }, "Could not delete the deal. Please try again.");
  }

  const linkedIds = new Set(detail?.parts.map((p) => p.partId) ?? []);
  const linkable = registry.filter((p) => !linkedIds.has(p.id));

  const secTitle = (icon: React.ReactNode, text: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-subtle)", margin: "16px 0 8px" }}>
      {icon} {text}
    </div>
  );

  return (
    (
        <div style={{ padding: "4px 2px 24px" }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-strong)" }}>{deal.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <Select size="sm" value={status} disabled={busy || loading} aria-label="Deal status" style={{ width: 170 }}
              options={(deal.kind === "inhouse" ? INHOUSE_STATUS : DEAL_STATUS_ORDER).map((s) => ({ value: s, label: DEAL_STATUS_LABEL[s] }))}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => void changeStatus(e.target.value as DealStatus)} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Owner: {deal.ownerKey ? memberName(deal.ownerKey) : "Unassigned"}
            </span>
            <span style={{ flex: 1 }} />
            {}
            {status === "nda" && (
              <Button variant="soft" size="sm" disabled title="Manage signature requests in the company NDA step">
                Use company NDA step
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy || loading} iconOnly aria-label="Delete deal" onClick={() => { setActionError(null); setConfirmDel(true); }}>
              <Trash2 size={14} />
            </Button>
          </div>

          {actionError && <div role="alert" style={{ marginTop: 12, fontSize: "var(--text-sm)", color: "var(--color-danger, #dc2626)" }}>{actionError}</div>}
          {loadError && (
            <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: "var(--text-sm)", color: "var(--color-danger, #dc2626)" }}>
              <span>{loadError}</span>
              <Button size="sm" variant="secondary" disabled={busy} loading={loading} onClick={retryLoad}>Retry loading</Button>
            </div>
          )}
          {!detail && loading ? (
            <div style={{ display: "grid", placeItems: "center", padding: 40 }}><Spinner /></div>
          ) : detail ? (
            <>
              {deal.kind !== "inhouse" && <DealKpiFields dealId={deal.id} />}
              {}
              {secTitle(<Package size={12} />, `Parts · ${detail.parts.length}`)}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {detail.parts.map((p) => (
                  <div key={p.partId} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "7px 10px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "var(--text-sm)" }}>{p.partCode}</span>
                    {p.role && <Badge tone="neutral" size="sm">{p.role}</Badge>}
                    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.internalLabel}</span>
                    <span style={{ flex: 1 }} />
                    <Button variant="ghost" size="sm" disabled={busy || loading} iconOnly aria-label={`Unlink ${p.partCode}`} onClick={() => void removePart(p.partId)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
                {detail.parts.length === 0 && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>No parts linked yet.</span>
                )}
                <div style={{ marginTop: 6 }}>
                  <Button size="sm" variant="secondary" leftIcon={<Plus size={13} />} disabled={busy || loading}
                    title="Assign a new part code and link it to this deal"
                    onClick={() => setBuilding(true)}>
                    New part
                  </Button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4, padding: 10, borderRadius: 8, background: "var(--surface-sunken)" }}>
                  <span style={{ width: "100%", fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>Link an existing part</span>
                  <Select size="sm" disabled={busy || loading} value={linkPartId} style={{ flex: "1 1 180px", minWidth: 0 }} aria-label="Part to link"
                    options={[{ value: "", label: linkable.length ? "Link a part…" : "No parts left (Registry)" },
                      ...linkable.map((p) => ({ value: p.id, label: `${p.partCode} · ${p.internalLabel || p.customer}`.slice(0, 52) }))]}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLinkPartId(e.target.value)} />
                  <Select size="sm" disabled={busy || loading} value={linkRole} style={{ width: 96 }} aria-label="Part role"
                    options={ROLE_PRESETS.map((r) => ({ value: r, label: r || "role…" }))}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLinkRole(e.target.value)} />
                  <Button size="sm" leftIcon={<Link2 size={13} />} disabled={!linkPartId || busy || loading} onClick={() => void addPart()}>
                    Link
                  </Button>
                </div>
              </div>

              {}
              {secTitle(<ShoppingCart size={12} />, `Vendor POs · ${detail.pos.length}`)}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Button size="sm" variant="secondary" disabled title="Separate procurement service is not connected">Procurement not connected</Button>
                {detail.pos.map((p) => (
                  <div key={p.id} aria-label={`Open purchase order ${p.poNo ?? "draft"}`} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "7px 10px", fontSize: "var(--text-sm)", color: "inherit", textDecoration: "none" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{p.poNo ?? "(draft)"}</span>
                    <Badge tone={p.status === "accepted" ? "success" : p.status === "issued" ? "info" : "neutral"} size="sm">{p.status}</Badge>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{money(p.total, p.currency)}</span>
                  </div>
                ))}
                {detail.pos.length === 0 && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>No linked vendor purchase orders. Separate procurement service is not connected.</span>
                )}
              </div>

              {}
              {secTitle(<FileText size={12} />, `Customer documents · ${detail.docs.length}`)}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {detail.docs.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "7px 10px", fontSize: "var(--text-sm)" }}>
                    <Badge tone="neutral" size="sm">{d.docType === "purchase_order" ? "customer PO" : d.docType}</Badge>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{d.docNo ?? "(draft)"}</span>
                    <Badge tone={d.status === "accepted" ? "success" : d.status === "issued" ? "info" : "neutral"} size="sm">{d.status}</Badge>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{money(d.total, d.currency)}</span>
                  </div>
                ))}
                {detail.docs.length === 0 && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>None · link from the CRM document editor (Deal select).</span>
                )}
              </div>

              {}
              {secTitle(null, "Notes")}
              <Textarea rows={3} disabled={busy || loading} value={notes} placeholder="Deal notes…"
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                onBlur={() => void saveNotes()} />
              {notes !== savedNotes && <Button size="sm" variant="secondary" disabled={busy || loading} onClick={() => void saveNotes()} style={{ marginTop: 6 }}>Save notes</Button>}

              {building && <PartBuilderModal open onClose={() => setBuilding(false)} onCreated={onPartBuilt} defaultCustomer={companyName} />}

              <Modal open={confirmDel} onClose={() => { if (!busyRef.current) setConfirmDel(false); }} size="sm" title={`Delete ${deal.dealNo}`}
                footer={
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <Button variant="ghost" disabled={busy} onClick={() => setConfirmDel(false)}>Cancel</Button>
                    <Button variant="danger" loading={busy} onClick={() => void removeDeal()}>Delete</Button>
                  </div>
                }>
                Links from documents and parts to this deal are cleared (the documents themselves are kept). This can’t be undone.
                {actionError && <div role="alert" style={{ marginTop: 10, color: "var(--color-danger, #dc2626)" }}>{actionError}</div>}
              </Modal>
            </>
          ) : null}
        </div>
    )
  );
}
