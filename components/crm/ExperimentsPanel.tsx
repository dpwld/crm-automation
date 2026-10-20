"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Check, Download, FlaskConical, Pencil, Plus, Send, ShoppingCart, Trash2, Undo2, X } from "lucide-react";
import { Alert } from "@/components/ds/feedback/Alert";
import { Button } from "@/components/ds/core/Button";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Input } from "@/components/ds/forms/Input";
import { Spinner } from "@/components/ds/core/Spinner";
import type { Build, Company } from "@/types/domain";
import {
  deleteExperiment, fetchExperiments, insertExperiment, setExperimentStatus, updateExperiment,
  type DealExperiment, type ExperimentStatus, type ExperimentValues,
} from "@/lib/data/experiments";
import { createClient } from "@/lib/supabase/client";
import { fetchSpecBuilds, sendVersionToCrm, type SpecVersion } from "@/lib/data/specBuilds";
import { fetchParts } from "@/lib/data/parts";



interface DealLite { id: string; dealNo: string; title: string; status: string }



const today=()=>new Date().toISOString().slice(0,10);
type DraftForm={title:string;runOn:string;notes:string;measurements:DealExperiment['measurements']};
function draftFrom(e:DealExperiment):DraftForm{return {title:e.title,runOn:e.runOn||today(),notes:e.notes,measurements:e.measurements.map(m=>({...m}))};}
function valuesFrom(d:DraftForm):ExperimentValues{return {...d,title:d.title.trim(),runOn:d.runOn||null};}

