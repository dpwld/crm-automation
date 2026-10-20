"use client";

import { useEffect, useRef, useState } from "react";
import { useDraftHistory } from "@/lib/hooks/useDraftHistory";
import { ActionsMenu } from "./ActionsMenu";
import { EditorActions, editorKeys } from "./EditorActions";
import { Box, Boxes, Camera, Check, ChevronDown, ChevronRight, Download, FlaskConical, ImagePlus, Paperclip, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ds/core/Badge";
import { Button } from "@/components/ds/core/Button";
import { Spinner } from "@/components/ds/core/Spinner";
import { Checkbox } from "@/components/ds/forms/Checkbox";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Textarea } from "@/components/ds/forms/Textarea";
import { Modal } from "@/components/ds/feedback/Modal";
import { Alert } from "@/components/ds/feedback/Alert";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import { memberName } from "@/lib/mock/team";
import { SavedFlash } from "@/components/common/SavedFlash";
import {
  buildFileUrl, deleteBuild, deleteBuildFile, insertBuild, updateBuild, uploadBuildFile,
} from "@/lib/data/builds";
import { syncBuildToPart } from "@/lib/data/parts";
import type { Build, BuildChecklistItem, BuildFile, BuildStatus } from "@/types/domain";

/** In-progress edits for one build; committed as a single save + log entry. */
interface BuildDraft {
  modelCode: string;
  status: BuildStatus;
  modelSpec: Record<string, Record<string, string>>;
  checklist: BuildChecklistItem[];
  notes: string;
}

/* Company printing verification panel: the
   company's Builds — one card per printed model — each expanding into the
   verification workspace. Pictures come FIRST (Top/Side/Front/Perspective/
   Internal section slots), then status, compact model spec, checklist, files,
   notes. Every change is logged to the company activity feed (right pane,
   context "engineering"). */

const STATUS_LABEL: Record<BuildStatus, string> = {
  design: "Design",
  verification: "Printing verification",
  passed: "Passed",
  failed: "Failed",
};
const STATUS_TONE: Record<BuildStatus, "neutral" | "info" | "success" | "danger"> = {
  design: "neutral",
  verification: "info",
  passed: "success",
  failed: "danger",
};

/** Picture slots in display order, per the verification document. */
const VIEW_SLOTS: { view: string; hint: string }[] = [
  { view: "Top", hint: "1 photo" },
  { view: "Side", hint: "2 photos" },
  { view: "Front", hint: "1 photo" },
  { view: "Perspective", hint: "2 photos" },
  { view: "Internal section", hint: "3–4 photos" },
];

