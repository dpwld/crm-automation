"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Camera, CheckCircle2, FileText, Trash2, Undo2 } from "lucide-react";
import { Alert } from "@/components/ds/feedback/Alert";
import { Button } from "@/components/ds/core/Button";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Input } from "@/components/ds/forms/Input";
import { Spinner } from "@/components/ds/core/Spinner";
import type { Build, Company, Part } from "@/types/domain";
import { fetchParts, updatePart } from "@/lib/data/parts";
import {
  deletePartPhoto, fetchPartPhotos, partPhotoUrl, uploadPartPhoto, type PartPhoto,
} from "@/lib/data/inspections";

/* ④ Inspection 패널 (2026-09-21 개편) — 회사에 도착(Mark arrived)한 파트의
   실물 사진·파일을 슬롯별로 올리고 검수를 확정한다. Detail 슬롯에는 화면별
   사진과 CT scan·CAD 파일까지 (mime 무관). 확정되면 "Move to Experiments"
   버튼으로 다음 단계 (자동 전이 없음 — 대표 확정). */

const SLOTS: { slot: string; hint: string; anyFile: boolean }[] = [
  { slot: "Overall", hint: "full view photos", anyFile: false },
  { slot: "Detail", hint: "per-face photos · CT scan · CAD files", anyFile: true },
  { slot: "Defect", hint: "only if damaged", anyFile: false },
  { slot: "Label", hint: "label · serial", anyFile: false },
];

