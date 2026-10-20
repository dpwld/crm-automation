"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, PackageCheck, Plus, ShoppingCart, Trash2, Undo2 } from "lucide-react";
import { Alert } from "@/components/ds/feedback/Alert";
import { Button } from "@/components/ds/core/Button";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Spinner } from "@/components/ds/core/Spinner";
import type { Build, Company, Part, Vendor } from "@/types/domain";
import { createClient } from "@/lib/supabase/client";
import {
  deletePart, fetchParts, fetchPartsLists, insertPart, suggestExternalRef, suggestPartId, updatePart,
  type PartsLists, DEFAULT_PARTS_LISTS,
} from "@/lib/data/parts";
import { fetchVendors } from "@/lib/data/procurement";



interface DealLite { id: string; dealNo: string; title: string }

const today = () => new Date().toISOString();

export function ProcurementPanel({
  company,
  meId,
  builds,
  onLog,
}: {
  company: Company;
  meId: string;
  
  builds: Build[];
  onLog?: (summary: string) => void;
}) {
  const [parts, setParts] = useState<Part[] | null>(null);
  const [deals, setDeals] = useState<DealLite[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [lists, setLists] = useState<PartsLists>(DEFAULT_PARTS_LISTS);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // 인라인 추가 폼 (딜별)
  const [adding, setAdding] = useState<string | null>(null); // dealId 또는 "none"(미연결)
  const [form, setForm] = useState({ partId: "", externalRef: "", name: "", vendorId: "", stage: "CAD", location: "", notes: "" });

  useEffect(() => {
    let alive = true;
    fetchParts().then((ps) => { if (alive) setParts(ps); }).catch((err) => { if (alive) { setParts([]); setError(`Couldn't load parts — ${(err as { message?: string })?.message ?? ""}`); } });
    createClient().from("deals").select("id, deal_no, title").eq("company_id", company.id).order("created_at")
      .then(({ data }) => { if (alive) setDeals((data ?? []).map((r) => ({ id: r.id as string, dealNo: (r.deal_no as string) ?? "", title: (r.title as string) ?? "" }))); });
    fetchVendors().then((vs) => { if (alive) setVendors(vs); }).catch(() => {});
    fetchPartsLists().then((l) => { if (alive) setLists(l); }).catch(() => {});
    return () => { alive = false; };
  }, [company.id]);

  const pvPassedDealIds = useMemo(
    () => new Set(builds.filter((b) => b.status === "passed" && b.dealId).map((b) => b.dealId as string)),
    [builds],
  );
  const buildDealOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of builds) if (b.dealId) m[b.id] = b.dealId;
    return m;
  }, [builds]);

  
  function partsOf(dealId: string | null): Part[] {
    if (dealId === null) {
      return (parts ?? []).filter((p) => p.program === company.name && !p.dealId && !(p.buildId && buildDealOf[p.buildId]));
    }
    return (parts ?? []).filter((p) => p.dealId === dealId || (p.buildId && buildDealOf[p.buildId] === dealId));
  }

  function openAdd(dealKey: string) {
    const suggestion = suggestPartId(company.name, parts ?? []);
    setForm({ partId: suggestion, externalRef: "", name: "", vendorId: "", stage: lists.stage[0] ?? "CAD", location: "", notes: "" });
    setAdding(dealKey);
  }

  function onVendorPick(vendorId: string) {
    const v = vendors.find((x) => x.id === vendorId);
    setForm((f) => ({ ...f, vendorId, externalRef: v ? suggestExternalRef(v.code, parts ?? []) : f.externalRef }));
  }

  async function saveNew(dealId: string | null) {
    if (!form.partId.trim() || busy) return;
    setBusy("add");
    setError("");
    try {
      const saved = await insertPart({
        partId: form.partId.trim(), externalRef: form.externalRef.trim(), name: form.name.trim(),
        program: company.name, stage: form.stage, status: "In Progress",
        vendorId: form.vendorId || null, location: form.location.trim(), notes: form.notes.trim(),
        ...(dealId ? { dealId } : {}), createdByKey: meId, qty: 1,
      });
      setParts((ps) => [...(ps ?? []), saved]);
      setAdding(null);
      onLog?.(`Part ${saved.partId} registered for procurement${form.vendorId ? ` (vendor ${vendors.find((v) => v.id === form.vendorId)?.code ?? ""})` : ""}.`);
    } catch (err) {
      setError(`Couldn't save the part — ${(err as { message?: string })?.message ?? "if deal linking fails, run db/migrations/2026-09-21_eng_revamp.sql"}.`);
    } finally {
      setBusy("");
    }
  }

  async function markArrived(p: Part) {
    setBusy(`arr-${p.id}`);
    setError("");
    try {
      // 스테이지 목록에 "Inspection"이 있으면 함께 올린다 — 없으면 도착 스탬프만.
      const patch: Partial<Part> = { arrivedAt: today() };
      if (lists.stage.includes("Inspection")) patch.stage = "Inspection";
      const saved = await updatePart(p.id, patch);
      setParts((ps) => (ps ?? []).map((x) => (x.id === p.id ? saved : x)));
      onLog?.(`Part ${p.partId} arrived — ready for Inspection.`);
    } catch (err) {
      setError(`Couldn't mark arrived — ${(err as { message?: string })?.message ?? "run the 2026-09-21 SQL first"}.`);
    } finally {
      setBusy("");
    }
  }

  
  async function undoArrived(p: Part) {
    if (!window.confirm(`Undo arrival for ${p.partId}? It leaves the Inspection list.`)) return;
    setBusy(`arr-${p.id}`);
    setError("");
    try {
      const saved = await updatePart(p.id, { arrivedAt: null });
      setParts((ps) => (ps ?? []).map((x) => (x.id === p.id ? saved : x)));
      onLog?.(`Part ${p.partId} arrival undone.`);
    } catch (err) {
      setError(`Couldn't undo — ${(err as { message?: string })?.message ?? ""}.`);
    } finally {
      setBusy("");
    }
  }

  async function remove(p: Part) {
    if (!window.confirm(`Delete part ${p.partId}? Its tracker row is removed too.`)) return;
    setBusy(`del-${p.id}`);
    try {
      await deletePart(p.id);
      setParts((ps) => (ps ?? []).filter((x) => x.id !== p.id));
      onLog?.(`Part ${p.partId} deleted.`);
    } catch (err) {
      setError(`Couldn't delete — ${(err as { message?: string })?.message ?? "it may have purchase orders attached"}.`);
    } finally {
      setBusy("");
    }
  }

  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.code ?? "—";

  const th: React.CSSProperties = { fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--text-strong)", padding: "7px 8px", borderTop: "1px solid var(--border-subtle)", whiteSpace: "nowrap" };

  if (parts === null || deals === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "var(--text-xs)", padding: 16 }}>
        <Spinner size="sm" /> Loading procurement…
      </div>
    );
  }

  const visibleDeals = deals.filter((d) => pvPassedDealIds.has(d.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100 }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        Register the parts to order for each deal — vendor, stage and current location stay in sync with the Parts tracker.
        When a part physically arrives at Workspace (US or KR), press <b>Mark arrived</b> to hand it to Inspection.
      </div>
      {error && <Alert tone="warning" title="Action failed">{error}</Alert>}

      {visibleDeals.map((deal) => {
        const list = partsOf(deal.id);
        return (
          <Card key={deal.id}>
            <CardBody>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <ShoppingCart size={15} style={{ color: "var(--color-primary)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-strong)" }}>{deal.dealNo || "Deal"}</span>
                {deal.title && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{deal.title}</span>}
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{list.length} part{list.length === 1 ? "" : "s"}</span>
                <span style={{ flex: 1 }} />
                <Button size="sm" variant="secondary" leftIcon={<ExternalLink size={12} />}
                  disabled title="Separate procurement service is not connected">
                  Procurement not connected
                </Button>
                <Button size="sm" variant="primary" leftIcon={<Plus size={13} />} onClick={() => openAdd(deal.id)}>
                  Add part
                </Button>
              </div>

              {list.length === 0 ? (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "6px 0" }}>
                  No parts registered yet — add the first part to order.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780 }}>
                    <thead><tr>
                      <th style={th}>Part ID</th><th style={th}>External Ref</th><th style={th}>Vendor</th>
                      <th style={th}>Stage</th><th style={th}>Status</th><th style={th}>Location</th><th style={th}>Arrived</th><th style={th} />
                    </tr></thead>
                    <tbody>
                      {list.map((p) => (
                        <tr key={p.id}>
                          <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{p.partId}</td>
                          <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{p.externalRef || "—"}</td>
                          <td style={td}>{vendorName(p.vendorId)}</td>
                          <td style={td}>{p.stage}</td>
                          <td style={td}>{p.status}</td>
                          <td style={{ ...td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{p.location || p.locationDetail || "—"}</td>
                          <td style={td}>
                            {p.arrivedAt ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--green-600, #16a34a)", fontWeight: 600 }}>
                                ✓ {p.arrivedAt.slice(0, 10)}
                                <Button size="sm" variant="ghost" iconOnly aria-label="Undo arrival" title="Undo — sends the part back to Procurement"
                                  disabled={busy === `arr-${p.id}`} onClick={() => void undoArrived(p)}>
                                  <Undo2 size={11} />
                                </Button>
                              </span>
                            ) : (
                              <Button size="sm" variant="soft" leftIcon={<PackageCheck size={12} />} loading={busy === `arr-${p.id}`}
                                title="The part arrived at Workspace — hand it to Inspection"
                                onClick={() => void markArrived(p)}>
                                Mark arrived
                              </Button>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            <Button size="sm" variant="ghost" iconOnly aria-label="Delete part" disabled={busy === `del-${p.id}`} onClick={() => void remove(p)}>
                              <Trash2 size={12} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {adding === deal.id && (
                <div style={{ border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", padding: 12, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 160px" }}>
                      Part ID (internal)
                      <Input size="sm" mono value={form.partId} onChange={(e) => setForm((f) => ({ ...f, partId: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 160px" }}>
                      Requested vendor
                      <Select size="sm" value={form.vendorId} style={{ marginTop: 3 }}
                        options={[{ value: "", label: "— pick later —" }, ...vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.legalName}` }))]}
                        onChange={(e) => onVendorPick(e.target.value)} />
                    </label>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 160px" }}>
                      External Ref (vendor-facing)
                      <Input size="sm" mono value={form.externalRef} placeholder="pick a vendor to suggest"
                        onChange={(e) => setForm((f) => ({ ...f, externalRef: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 160px" }}>
                      Design name
                      <Input size="sm" value={form.name} placeholder="Part name or revision" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "0 1 170px" }}>
                      Stage
                      <Select size="sm" value={form.stage} options={lists.stage.map((s) => ({ value: s, label: s }))}
                        onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 180px" }}>
                      Current location
                      <Input size="sm" value={form.location} placeholder="e.g. Vendor floor · US office" onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "2 1 220px" }}>
                      Note
                      <Input size="sm" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
                    <Button size="sm" variant="primary" loading={busy === "add"} disabled={!form.partId.trim()} onClick={() => void saveNew(deal.id)}>
                      Save part
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}

      {}
      {(() => {
        const list = partsOf(null);
        return (
          <Card>
            <CardBody>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <ShoppingCart size={15} style={{ color: "var(--text-muted)" }} />
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-strong)" }}>No deal</span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>internal · standard-model test orders</span>
                <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{list.length} part{list.length === 1 ? "" : "s"}</span>
                <span style={{ flex: 1 }} />
                <Button size="sm" variant="secondary" leftIcon={<ExternalLink size={12} />}
                  disabled title="Separate procurement service is not connected">
                  Procurement not connected
                </Button>
                <Button size="sm" variant="primary" leftIcon={<Plus size={13} />} onClick={() => openAdd("none")}>
                  Add part
                </Button>
              </div>
              {list.length === 0 ? (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "6px 0" }}>
                  Parts without a deal (internal test builds) live here — they still get ordered from a vendor.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780 }}>
                    <thead><tr>
                      <th style={th}>Part ID</th><th style={th}>External Ref</th><th style={th}>Vendor</th>
                      <th style={th}>Stage</th><th style={th}>Status</th><th style={th}>Location</th><th style={th}>Arrived</th><th style={th} />
                    </tr></thead>
                    <tbody>
                      {list.map((p) => (
                        <tr key={p.id}>
                          <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{p.partId}</td>
                          <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{p.externalRef || "—"}</td>
                          <td style={td}>{vendorName(p.vendorId)}</td>
                          <td style={td}>{p.stage}</td>
                          <td style={td}>{p.status}</td>
                          <td style={{ ...td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{p.location || p.locationDetail || "—"}</td>
                          <td style={td}>
                            {p.arrivedAt ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--green-600, #16a34a)", fontWeight: 600 }}>
                                ✓ {p.arrivedAt.slice(0, 10)}
                                <Button size="sm" variant="ghost" iconOnly aria-label="Undo arrival" title="Undo — sends the part back to Procurement"
                                  disabled={busy === `arr-${p.id}`} onClick={() => void undoArrived(p)}>
                                  <Undo2 size={11} />
                                </Button>
                              </span>
                            ) : (
                              <Button size="sm" variant="soft" leftIcon={<PackageCheck size={12} />} loading={busy === `arr-${p.id}`}
                                onClick={() => void markArrived(p)}>
                                Mark arrived
                              </Button>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            <Button size="sm" variant="ghost" iconOnly aria-label="Delete part" disabled={busy === `del-${p.id}`} onClick={() => void remove(p)}>
                              <Trash2 size={12} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {adding === "none" && (
                <div style={{ border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", padding: 12, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 160px" }}>
                      Part ID (internal)
                      <Input size="sm" mono value={form.partId} onChange={(e) => setForm((f) => ({ ...f, partId: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 160px" }}>
                      Requested vendor
                      <Select size="sm" value={form.vendorId} style={{ marginTop: 3 }}
                        options={[{ value: "", label: "— pick later —" }, ...vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.legalName}` }))]}
                        onChange={(e) => onVendorPick(e.target.value)} />
                    </label>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 160px" }}>
                      External Ref (vendor-facing)
                      <Input size="sm" mono value={form.externalRef} placeholder="pick a vendor to suggest"
                        onChange={(e) => setForm((f) => ({ ...f, externalRef: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 180px" }}>
                      Current location
                      <Input size="sm" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} style={{ marginTop: 3 }} />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
                    <Button size="sm" variant="primary" loading={busy === "add"} disabled={!form.partId.trim()} onClick={() => void saveNew(null)}>
                      Save part
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        );
      })()}

      {visibleDeals.length === 0 && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          No deal cards yet — a deal moves to Procurement once one of its builds passes Printing verification.
        </div>
      )}
    </div>
  );
}