export function ExperimentsPanel({
  company,
  meId,
  builds,
  onLog,
  onSpecSynced,
}: {
  company: Company;
  meId: string;
  
  builds: Build[];
  
  onLog?: (summary: string) => void;
  
  onSpecSynced?: () => void;
}) {
  const [experiments, setExperiments] = useState<DealExperiment[] | null>(null);
  const [deals, setDeals] = useState<DealLite[] | null>(null);
  const [finalVersions, setFinalVersions] = useState<Record<string, SpecVersion>>({}); // dealId → 최신 final 버전
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // experiment id
  const [draft, setDraft] = useState<DraftForm | null>(null);

  useEffect(() => {
    let alive = true;
    fetchExperiments(company.id)
      .then((list) => { if (alive) { setExperiments(list); setLoadError(""); } })
      .catch((err: { code?: string; message?: string }) => {
        if (!alive) return;
        setExperiments([]);
        setLoadError(err?.code === "42P01" || /deal_experiments/.test(err?.message ?? "")
          ? "The experiments table isn't set up yet — run db/migrations/2026-09-17g_deal_experiments.sql first."
          : `Couldn't load experiments — ${err?.message ?? "unknown error"}`);
      });
    createClient().from("deals").select("id, deal_no, title, status").eq("company_id", company.id).order("created_at")
      .then(({ data }) => { if (alive) setDeals((data ?? []).map((r) => ({ id: r.id as string, dealNo: (r.deal_no as string) ?? "", title: (r.title as string) ?? "", status: (r.status as string) ?? "" }))); });
    fetchSpecBuilds(company.id)
      .then(({ builds, versions }) => {
        if (!alive) return;
        const map: Record<string, SpecVersion> = {};
        for (const v of versions) {
          if (!v.isFinal) continue;
          const b = builds.find((x) => x.id === v.buildId);
          if (b?.dealId) map[b.dealId] = v; // 뒤에 온(최신) final이 이긴다
        }
        setFinalVersions(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [company.id]);

  const byDeal = useMemo(() => {
    const map = new Map<string, DealExperiment[]>();
    for (const e of experiments ?? []) {
      const key = e.dealId ?? "none";
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [experiments]);

  // 게이트 강화(2026-09-21 확정): Inspection 완료(Mark inspected)된 파트가 있는 딜만 등장.
  const [inspectedDealIds, setInspectedDealIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    const buildDealOf: Record<string, string> = {};
    for (const b of builds) if (b.dealId) buildDealOf[b.id] = b.dealId;
    fetchParts()
      .then((ps) => {
        if (!alive) return;
        const ids = new Set<string>();
        for (const part of ps) {
          if (!part.inspectedAt) continue;
          const dealId = part.dealId ?? (part.buildId ? buildDealOf[part.buildId] : null);
          if (dealId) ids.add(dealId);
        }
        setInspectedDealIds(ids);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [builds, company.id]);

  async function addExperiment(dealId: string | null) {
    setError("");
    setBusy(`add-${dealId ?? "none"}`);
    try {
      const n = (byDeal.get(dealId ?? "none") ?? []).length + 1;
      const saved = await insertExperiment(company.id, dealId, { title: `Run ${n}`, runOn: today() }, meId);
      setExperiments((list) => [...(list ?? []), saved]);
      setEditing(saved.id);
      setDraft(draftFrom(saved));
      onLog?.(`Experiment "${saved.title}" created.`);
    } catch (err) {
      console.error("experiment create failed:", err);
      setError(`Couldn't create the experiment — ${(err as { message?: string })?.message ?? "check the 2026-09-17g SQL"}.`);
    } finally {
      setBusy("");
    }
  }

  async function saveDraft(e: DealExperiment) {
    if (!draft) return;
    setBusy(`save-${e.id}`);
    setError("");
    try {
      const saved = await updateExperiment(e.id, valuesFrom(draft));
      setExperiments((list) => (list ?? []).map((x) => (x.id === e.id ? saved : x)));
      setEditing(null);
      setDraft(null);
      onLog?.(`Experiment "${saved.title || "Run"}" measurements saved.`);
    } catch (err) {
      console.error("experiment save failed:", err);
      setError(`Couldn't save — ${(err as { message?: string })?.message ?? "unknown error"}.`);
    } finally {
      setBusy("");
    }
  }

  async function setStatus(e: DealExperiment, status: ExperimentStatus) {
    setBusy(`st-${e.id}`);
    setError("");
    try {
      await setExperimentStatus(e.id, status);
      setExperiments((list) => (list ?? []).map((x) => (x.id === e.id ? { ...x, status } : x)));
      onLog?.(`Experiment "${e.title || "Run"}" ${status === "accepted" ? "accepted" : status === "failed" ? "marked failed" : "reset to draft"}.`);
    } catch (err) {
      console.error("experiment status failed:", err);
      setError(`Couldn't update the status — ${(err as { message?: string })?.message ?? "unknown error"}.`);
    } finally {
      setBusy("");
    }
  }

  async function remove(e: DealExperiment) {
    if (!window.confirm(`Delete experiment "${e.title || "Run"}"?`)) return;
    setBusy(`del-${e.id}`);
    try {
      await deleteExperiment(e.id);
      setExperiments((list) => (list ?? []).filter((x) => x.id !== e.id));
      onLog?.(`Experiment "${e.title || "Run"}" deleted.`);
    } catch (err) {
      console.error("experiment delete failed:", err);
      setError(`Couldn't delete — ${(err as { message?: string })?.message ?? "unknown error"}.`);
    } finally {
      setBusy("");
    }
  }

  
  function exportXlsx(deal: DealLite | null, list: DealExperiment[]) {
    const rows = list.map((e) => ({
      Experiment: e.title || "Run",
      Date: e.runOn ?? "",
      ...Object.fromEntries(e.measurements.map(m=>[`${m.label}${m.unit?' ['+m.unit+']':''}`,m.value])),
      Status: e.status, Notes: e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Experiments");
    XLSX.writeFile(wb, `${company.name}_${deal?.dealNo || "experiments"}_experiments.xlsx`.replace(/[^\w.-]+/g, "_"));
    onLog?.(`Experiments exported to Excel (${list.length} run${list.length === 1 ? "" : "s"}).`);
  }

  async function sendSpecToCrm(dealId: string) {
    const version = finalVersions[dealId];
    if (!version) return;
    if (!window.confirm("Copy the final spec into the CRM spec sheet? Confidential rows are excluded.")) return;
    setBusy(`crm-${dealId}`);
    setError("");
    try {
      const n = await sendVersionToCrm(company.id, version);
      onSpecSynced?.();
      onLog?.(`Final spec "${version.label}" sent to CRM (${n} rows) after experiment acceptance.`);
    } catch (err) {
      console.error("send to crm failed:", err);
      setError(`Couldn't send the spec to CRM — ${(err as { message?: string })?.message ?? "unknown error"}.`);
    } finally {
      setBusy("");
    }
  }

  const th: React.CSSProperties = { fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: ".03em", padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--text-strong)", padding: "7px 8px", textAlign: "center", borderTop: "1px solid var(--border-subtle)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  function dealCard(deal: DealLite | null) {
    const key = deal?.id ?? "none";
    const list = byDeal.get(key) ?? [];
    if (!deal && list.length === 0) return null; // 딜 없는 실험이 없으면 그룹 자체를 숨긴다
    // Inspection을 통과해야 실험 단계에 등장 (2026-09-21 게이트 강화)
    if (deal && !inspectedDealIds.has(deal.id)) return null;
    const accepted = list.filter((e) => e.status === "accepted").length;
    return (
      <Card key={key}>
        <CardBody>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <FlaskConical size={15} style={{ color: "var(--color-primary)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-strong)" }}>
              {deal ? deal.dealNo || "Deal" : "No deal"}
            </span>
            {deal?.title && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{deal.title}</span>}
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
              {list.length} experiment{list.length === 1 ? "" : "s"}{accepted ? ` · ${accepted} accepted` : ""}
            </span>
            <span style={{ flex: 1 }} />
            {list.length > 0 && (
              <Button size="sm" variant="ghost" leftIcon={<Download size={12} />}
                title="Export this deal's experiments to Excel"
                onClick={() => exportXlsx(deal, list)}>
                Export .xlsx
              </Button>
            )}
            <Button size="sm" variant="secondary" leftIcon={<Plus size={13} />} loading={busy === `add-${key}`}
              onClick={() => void addExperiment(deal?.id ?? null)}>
              New experiment
            </Button>
          </div>

          {list.length === 0 ? (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", padding: "6px 0" }}>
              No experiments yet — log the first test run for this deal.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 880 }}>
                <thead><tr><th style={th}>Experiment</th><th style={th}>Date</th><th style={th}>Measurements</th><th style={th}>Actions</th></tr></thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id} style={e.status === "accepted" ? { background: "var(--green-50, #f0fdf4)" } : undefined}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{e.title || "Run"}</td>
                      <td style={td}>{e.runOn ?? "—"}</td>
                      <td style={{...td,whiteSpace:'normal',textAlign:'left'}}>{e.measurements.map(m=><div key={m.label}>{m.label}: {m.value||'—'} {m.unit}</div>)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 2 }}>
                          <Button size="sm" variant="ghost" iconOnly aria-label="Edit experiment"
                            onClick={() => { setEditing(e.id); setDraft(draftFrom(e)); }}>
                            <Pencil size={12} />
                          </Button>
                          {e.status !== "accepted" ? (
                            <Button size="sm" variant="ghost" iconOnly aria-label="Accept experiment" title="Accept — unlocks Procurement · CRM for this deal"
                              disabled={busy === `st-${e.id}`} onClick={() => void setStatus(e, "accepted")}>
                              <Check size={13} style={{ color: "var(--green-600, #16a34a)" }} />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" iconOnly aria-label="Undo acceptance"
                              disabled={busy === `st-${e.id}`} onClick={() => void setStatus(e, "draft")}>
                              <Undo2 size={12} />
                            </Button>
                          )}
                          {e.status !== "failed" && e.status !== "accepted" && (
                            <Button size="sm" variant="ghost" iconOnly aria-label="Mark failed"
                              disabled={busy === `st-${e.id}`} onClick={() => void setStatus(e, "failed")}>
                              <X size={13} style={{ color: "var(--red-600, #dc2626)" }} />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" iconOnly aria-label="Delete experiment"
                            disabled={busy === `del-${e.id}`} onClick={() => void remove(e)}>
                            <Trash2 size={12} />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {}
          {editing && draft && list.some((e) => e.id === editing) && (() => {
            
            return (
              <div style={{ border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", padding: 12, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "1 1 180px" }}>
                    Name
                    <Input size="sm" value={draft.title} onChange={(ev) => setDraft({ ...draft, title: ev.target.value })} style={{ marginTop: 3 }} />
                  </label>
                  <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", flex: "0 1 160px" }}>
                    Date
                    <Input size="sm" type="date" value={draft.runOn} onChange={(ev) => setDraft({ ...draft, runOn: ev.target.value })} style={{ marginTop: 3 }} />
                  </label>
                </div>
                {}
                <div className="settings-grid">{draft.measurements.map((m,i)=><label key={m.label}>{m.label} {m.unit&&`(${m.unit})`}<Input aria-label={m.label} type={m.isText?'text':'number'} step="any" value={m.value} onChange={ev=>setDraft({...draft,measurements:draft.measurements.map((v,n)=>n===i?{...v,value:ev.target.value}:v)})}/></label>)}</div>
                <label style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                  Notes
                  <Input size="sm" value={draft.notes} placeholder="Test rig, conditions, anomalies…"
                    onChange={(ev) => setDraft({ ...draft, notes: ev.target.value })} style={{ marginTop: 3 }} />
                </label>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setDraft(null); }}>Cancel</Button>
                  <Button size="sm" variant="primary" loading={busy === `save-${editing}`}
                    onClick={() => { const e = list.find((x) => x.id === editing); if (e) void saveDraft(e); }}>
                    Save measurements
                  </Button>
                </div>
              </div>
            );
          })()}

          {}
          {deal && accepted > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center", borderTop: "1px dashed var(--border-subtle)", paddingTop: 10 }}>
              <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--green-600, #16a34a)" }}>
                ✓ Experiment accepted — ready to move on
              </span>
              <Button size="sm" variant="soft" leftIcon={<ShoppingCart size={13} />}
                disabled title="Separate procurement service is not connected">
                Procurement not connected
              </Button>
              <Button size="sm" variant="soft" leftIcon={<Send size={13} />} loading={busy === `crm-${deal.id}`}
                disabled={!finalVersions[deal.id]}
                title={finalVersions[deal.id] ? "Copy the final spec into the CRM spec sheet (confidential rows excluded)" : "Mark a spec version final in the Spec sheet step first"}
                onClick={() => void sendSpecToCrm(deal.id)}>
                Send final spec to CRM
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  if (experiments === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "var(--text-xs)", padding: 16 }}>
        <Spinner size="sm" /> Loading experiments…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100 }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        Test-rig runs per deal — set the <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>inputs</span> (T_in, ṁ),
        record the <b>outputs ○</b> (T_out, ΔP = P_out − P_in, in Pascals). Accepting one experiment unlocks Procurement and the CRM handoff for that deal.
      </div>
      {loadError && <Alert tone="warning" title="Experiments unavailable">{loadError}</Alert>}
      {error && <Alert tone="warning" title="Action failed">{error}</Alert>}
      {(deals ?? []).map((d) => dealCard(d))}
      {dealCard(null)}
      {!loadError && (byDeal.get("none") ?? []).length === 0 &&
        (deals ?? []).every((d) => !inspectedDealIds.has(d.id)) && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {(deals ?? []).length === 0
            ? "No deals yet — experiments attach to a deal created in the Spec sheet step."
            : "No deals here yet — a deal moves to Experiments once one of its parts is marked inspected in the Inspection step."}
        </div>
      )}
    </div>
  );
}