export function InspectionPanel({
  company,
  meId,
  builds,
  onLog,
  onOpenExperiments,
}: {
  company: Company;
  meId: string;
  builds: Build[];
  onLog?: (summary: string) => void;
  onOpenExperiments?: () => void;
}) {
  const [parts, setParts] = useState<Part[] | null>(null);
  const [photos, setPhotos] = useState<PartPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ partId: string; slot: string } | null>(null);

  const buildDealOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of builds) if (b.dealId) m[b.id] = b.dealId;
    return m;
  }, [builds]);

  useEffect(() => {
    let alive = true;
    fetchParts()
      .then(async (ps) => {
        if (!alive) return;
        // 이 회사 파트 중 도착(arrived) 표시된 것만 검수 대상
        const mine = ps.filter((p) => p.program === company.name && p.arrivedAt);
        setParts(mine);
        const phs = await fetchPartPhotos(mine.map((p) => p.id)).catch(() => []);
        if (!alive) return;
        setPhotos(phs);
        // 이미지 썸네일 URL (이미지 mime만)
        const imagePhotos = phs.filter((x) => x.mimeType.startsWith("image/"));
        const pairs = await Promise.all(imagePhotos.map(async (x) => [x.id, await partPhotoUrl(x.storagePath).catch(() => "")] as const));
        if (alive) setUrls(Object.fromEntries(pairs.filter(([, u]) => u)));
      })
      .catch((err) => { if (alive) { setParts([]); setError(`Couldn't load parts — ${(err as { message?: string })?.message ?? ""}`); } });
    return () => { alive = false; };
  }, [company.id, company.name]);

  function pick(partId: string, slot: string, anyFile: boolean) {
    pendingUpload.current = { partId, slot };
    if (fileInput.current) {
      fileInput.current.accept = anyFile ? "*/*" : "image/*";
      fileInput.current.click();
    }
  }

  async function onFiles(files: FileList | null) {
    const target = pendingUpload.current;
    pendingUpload.current = null;
    if (!files?.length || !target) return;
    setBusy(`up-${target.partId}`);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const saved = await uploadPartPhoto(target.partId, target.slot, file, meId);
        setPhotos((ps) => [...ps, saved]);
        if (file.type.startsWith("image/")) {
          const u = await partPhotoUrl(saved.storagePath).catch(() => "");
          if (u) setUrls((m) => ({ ...m, [saved.id]: u }));
        }
      }
      onLog?.(`Inspection files uploaded (${target.slot}) for ${(parts ?? []).find((p) => p.id === target.partId)?.partId ?? "part"}.`);
    } catch (err) {
      setError(`Upload failed — ${(err as { message?: string })?.message ?? "run db/migrations/2026-09-21_eng_revamp.sql first"}.`);
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removePhoto(ph: PartPhoto) {
    if (!window.confirm(`Delete ${ph.fileName}?`)) return;
    try {
      await deletePartPhoto(ph);
      setPhotos((ps) => ps.filter((x) => x.id !== ph.id));
    } catch (err) {
      setError(`Couldn't delete the file — ${(err as { message?: string })?.message ?? ""}`);
    }
  }

  async function markInspected(p: Part) {
    setBusy(`ins-${p.id}`);
    setError("");
    try {
      const saved = await updatePart(p.id, {
        inspectedAt: new Date().toISOString(),
        inspectedBy: meId,
        inspectionNote: noteDraft[p.id] ?? p.inspectionNote ?? "",
      });
      setParts((ps) => (ps ?? []).map((x) => (x.id === p.id ? saved : x)));
      onLog?.(`Part ${p.partId} inspected — ready for Experiments.`);
    } catch (err) {
      setError(`Couldn't mark inspected — ${(err as { message?: string })?.message ?? "run the 2026-09-21 SQL first"}.`);
    } finally {
      setBusy("");
    }
  }

  /** 검수 원복 (2026-09-21 지시) — Experiments 게이트도 다시 잠긴다. */
  async function undoInspected(p: Part) {
    if (!window.confirm(`Undo inspection for ${p.partId}? Its deal may leave the Experiments step.`)) return;
    setBusy(`ins-${p.id}`);
    setError("");
    try {
      const saved = await updatePart(p.id, { inspectedAt: null, inspectedBy: "" });
      setParts((ps) => (ps ?? []).map((x) => (x.id === p.id ? saved : x)));
      onLog?.(`Part ${p.partId} inspection undone.`);
    } catch (err) {
      setError(`Couldn't undo — ${(err as { message?: string })?.message ?? ""}.`);
    } finally {
      setBusy("");
    }
  }

  async function openFile(ph: PartPhoto) {
    const u = urls[ph.id] || (await partPhotoUrl(ph.storagePath).catch(() => ""));
    if (u) window.open(u, "_blank", "noopener");
  }

  if (parts === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "var(--text-xs)", padding: 16 }}>
        <Spinner size="sm" /> Loading inspection…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100 }}>
      <input ref={fileInput} type="file" hidden multiple onChange={(e) => void onFiles(e.target.files)} />
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        Photograph and verify each part that arrived (think manufacturing intake). Upload per slot — Detail also
        takes CT scans and CAD files. When a part checks out, <b>Mark inspected</b>, then move on to Experiments.
      </div>
      {error && <Alert tone="warning" title="Action failed">{error}</Alert>}

      {parts.length === 0 ? (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          Nothing to inspect yet — parts appear here after <b>Mark arrived</b> in the Procurement step.
        </div>
      ) : (
        parts.map((p) => {
          const mine = photos.filter((x) => x.partId === p.id);
          const dealNo = p.dealId || (p.buildId && buildDealOf[p.buildId]) ? "" : "";
          void dealNo;
          return (
            <Card key={p.id}>
              <CardBody>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <Camera size={15} style={{ color: "var(--color-primary)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-strong)" }}>{p.partId}</span>
                  {p.name && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{p.name}</span>}
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>arrived {p.arrivedAt?.slice(0, 10)}</span>
                  <span style={{ flex: 1 }} />
                  {p.inspectedAt ? (
                    <>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--green-600, #16a34a)" }}>
                        <CheckCircle2 size={13} /> Inspected {p.inspectedAt.slice(0, 10)}
                        <Button size="sm" variant="ghost" iconOnly aria-label="Undo inspection" title="Undo — reopens this part's inspection"
                          disabled={busy === `ins-${p.id}`} onClick={() => void undoInspected(p)}>
                          <Undo2 size={11} />
                        </Button>
                      </span>
                      {onOpenExperiments && (
                        <Button size="sm" variant="primary" leftIcon={<ArrowRight size={13} />} onClick={onOpenExperiments}>
                          Move to Experiments
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button size="sm" variant="primary" leftIcon={<CheckCircle2 size={13} />} loading={busy === `ins-${p.id}`}
                      title="The received part checks out — record the inspection"
                      onClick={() => void markInspected(p)}>
                      Mark inspected
                    </Button>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SLOTS.map(({ slot, hint, anyFile }) => {
                    const slotFiles = mine.filter((x) => x.slot === slot);
                    return (
                      <div key={slot} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ width: 120, flexShrink: 0, paddingTop: 4 }}>
                          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)" }}>{slot}</div>
                          <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{hint}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", flex: 1 }}>
                          {slotFiles.map((ph) => (
                            <div key={ph.id} className="sx-feed-row" style={{ position: "relative" }}>
                              {ph.mimeType.startsWith("image/") && urls[ph.id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={urls[ph.id]} alt={ph.fileName} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", cursor: "pointer" }}
                                  onClick={() => void openFile(ph)} />
                              ) : (
                                <button type="button" onClick={() => void openFile(ph)}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border-subtle)", background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)", padding: "8px 10px", cursor: "pointer", fontSize: "var(--text-2xs)", color: "var(--text-default)", maxWidth: 180 }}>
                                  <FileText size={13} style={{ flexShrink: 0 }} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ph.fileName}</span>
                                </button>
                              )}
                              <span className="sx-feed-actions" style={{ position: "absolute", top: -6, right: -6 }}>
                                <Button variant="secondary" size="sm" iconOnly aria-label="Delete file" onClick={() => void removePhoto(ph)}>
                                  <Trash2 size={11} />
                                </Button>
                              </span>
                            </div>
                          ))}
                          <Button size="sm" variant="ghost" leftIcon={<Camera size={12} />} loading={busy === `up-${p.id}`}
                            onClick={() => pick(p.id, slot, anyFile)}>
                            Upload
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!p.inspectedAt && (
                  <label style={{ display: "block", fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 10 }}>
                    Inspection note (defects, deviations…)
                    <Input size="sm" value={noteDraft[p.id] ?? p.inspectionNote ?? ""} placeholder="e.g. minor surface roughness on inlet face"
                      onChange={(e) => setNoteDraft((m) => ({ ...m, [p.id]: e.target.value }))} style={{ marginTop: 3 }} />
                  </label>
                )}
                {p.inspectedAt && p.inspectionNote && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-default)", marginTop: 8 }}>
                    <b>Note:</b> {p.inspectionNote}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}