export function EngineeringPanel({
  loading = false,
  focusBuildId,
  companyId,
  meId,
  builds,
  filesByBuild,
  onBuildsChanged,
  onLog,
  onOpenExperiments,
}: {
  /** True while builds are still fetching — suppresses the empty state. */
  loading?: boolean;
  /** Global-search deep link — expand this build when it appears. */
  focusBuildId?: string | null;
  companyId: string;
  meId: string;
  builds: Build[];
  filesByBuild: Record<string, BuildFile[]>;
  /** Reload builds+files after any mutation. */
  onBuildsChanged: () => Promise<void>;
  /** Activity log line (context "engineering" — shows in the right pane). */
  onLog: (summary: string) => Promise<void>;
  /** Passed 빌드 → 다음 단계 탭으로 (2026-09-21 개편: PV 다음은 Procurement). */
  onOpenExperiments?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(builds.length === 1 ? builds[0].id : null);
  const focusConsumed = useRef(false);

  // Deep link from global search: open the target build once it's loaded.
  useEffect(() => {
    if (!focusBuildId || focusConsumed.current) return;
    if (builds.some((b) => b.id === focusBuildId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot external prop sync
      setOpenId(focusBuildId);
      focusConsumed.current = true;
    }
  }, [focusBuildId, builds]);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState<{ saved: Build; previous: Build } | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<Build | null>(null);
  // 체크리스트 완료 → 원클릭 Passed 처리 중인 빌드
  const [passingId, setPassingId] = useState<string | null>(null);

  /** 체크리스트를 다 채운 빌드를 한 번에 검증 통과 처리하고 실험 단계로 보낸다. */
  async function markPassed(b: Build) {
    if (passingId) return;
    setPassingId(b.id);
    try {
      await updateBuild(b.id, { status: "passed" });
      await onLog(`Build "${b.modelCode || "model"}" printing verification passed — moved on to Procurement.`);
      await onBuildsChanged();
      onOpenExperiments?.();
    } catch (err) {
      console.error("mark passed failed:", err);
      window.alert(`Couldn't mark the build as passed — ${(err as { message?: string })?.message ?? "try again"}.`);
    } finally {
      setPassingId(null);
    }
  }
  const [confirmFile, setConfirmFile] = useState<{ build: Build; file: BuildFile } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraftState, editHistory] = useDraftHistory<BuildDraft | null>(null);
  const editOpener = useRef<HTMLElement | null>(null);
  const setDraft = (d: BuildDraft) => setDraftState(d);
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ buildId: string; view: string } | null>(null);
  const [uploading, setUploading] = useState<{ view: string; done: number; total: number } | null>(null);

  // Signed URLs for picture thumbnails of the expanded build.
  useEffect(() => {
    if (!openId) return;
    const imgs = (filesByBuild[openId] ?? []).filter((f) => f.view && f.mimeType.startsWith("image/"));
    let alive = true;
    (async () => {
      for (const f of imgs) {
        if (imgUrls[f.id]) continue;
        try {
          const url = await buildFileUrl(f.storagePath);
          if (alive) setImgUrls((prev) => ({ ...prev, [f.id]: url }));
        } catch { /* thumbnail stays blank; click still offers download */ }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, filesByBuild]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onBuildsChanged();
    } catch (err) {
      console.error("engineering action failed:", err);
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function createBuild() {
    const code = newCode.trim();
    if (!code) return;
    await act(async () => {
      const b = await insertBuild(companyId, code, meId);
      await onLog(`Started build “${code}”.`);
      setCreating(false);
      setNewCode("");
      setOpenId(b.id);
    });
  }

  function startEdit(b: Build) {
    if (pendingSync || (editingId && !cancelEdit())) return;
    editOpener.current = document.activeElement as HTMLElement;
    setOpenId(b.id);
    setEditingId(b.id);
    editHistory.reset({
      modelCode: b.modelCode,
      status: b.status,
      modelSpec: JSON.parse(JSON.stringify(b.modelSpec)),
      checklist: b.checklist.map((c) => ({ ...c })),
      notes: b.notes,
    });
    setError(null);
    requestAnimationFrame(() => document.getElementById(`build-${b.id}`)?.querySelector<HTMLElement>('input[aria-label="Model code"]')?.focus());
  }

  function cancelEdit() {
    if (busy) return false;
    if (editHistory.dirty && !window.confirm("Discard unsaved changes to this build?")) return false;
    finishEdit();
    return true;
  }
  function finishEdit() {
    setEditingId(null);
    editHistory.reset(null);
    requestAnimationFrame(() => (editOpener.current?.isConnected ? editOpener.current : document.getElementById(`build-edit-${editingId}`))?.focus());
  }

  /** Diff draft vs build → ONE update + ONE combined log line. */
  async function saveEdit(b: Build) {
    if (!draft || busy) return;
    const d = draft;
    const patch: Record<string, unknown> = {};
    const parts: string[] = [];
    const code = d.modelCode.trim() || b.modelCode;
    if (code !== b.modelCode) {
      patch.model_code = code;
      parts.push(`renamed \u201c${b.modelCode}\u201d \u2192 \u201c${code}\u201d`);
    }
    if (d.status !== b.status) {
      patch.status = d.status;
      parts.push(`status ${STATUS_LABEL[b.status]} \u2192 ${STATUS_LABEL[d.status]}`);
    }
    const specDiffs: string[] = [];
    for (const [section, params] of Object.entries(d.modelSpec)) {
      for (const [param, value] of Object.entries(params)) {
        const prev = b.modelSpec[section]?.[param] ?? "";
        if (value !== prev) specDiffs.push(`${section} \u00b7 ${param}: ${prev || "N/A"} \u2192 ${value || "N/A"}`);
      }
    }
    if (specDiffs.length) {
      patch.model_spec = d.modelSpec;
      parts.push(...specDiffs);
    }
    const clDiffs: string[] = [];
    if (d.checklist.length === b.checklist.length) {
      d.checklist.forEach((item, i) => {
        const prev = b.checklist[i];
        if (item.label !== prev.label) clDiffs.push(`checklist item \u201c${prev.label}\u201d \u2192 \u201c${item.label}\u201d`);
        if (item.done !== prev.done) clDiffs.push(`checklist \u201c${item.label}\u201d ${item.done ? "checked" : "unchecked"}`);
      });
    } else if (JSON.stringify(d.checklist) !== JSON.stringify(b.checklist)) {
      clDiffs.push(`checklist updated (${d.checklist.length} items)`);
    }
    if (clDiffs.length) {
      patch.checklist = d.checklist;
      parts.push(...clDiffs);
    }
    if (d.notes !== b.notes) {
      patch.notes = d.notes;
      parts.push("notes updated");
    }
    if (!parts.length) {
      finishEdit();
      return;
    }
    await act(async () => {
      const saved = await updateBuild(b.id, patch);
      // \uc5f0\uacb0\ub41c Parts \ud2b8\ub798\ucee4 \ud589(build_id \ub9e4\uce6d) \uc2e4\uc2dc\uac04 \uc790\ub3d9 \ub3d9\uae30\ud654 \u2014 \ub9e4\ud551 \ud544\ub4dc
      // (\ubaa8\ub378\ucf54\ub4dc\u2192name, status\u2192stage/status, External L/W/H\u2192size)\ub9cc \ub36e\ub294\ub2e4.
      // best-effort: \uc2e4\ud328\ud574\ub3c4 \ube4c\ub4dc \uc800\uc7a5\uc740 \uc720\uc9c0.
      if (patch.model_code !== undefined || patch.status !== undefined || patch.model_spec !== undefined) {
        try {
          await syncBuildToPart(saved, b);
          setPendingSync(null);
        } catch (err) {
          console.error("build\u2192part sync failed:", err);
          setPendingSync({ saved, previous: b });
          setError("The build was saved, but its linked parts could not be updated. Retry to finish syncing.");
        }
      }
      await onLog(`\u201c${code}\u201d updated · ${parts.join("; ")}.`);
      finishEdit();
      setSavedTick((n) => n + 1);
    });
  }

  async function onFiles(list: FileList | null) {
    const target = uploadTarget.current;
    if (!list?.length || !target) return;
    const files = [...list];
    const b = builds.find((x) => x.id === target.buildId);
    setUploading({ view: target.view, done: 0, total: files.length });
    await act(async () => {
      let done = 0;
      for (const f of files) {
        await uploadBuildFile(target.buildId, f, memberName(meId), target.view);
        done += 1;
        setUploading({ view: target.view, done, total: files.length });
      }
      await onLog(
        target.view
          ? `Uploaded ${files.length} ${target.view} image${files.length === 1 ? "" : "s"} for “${b?.modelCode ?? ""}”.`
          : `Uploaded ${files.length} file${files.length === 1 ? "" : "s"} for “${b?.modelCode ?? ""}”.`,
      );
    });
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function pickFiles(buildId: string, view: string) {
    uploadTarget.current = { buildId, view };
    if (fileRef.current) fileRef.current.accept = view ? "image/*" : "";
    fileRef.current?.click();
  }

  /** Mobile: open the phone camera directly for a picture slot. */
  function pickCamera(buildId: string, view: string) {
    uploadTarget.current = { buildId, view };
    cameraRef.current?.click();
  }

  /** Open a non-image file. The tab must be opened SYNCHRONOUSLY (inside the
     click) or popup blockers eat it once we await the signed URL. */
  function openFile(f: BuildFile) {
    const win = window.open("about:blank", "_blank");
    buildFileUrl(f.storagePath)
      .then((url) => {
        if (win) win.location.href = url;
        else window.open(url, "_blank", "noopener");
      })
      .catch(() => {
        win?.close();
        setError("Failed to create download link.");
      });
  }

  /** Image click → in-app lightbox (no new tab, no popup blocker). */
  function openImage(f: BuildFile) {
    const cached = imgUrls[f.id];
    if (cached) {
      setPreview({ url: cached, name: f.fileName });
      return;
    }
    buildFileUrl(f.storagePath)
      .then((url) => {
        setImgUrls((prev) => ({ ...prev, [f.id]: url }));
        setPreview({ url, name: f.fileName });
      })
      .catch(() => setError("Failed to load the image."));
  }

  const doneCount = (b: Build) => b.checklist.filter((c) => c.done).length;

  const sectionLabel: React.CSSProperties = {
    fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)", marginBottom: 6,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
          Verify each model, then track its parts and create the supplier order.
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SavedFlash tick={savedTick} />
          {busy && <Spinner size="sm" />}
          <Button size="sm" variant="primary" disabled={editingId !== null} leftIcon={<Plus size={14} />} onClick={() => setCreating(true)}>
            New build
          </Button>
        </div>
      </div>

      {(error || pendingSync) && <Alert tone="warning" title="Engineering" onClose={pendingSync ? null : () => setError(null)}
        actions={pendingSync && <Button size="sm" loading={busy} onClick={() => void act(async () => {
          await syncBuildToPart(pendingSync.saved, pendingSync.previous);
          setPendingSync(null);
        })}>Retry part sync</Button>}>{pendingSync ? "The build was saved, but its linked parts still need syncing. Retry before editing another build." : error}</Alert>}

      <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => onFiles(e.target.files)} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => onFiles(e.target.files)} />

      {loading && builds.length === 0 ? (
        <div style={{ display: "grid", placeItems: "center", padding: 40, color: "var(--text-muted)" }}>
          <Spinner />
        </div>
      ) : builds.length === 0 ? (
        <EmptyState
          icon={<Box size={24} />}
          title="No builds yet"
          description="Start a build for each model going through printing verification."
        />
      ) : (
        builds.map((b) => {
          const isOpen = openId === b.id;
          const d = editingId === b.id ? draft : null;
          const files = filesByBuild[b.id] ?? [];
          const plainFiles = files.filter((f) => !f.view);
          return (
            <div key={b.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap" }}>
              <button type="button"
                aria-expanded={isOpen} aria-controls={`build-${b.id}`}
                onClick={() => {
                  if (editingId && !cancelEdit()) return;
                  setOpenId(isOpen ? null : b.id);
                }}
                style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, flexWrap: "wrap", border: "none", background: "none", padding: 0, textAlign: "left", font: "inherit", cursor: "pointer" }}
              >
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>
                  {b.modelCode}
                </span>
                <Badge size="sm" tone={STATUS_TONE[b.status]} dot>{STATUS_LABEL[b.status]}</Badge>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  checklist {doneCount(b)}/{b.checklist.length}
                </span>
                {files.length > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    <Paperclip size={11} /> {files.length}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{memberName(b.ownerKey)}</span>
              </button>
              {!d && <Button id={`build-edit-${b.id}`} size="sm" variant="secondary" leftIcon={<Pencil size={13} />} disabled={!!pendingSync || editingId !== null} onClick={() => startEdit(b)}>Edit</Button>}
              <ActionsMenu label={`More actions for ${b.modelCode}`}>
                <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} disabled={editingId !== null} onClick={() => setConfirmDelete(b)}>Delete build</Button>
              </ActionsMenu>
              </div>

              {isOpen && (
                <div id={`build-${b.id}`} onKeyDown={(e) => { if (d) editorKeys(e, { history: editHistory, onSave: () => void saveEdit(b), onCancel: cancelEdit, busy }); }} className="sx-anim-view" style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {d && <EditorActions history={editHistory} onSave={() => void saveEdit(b)} onCancel={cancelEdit} busy={busy} />}
                  {/* ── Model name + status + actions (top) ── */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Model</span>
                    {d ? (
                      <Input
                        size="sm"
                        value={d.modelCode}
                        style={{ width: 230, fontFamily: "var(--font-mono)" }}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...d, modelCode: e.target.value })}
                        aria-label="Model code"
                      />
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>{b.modelCode}</span>
                    )}
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>Status</span>
                    {d ? (
                      <Select
                        size="sm"
                        value={d.status}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDraft({ ...d, status: e.target.value as BuildStatus })}
                        options={(Object.keys(STATUS_LABEL) as BuildStatus[]).map((st) => ({ value: st, label: STATUS_LABEL[st] }))}
                        style={{ width: 190 }}
                        aria-label="Build status"
                      />
                    ) : (
                      <Badge size="sm" tone={STATUS_TONE[b.status]} dot>{STATUS_LABEL[b.status]}</Badge>
                    )}
                    <span style={{ flex: 1 }} />
                  </div>

                  {/* ── Pictures ── */}
                  <div>
                    <div style={sectionLabel}>Pictures</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {VIEW_SLOTS.map(({ view, hint }) => {
                        const shots = files.filter((f) => f.view === view);
                        return (
                          <div key={view} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ width: 128, flexShrink: 0, paddingTop: 6 }}>
                              <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-default)" }}>{view}</div>
                              <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{hint}</div>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1 }}>
                              {shots.map((f) => (
                                <div key={f.id} style={{ position: "relative" }}>
                                  {imgUrls[f.id] ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={imgUrls[f.id]}
                                      alt={`${view} · ${f.fileName}`}
                                      role="button"
                                      onClick={() => openImage(f)}
                                      style={{ height: 96, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", cursor: "zoom-in", display: "block" }}
                                    />
                                  ) : (
                                    <div style={{ height: 96, width: 128, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "grid", placeItems: "center", color: "var(--text-subtle)", fontSize: "var(--text-2xs)", padding: 4, textAlign: "center" }}>
                                      {f.fileName.slice(0, 18)}
                                    </div>
                                  )}
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Delete picture"
                                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); setConfirmFile({ build: b, file: f }); } }}
                                    onClick={() => setConfirmFile({ build: b, file: f })}
                                    style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,.55)", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "grid", placeItems: "center", cursor: "pointer" }}
                                  >
                                    <Trash2 size={10} />
                                  </span>
                                </div>
                              ))}
                              {uploading?.view === view ? (
                                <div style={{ height: 96, width: 96, borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-strong)", display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: "var(--text-2xs)", gap: 4 }}>
                                  <Spinner size="sm" />
                                  {uploading.done}/{uploading.total}
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => pickFiles(b.id, view)}
                                    style={{ height: 96, width: 96, borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-strong)", background: "none", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--text-subtle)" }}
                                    aria-label={`Upload ${view}`}
                                  >
                                    <ImagePlus size={18} />
                                  </button>
                                  <button
                                    type="button"
                                    className="sx-mobile-only"
                                    onClick={() => pickCamera(b.id, view)}
                                    style={{ height: 96, width: 96, borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-strong)", background: "none", cursor: "pointer", alignItems: "center", justifyContent: "center", color: "var(--text-subtle)" }}
                                    aria-label={`Take ${view} photo`}
                                  >
                                    <Camera size={18} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Model spec (compact; editable in Edit mode) ── */}
                  <div>
                    <div style={sectionLabel}>Model spec</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10, maxWidth: 860 }}>
                      {Object.entries(d ? d.modelSpec : b.modelSpec).map(([section, params]) => (
                        <div key={section} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                          <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)", marginBottom: 6 }}>
                            {section}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {Object.entries(params).map(([param, value]) => (
                              <div key={param} style={{ display: "grid", gridTemplateColumns: "1fr 96px", alignItems: "center", gap: 6, minHeight: 26 }}>
                                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-default)" }}>{param}</span>
                                {d ? (
                                  <Input
                                    size="sm"
                                    value={value}
                                    placeholder="N/A"
                                    style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                      setDraft({ ...d, modelSpec: { ...d.modelSpec, [section]: { ...d.modelSpec[section], [param]: e.target.value } } })}
                                    aria-label={`${section} ${param}`}
                                  />
                                ) : (
                                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: value ? "var(--text-default)" : "var(--text-subtle)" }}>
                                    {value || "N/A"}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Verification checklist (editable in Edit mode) ── */}
                  <div>
                    <div style={sectionLabel}>Verification checklist</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(d ? d.checklist : b.checklist).map((item, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
                          <Checkbox
                            checked={item.done}
                            disabled={!d}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              if (!d) return;
                              setDraft({ ...d, checklist: d.checklist.map((c, j) => (j === i ? { ...c, done: e.target.checked } : c)) });
                            }}
                          />
                          {d ? (
                            <>
                              <Input
                                size="sm"
                                value={item.label}
                                style={{ flex: 1, maxWidth: 420 }}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setDraft({ ...d, checklist: d.checklist.map((c, j) => (j === i ? { ...c, label: e.target.value } : c)) })}
                                aria-label="Checklist item"
                              />
                              <Button size="sm" variant="ghost" iconOnly aria-label="Remove item"
                                onClick={() => {
                                  setDraft({ ...d, checklist: d.checklist.filter((_, j) => j !== i) });
                                  requestAnimationFrame(() => document.getElementById(`build-${b.id}`)?.querySelector<HTMLElement>('input[aria-label="Model code"]')?.focus({ preventScroll: true }));
                                }}>
                                <Trash2 size={13} />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: "var(--text-sm)", width: 268, textDecoration: item.done ? "line-through" : undefined, color: item.done ? "var(--text-muted)" : "var(--text-default)" }}>
                                {item.label}
                              </span>
                            </>
                          )}
                        </div>
                      ))}
                      {d && (
                        <div>
                          <Button size="sm" variant="ghost" leftIcon={<Plus size={13} />}
                            onClick={() => setDraft({ ...d, checklist: [...d.checklist, { label: "New item", done: false, note: "" }] })}>
                            Add item
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {!d && <div role="group" aria-label={`Next step for ${b.modelCode}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginRight: "auto" }}>After verification</span>
                        <Button size="sm" variant="secondary" leftIcon={<Boxes size={13} />}
                          title="Build records remain saved here; a separate part tracker is not connected"
                          disabled>
                          Part tracker not connected
                        </Button>
                        {/* Procurement 전환은 실험 accept 뒤 Experiments 탭에서 (2026-09-17 이동).
                            여기서는 검증 통과(Passed) 시 실험 단계로 보내는 버튼만 둔다.
                            체크리스트를 다 채우면 한 번에 Passed 처리 + 실험 이동 (2026-09-17 재지시:
                            "다 체크했는데 다음 단계 버튼이 없다" — 상태 수동 변경 요구를 없앤다). */}
                        {b.status !== "passed" && b.checklist.length > 0 && b.checklist.every((c) => c.done) && (
                          <Button size="sm" variant="primary" leftIcon={<Check size={13} />} loading={passingId === b.id}
                            title="Checklist complete — mark this build Passed and move on to Procurement"
                            onClick={() => void markPassed(b)}>
                            Mark passed → Procurement
                          </Button>
                        )}
                        {b.status === "passed" && onOpenExperiments && (
                          <Button size="sm" variant="primary" leftIcon={<FlaskConical size={13} />}
                            title="Verification passed — register parts and vendors next"
                            onClick={onOpenExperiments}>
                            Move to Procurement
                          </Button>
                        )}
                  </div>}

                  {/* ── Plain attachments ── */}
                  <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={sectionLabel}>Files</div>
                        <Button size="sm" variant="secondary" leftIcon={<Upload size={13} />} disabled={busy} onClick={() => pickFiles(b.id, "")}>Upload files</Button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {plainFiles.map((f) => (
                          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)" }}>
                            <Paperclip size={12} />
                            <button type="button" onClick={() => openFile(f)}
                              style={{ border: "none", background: "none", font: "inherit", padding: 0, cursor: "pointer", color: "var(--color-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
                              {f.fileName}
                            </button>
                            <Button size="sm" variant="ghost" iconOnly aria-label="Download" onClick={() => openFile(f)}>
                              <Download size={13} />
                            </Button>
                            <Button size="sm" variant="ghost" iconOnly aria-label="Delete file" onClick={() => setConfirmFile({ build: b, file: f })}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                  {/* ── Notes (editable in Edit mode) ── */}
                  <div>
                    <div style={sectionLabel}>Notes</div>
                    {d ? (
                      <Textarea
                        rows={3}
                        value={d.notes}
                        placeholder="Verification findings, remarks…"
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft({ ...d, notes: e.target.value })}
                      />
                    ) : b.notes ? (
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-default)", whiteSpace: "pre-wrap" }}>{b.notes}</div>
                    ) : (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>N/A</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New build"
        subtitle="Enter the model code to verify"
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button loading={busy} disabled={!newCode.trim()} onClick={createBuild}>Create</Button>
          </div>
        }
      >
        <Input
          placeholder="D-S-UC5.5-t0.4-thick"
          value={newCode}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCode(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) createBuild(); }}
        />
      </Modal>

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name ?? "Image"}
        size="lg"
      >
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.url}
            alt={preview.name}
            style={{ display: "block", maxWidth: "100%", maxHeight: "72vh", margin: "0 auto", borderRadius: "var(--radius-sm)" }}
          />
        )}
      </Modal>

      <Modal
        open={confirmFile !== null}
        onClose={() => setConfirmFile(null)}
        title={confirmFile?.file.view ? "Delete picture" : "Delete file"}
        subtitle={confirmFile?.file.fileName}
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setConfirmFile(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                const t = confirmFile;
                if (!t) return;
                act(async () => {
                  await deleteBuildFile(t.file);
                  await onLog(`Deleted ${t.file.view ? `${t.file.view} image` : "file"} \u201c${t.file.fileName}\u201d from \u201c${t.build.modelCode}\u201d.`);
                  setConfirmFile(null);
                });
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        This can’t be undone.
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete build"
        subtitle={confirmDelete?.modelCode}
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => {
              const b = confirmDelete;
              if (!b) return;
              act(async () => {
                await deleteBuild(b, filesByBuild[b.id] ?? []);
                await onLog(`Deleted build “${b.modelCode}”.`);
                setConfirmDelete(null);
              });
            }}>Delete</Button>
          </div>
        }
      >
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-default)" }}>
          This build and all of its files will be deleted. This can’t be undone.
        </span>
      </Modal>
    </div>
  );
}
