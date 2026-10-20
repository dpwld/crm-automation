import {readJson} from '@/lib/http';
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDraftHistory } from "@/lib/hooks/useDraftHistory";
import { ActionsMenu } from "./ActionsMenu";
import { EditorActions, editorKeys } from "./EditorActions";
import * as XLSX from "xlsx";
import {
  ChevronDown, ChevronRight, ExternalLink, FileSpreadsheet, FileText, Layers, Lock,
  Mail, Pencil, Plus, Send, Sparkles, Trash2, Upload,
} from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { Badge } from "@/components/ds/core/Badge";
import { Spinner } from "@/components/ds/core/Spinner";
import { Alert } from "@/components/ds/feedback/Alert";
import { Modal } from "@/components/ds/feedback/Modal";
import { EmptyState } from "@/components/ds/feedback/EmptyState";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Checkbox } from "@/components/ds/forms/Checkbox";
import { SpecSheet, type SpecSheetSection } from "@/components/ds/sheets/SpecSheet";
import type { Company } from "@/types/domain";

import { exportSpecToPdf, exportSpecToXlsx, type ConfidentialRow } from "@/lib/export/specSheetExport";
import { insertBuild } from "@/lib/data/builds";
import {
  buildTitle, deleteSpecBuild, deleteSpecVersion, fetchSpecBuilds,
  insertSpecBuild, insertSpecVersion, specVersionTemplate,
  updateSpecBuild, updateSpecVersion, type SpecBuild, type SpecVersion, type SpecVersionRow,
} from "@/lib/data/specBuilds";
import {
  DEAL_KIND_LABEL, DEAL_STATUS_LABEL, advanceDeal, deleteDeal, fetchDealSummaries, insertDeal, updateDeal,
  type DealKind, type DealSummary,
} from "@/lib/data/deals";
import { DealDrawer } from "./DealDrawer";
import { SpecRequestsPanel } from "./spec-requests/SpecRequestsPanel";
import { FormField } from "@/components/ds/forms/FormField";
import { TEAM_MEMBERS } from "@/lib/mock/team";

/* Spec sheet 빌드/버전 패널 — 두 모드.
   In-house(기본): New build로 빌드를 쌓고 빌드 안에 버전이 산다 (기존 그대로).
   dealMode(고객사): CRM에서 확정된 딜이 최상위 카드가 되고, 딜 안에서 "파트"
   (버전과 같은 spec 스냅샷, 단어만 part)로 나뉜다 — spec_builds.deal_id로 연결.
   Confidential rows은 버전/파트에만 존재 — Send to CRM에서 자동 제외된다. */

const LABEL_PRESETS = ["Customer initial request", "Interim review", "Final spec"];

/** 버전 행 → SpecSheet 섹션 + (섹션,행) → rows 배열 인덱스 맵 (편집 반영용).
   skipConfidential이면 극비 행을 표시(및 편집)에서 제외한다 — map은 원본 인덱스 유지. */
function sectionsWithMap(rows: SpecVersionRow[], skipConfidential = false): { sections: SpecSheetSection[]; map: number[][] } {
  const order = rows.map((_, i) => i).sort((a, b) => rows[a].sort - rows[b].sort);
  const sections: SpecSheetSection[] = [];
  const map: number[][] = [];
  const secIdx = new Map<string, number>();
  for (const i of order) {
    const r = rows[i];
    if (skipConfidential && r.confidential) continue;
    let si = secIdx.get(r.section);
    if (si == null) {
      si = sections.length;
      secIdx.set(r.section, si);
      sections.push({
        name: r.confidential ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Lock size={12} /> {r.section} <span style={{ fontWeight: 400, fontSize: "var(--text-2xs)", color: "var(--red-600, #dc2626)" }}>confidential · not sent to CRM</span>
          </span>
        ) : r.section,
        rows: [],
      });
      map.push([]);
    }
    const row: Record<string, unknown> = { columnLabels:r.columnLabels, param: r.parameter, symbol: r.symbol || undefined, unit: r.unit || undefined };
    if (r.isText) row.text = true;
    if (r.merged) { row.merged = true; row.value = r.value; }
    else { row.hot = r.valueHot; row.cold = r.valueCold; }
    sections[si].rows.push(row as SpecSheetSection["rows"][number]);
    map[si].push(i);
  }
  return { sections, map };
}

/** Export 입력 분리 — Saved sections + 극비 행. */
function splitForExport(rows: SpecVersionRow[]): { sections: SpecSheetSection[]; confidential: ConfidentialRow[] } {
  const std = rows.filter((r) => !r.confidential);
  const conf = rows.filter((r) => r.confidential);
  return {
    sections: sectionsWithMap(std).sections,
    confidential: conf.map((r) => ({ p: r.parameter, s: r.symbol, u: r.unit, v: r.merged ? r.value : `${r.valueHot} / ${r.valueCold}` })),
  };
}

interface ExtractResult {
  values: { parameter: string; value: string; valueHot: string; valueCold: string }[];
  suggestedLabel: string;
  notes: string[];
}

/** 추출 결과를 행에 얹었을 때의 변경 목록 (리뷰 모달 표시용). */
function extractDiff(rows: SpecVersionRow[], res: ExtractResult): { idx: number; from: string; to: string }[] {
  const byParam = new Map(res.values.map((v) => [v.parameter.trim().toLowerCase(), v]));
  const out: { idx: number; from: string; to: string }[] = [];
  rows.forEach((r, idx) => {
    const v = byParam.get(r.parameter.trim().toLowerCase());
    if (!v) return;
    const to = r.merged ? v.value : `${v.valueHot} / ${v.valueCold}`.replace(/^ \/ $/, "");
    const toHas = r.merged ? v.value.trim() : (v.valueHot.trim() || v.valueCold.trim());
    if (!toHas) return;
    const from = r.merged ? r.value : `${r.valueHot} / ${r.valueCold}`;
    if (from === to) return;
    out.push({ idx, from, to });
  });
  return out;
}

function applyExtract(rows: SpecVersionRow[], res: ExtractResult): SpecVersionRow[] {
  const byParam = new Map(res.values.map((v) => [v.parameter.trim().toLowerCase(), v]));
  return rows.map((r) => {
    const v = byParam.get(r.parameter.trim().toLowerCase());
    if (!v) return r;
    if (r.merged) return v.value.trim() ? { ...r, value: v.value } : r;
    if (!v.valueHot.trim() && !v.valueCold.trim()) return r;
    return { ...r, valueHot: v.valueHot.trim() ? v.valueHot : r.valueHot, valueCold: v.valueCold.trim() ? v.valueCold : r.valueCold };
  });
}

function fmtDate(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

export function SpecBuildsPanel({
  company,
  meId,
  dealMode = false,
  hideConfidential = false,
  specRequestId,
  onQuotationFromSpec,
  onSelectDeal,
  onLog,
  onSelectVersion,
  onPvBuildCreated,
}: {
  company: Company;
  meId: string;
  /** 고객사 모드 — 딜이 최상위, 버전 대신 "파트". In-house는 false(빌드 그대로). */
  dealMode?: boolean;
  /** CRM 메뉴 표시용 — Confidential rows을 화면·Export에서 숨긴다. */
  hideConfidential?: boolean;
  specRequestId?: string | null;
  /** (CRM) final 파트 spec으로 견적 초안 생성 — 그 파트의 딜이 자동 연결된다. */
  onQuotationFromSpec?: (sections: SpecSheetSection[], dealId?: string) => void;
  /** 선택된 딜 변경 — 상단 스테퍼·우측 Details의 딜 스테이지가 이걸 따른다. */
  onSelectDeal?: (deal: DealSummary | null) => void;
  /** 활동 로그 — targetId를 주면 그 버전 스코프 기록이 된다. */
  onLog: (summary: string, targetId?: string | null) => Promise<void>;
  /** 버전 선택 변경 — 우측 기록 패널의 스코프를 바꾼다. */
  onSelectVersion: (v: { id: string; label: string } | null) => void;
  /** Printing verification 빌드 자동 생성 후 builds 갱신. */
  onPvBuildCreated: (buildId: string) => Promise<void>;
  /** CRM 전송 후 CRM spec sheet 데이터 갱신. */
}) {
  const [loading, setLoading] = useState(true);
  const [builds, setBuilds] = useState<SpecBuild[]>([]);
  const [versions, setVersions] = useState<SpecVersion[]>([]);
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [openBuildId, setOpenBuildId] = useState<string | null>(null);
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [requestContext, setRequestContext] = useState<{ dealId: string | null } | null>(null);
  const [drawerDealId, setDrawerDealId] = useState<string | null>(null);
  const [openVersionId, setOpenVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 편집 모드 — 열려 있는 버전의 rows 사본을 들고 있다가 Save에서만 저장.
  const [editRows, setEditRows, editHistory] = useDraftHistory<SpecVersionRow[] | null>(null);
  const editOpener = useRef<HTMLElement | null>(null);

  // 버전 추가 모달
  const [addVersion, setAddVersion] = useState<{ buildId: string; label: string; copyFrom: boolean } | null>(null);
  // 딜 생성 모달 (dealMode — spec sheet 안에서 바로 딜을 연다)
  const [newDeal, setNewDeal] = useState<{ kind: DealKind; title: string; ownerKey: string } | null>(null);
  const [dealSaving, setDealSaving] = useState(false);
  // 삭제 확인
  const [confirmDel, setConfirmDel] = useState<{ kind: "build"; build: SpecBuild } | { kind: "version"; version: SpecVersion } | { kind: "deal"; deal: DealSummary; build: SpecBuild | null } | null>(null);
  // 이름 변경 (빌드 name / 버전 label)
  const [rename, setRename] = useState<{ kind: "build" | "version" | "deal"; id: string; value: string } | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);

  // AI 업로드 — 파일 선택 → (톱레벨이면 대상 선택) → 추출 → 리뷰 → 적용
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<SpecVersion | "pick" | null>(null);
  const [pick, setPick] = useState<{ file: File; buildId: string; mode: "new" | "existing"; versionId: string; label: string } | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);
  const [reviewX, setReviewX] = useState<{ target: { versionId: string | null; buildId: string | null; label: string; copyRows: SpecVersionRow[] }; res: ExtractResult; diffs: { idx: number; from: string; to: string }[] } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchSpecBuilds(company.id),
      dealMode ? fetchDealSummaries(company.id) : Promise.resolve([] as DealSummary[]),
    ])
      .then(([d, ds]) => {
        if (!alive) return;
        setBuilds(d.builds);
        setVersions(d.versions);
        setDeals(ds);
        if (dealMode && ds.length > 0) setOpenDealId((cur) => cur ?? ds[0].id);
        else if (d.builds.length > 0) setOpenBuildId((cur) => cur ?? d.builds[0].id);
      })
      .catch((err) => {
        console.error("spec builds load failed:", err);
        if (alive) setError("Failed to load spec builds. Run db/migrations/2026-08-21_eng_crm_pipeline.sql if the tables are missing.");
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [company.id, dealMode]);

  /** 용어 통일 — 화면에서는 어디서나 build=deal, version=part로 부른다. */
  const NOUN = "part";

  /** CRM 화면 파트 필터 — 고객 초기요청(빌드의 첫 파트)과 확정본(final/파트코드
     발급분)만 보인다. Engineering의 중간 과정 파트는 CRM에 노출하지 않는다. */
  function visibleVersions(vs: SpecVersion[]): SpecVersion[] {
    if (!hideConfidential) return vs;
    return vs.filter((v, i) => i === 0 || v.isFinal || !!v.partNo);
  }

  const versionsByBuild = useMemo(() => {
    const m: Record<string, SpecVersion[]> = {};
    for (const v of versions) (m[v.buildId] ??= []).push(v);
    return m;
  }, [versions]);

  function fail(msg: string, err: unknown) {
    console.error(msg, err);
    setError(msg);
  }

  function selectVersion(v: SpecVersion | null) {
    if (busy === "save") return false;
    if (editRows && editHistory.dirty && !window.confirm("Discard unsaved changes to this spec?")) return false;
    setOpenVersionId(v?.id ?? null);
    editHistory.reset(null);
    if (!v) {
      // 파트를 닫으면 열려 있는 딜 스코프로 복귀 (dealMode) — 없으면 탭 전체.
      const openDeal = dealMode && openDealId ? deals.find((d) => d.id === openDealId) : null;
      onSelectVersion(openDeal ? { id: openDeal.id, label: openDeal.dealNo } : null);
      onSelectDeal?.(openDeal ?? null);
      return true;
    }
    const b = builds.find((x) => x.id === v.buildId) ?? null;
    const deal = b?.dealId ? deals.find((d) => d.id === b.dealId) : null;
    onSelectVersion({ id: v.id, label: `${deal ? deal.dealNo : b ? buildTitle(b) : "Deal #?"} · ${v.label}` });
    if (deal) onSelectDeal?.(deal);
    return true;
  }

  /** 딜 카드 접기/펼치기 — 우측 기록 스코프·상단 스테퍼·Details 딜 스테이지가 그 딜을 따른다. */
  function toggleDeal(deal: DealSummary, open: boolean) {
    if (editRows && !cancelSpecEdits()) return;
    setOpenDealId(open ? null : deal.id);
    setOpenVersionId(null);
    editHistory.reset(null);
    onSelectVersion(open ? null : { id: deal.id, label: deal.dealNo });
    onSelectDeal?.(open ? null : deal);
  }

  /** 빌드 name / 버전 label 저장. */
  async function saveRename() {
    if (!rename) return;
    if (rename.kind !== "deal" && !rename.value.trim()) return; // 빌드/파트 이름은 비울 수 없음
    setRenameSaving(true);
    try {
      if (rename.kind === "build") {
        const saved = await updateSpecBuild(rename.id, { name: rename.value.trim() });
        setBuilds((list) => list.map((b) => (b.id === saved.id ? saved : b)));
        await onLog(`Deal renamed to "${saved.name}".`);
      } else if (rename.kind === "deal") {
        const saved = await updateDeal(rename.id, { title: rename.value.trim() });
        setDeals((list) => list.map((d) => (d.id === saved.id ? { ...d, title: saved.title } : d)));
        await onLog(`Deal renamed to "${saved.title}".`);
      } else {
        const saved = await updateSpecVersion(rename.id, { label: rename.value.trim() });
        setVersions((list) => list.map((v) => (v.id === saved.id ? saved : v)));
        await onLog(`Part renamed to "${saved.label}".`, saved.id);
      }
      setRename(null);
    } catch (err) {
      console.error("rename failed:", err);
      setError("Rename failed. Run db/migrations/2026-08-21e_spec_build_name.sql if the name column is missing.");
      setRename(null);
    } finally {
      setRenameSaving(false);
    }
  }

  async function newBuild() {
    setBusy("new-build");
    try {
      const no = builds.reduce((a, b) => Math.max(a, b.buildNo), 0) + 1;
      const build = await insertSpecBuild(company.id, no, meId);
      const version = await insertSpecVersion(build.id, LABEL_PRESETS[0], specVersionTemplate(), 0, meId);
      setBuilds((prev) => [build, ...prev]);
      setVersions((prev) => [...prev, version]);
      setOpenBuildId(build.id);
      selectVersion(version);
      await onLog(`Deal #${no} created (with "${version.label}").`);
    } catch (err) {
      fail("Failed to create the deal.", err);
    } finally {
      setBusy(null);
    }
  }

  /** spec sheet 안 New deal — 만들면 목록 맨 위에 카드로 열린다. */
  async function submitNewDeal() {
    if (!newDeal) return;
    setDealSaving(true);
    try {
      const saved = await insertDeal({
        kind: newDeal.kind, companyId: company.id, partyCode: company.partyCode,
        title: newDeal.title.trim(), ownerKey: newDeal.ownerKey,
      }, meId);
      const summary = { ...saved, partCount: 0, vendorPoCount: 0, docCounts: {}, quoteTotal: null, quoteCurrency: "USD", invoiceTotal: null, invoiceCurrency: "USD" };
      setDeals((prev) => [summary, ...prev]);
      setOpenDealId(saved.id);
      onSelectDeal?.(summary);
      setNewDeal(null);
      await onLog(`Deal ${saved.dealNo} created · "${saved.title}".`, saved.id);
    } catch (err) {
      fail("Failed to create the deal.", err);
    } finally {
      setDealSaving(false);
    }
  }

  async function createRequestTarget(dealId: string, title: string, label: string): Promise<string> {
    let deal = deals.find((d) => d.id === dealId);
    if (!deal) {
      if (dealId) throw new Error("This deal is no longer available. Refresh and try again.");
      const saved = await insertDeal({ kind: "new", companyId: company.id, partyCode: company.partyCode, title: title.trim(), ownerKey: meId }, meId);
      deal = { ...saved, partCount: 0, vendorPoCount: 0, docCounts: {}, quoteTotal: null, quoteCurrency: "USD", invoiceTotal: null, invoiceCurrency: "USD" };
      setDeals((prev) => [deal!, ...prev]);
    }
    let build = builds.find((b) => b.dealId === deal!.id);
    if (build && versions.some((v) => v.buildId === build!.id)) throw new Error("This deal already has an initial part. Select it from the list.");
    if (!build) {
      build = await insertSpecBuild(company.id, builds.reduce((n, b) => Math.max(n, b.buildNo), 0) + 1, meId, deal.id);
      setBuilds((prev) => [build!, ...prev]);
    }
    const part = await insertSpecVersion(build.id, label.trim(), specVersionTemplate(), 0, meId);
    setVersions((prev) => [...prev, part]);
    setOpenDealId(deal.id);
    await onLog(`Customer requirement part "${part.label}" created.`, part.id);
    return part.id;
  }

  // 파트 드래그 이동 — 드롭 대상 딜 하이라이트
  const [dragPartId, setDragPartId] = useState<string | null>(null);
  const [overDropDealId, setOverDropDealId] = useState<string | null>(null);

  /** 파트를 다른 딜로 이동 — 대상 딜의 spec 컨테이너가 없으면 만들어 연결한다. */
  async function movePartToDeal(versionId: string, target: DealSummary) {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    const srcBuild = builds.find((b) => b.id === v.buildId);
    if (srcBuild?.dealId === target.id) return;
    setBusy("move-part");
    try {
      let tb = builds.find((b) => b.dealId === target.id);
      if (!tb) {
        const no = builds.reduce((a, x) => Math.max(a, x.buildNo), 0) + 1;
        tb = await insertSpecBuild(company.id, no, meId, target.id);
        setBuilds((prev) => [tb!, ...prev]);
      }
      const sort = (versionsByBuild[tb.id] ?? []).length;
      const saved = await updateSpecVersion(versionId, { buildId: tb.id, sort });
      setVersions((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      setOpenDealId(target.id);
      await onLog(`Part "${v.label}" moved to ${target.dealNo}.`, target.id);
    } catch (err) {
      fail("Failed to move the part.", err);
    } finally {
      setBusy(null);
      setDragPartId(null);
      setOverDropDealId(null);
    }
  }

  /** 딜에 파트 추가 — 딜의 spec 컨테이너(spec_build)가 없으면 만들어 연결한 뒤 모달을 연다. */
  async function addPartToDeal(deal: DealSummary) {
    // CRM에서는 고객 초기요청(첫 파트)만 — 이후 파트는 Engineering 담당 (안내만 띄운다).
    if (hideConfidential) {
      const existing = builds.find((x) => x.dealId === deal.id);
      if (existing && (versionsByBuild[existing.id] ?? []).length > 0) {
        setError("CRM creates the customer's initial request. Interim and final engineering review requires a separate engineering service, which is not connected.");
        return;
      }
    }
    let b = builds.find((x) => x.dealId === deal.id);
    if (!b) {
      setBusy("new-build");
      try {
        const no = builds.reduce((a, x) => Math.max(a, x.buildNo), 0) + 1;
        b = await insertSpecBuild(company.id, no, meId, deal.id);
        setBuilds((prev) => [b!, ...prev]);
      } catch (err) {
        fail("Failed to start this deal's spec. Run db/migrations/2026-09-02_spec_build_deal.sql if deal_id is missing.", err);
        return;
      } finally {
        setBusy(null);
      }
    }
    const vs = versionsByBuild[b.id] ?? [];
    setAddVersion({ buildId: b.id, label: "", copyFrom: vs.length > 0 });
  }

  async function submitAddVersion() {
    if (!addVersion) return;
    const { buildId, label, copyFrom } = addVersion;
    setAddVersion(null);
    setBusy("add-version");
    try {
      const siblings = versionsByBuild[buildId] ?? [];
      const base = copyFrom && siblings.length > 0 ? siblings[siblings.length - 1].rows : specVersionTemplate();
      const version = await insertSpecVersion(buildId, label.trim() || "Draft", base.map((r) => ({ ...r })), siblings.length, meId);
      setVersions((prev) => [...prev, version]);
      selectVersion(version);
      const no = builds.find((b) => b.id === buildId)?.buildNo;
      await onLog(`Part "${version.label}" added to deal #${no}.`, version.id);
    } catch (err) {
      fail("Failed to add the part.", err);
    } finally {
      setBusy(null);
    }
  }

  function cancelSpecEdits() {
    if (busy === "save") return false;
    if (editHistory.dirty && !window.confirm("Discard unsaved changes to this spec?")) return false;
    editHistory.reset(null);
    requestAnimationFrame(() => (editOpener.current?.isConnected ? editOpener.current : document.getElementById(`spec-edit-${openVersionId}`))?.focus());
    return true;
  }

  async function saveEdits(version: SpecVersion) {
    if (!editRows || busy === "save") return;
    setBusy("save");
    try {
      const saved = await updateSpecVersion(version.id, { rows: editRows });
      setVersions((prev) => prev.map((v) => (v.id === saved.id ? saved : v)));
      editHistory.reset(null);
      requestAnimationFrame(() => (editOpener.current?.isConnected ? editOpener.current : document.getElementById(`spec-edit-${version.id}`))?.focus());
      await onLog(`Spec "${version.label}" values updated.`, version.id);
    } catch (err) {
      fail("Failed to save the version.", err);
    } finally {
      setBusy(null);
    }
  }

  /** 최종 spec(=CRM에서는 Accept) 표시 — 같은 딜의 다른 파트 final은 해제한다.
     첫 확정 때 파트 코드 `{딜번호}-n`(FER-2026-001-1)을 발급하며, 해제해도 코드는 유지.
     CRM에서 Accept하면 Engineering으로 인계되고, 연결된 딜이 Spec→Quoting으로 넘어간다. */
  async function markFinal(version: SpecVersion, on: boolean) {
    setBusy(`final-${version.id}`);
    try {
      // 파트 코드는 Engineering의 Mark final에서만 발급된다 — CRM Accept는 인계만 (대표 확정 2026-09-03).
      let partNo = "";
      if (on && !version.partNo && !hideConfidential) {
        const b = builds.find((x) => x.id === version.buildId);
        const deal = b?.dealId ? deals.find((d) => d.id === b.dealId) : null;
        if (deal?.dealNo) {
          const sibs = versionsByBuild[version.buildId] ?? [];
          const used = new Set(sibs
            .filter((v) => v.partNo.startsWith(`${deal.dealNo}-`))
            .map((v) => parseInt(v.partNo.slice(deal.dealNo.length + 1), 10))
            .filter((n) => !Number.isNaN(n)));
          let n = 1;
          while (used.has(n)) n++;
          partNo = `${deal.dealNo}-${n}`;
        }
      }
      // Unmark 시 파트코드 반납(Engineering에서만) — 같은 딜의 다음 확정이 그 번호를 이어받는다.
      const saved = await updateSpecVersion(version.id, {
        isFinal: on,
        ...(partNo ? { partNo } : {}),
        ...(!on && version.partNo && !hideConfidential ? { partNo: "" } : {}),
      });
      const others = on ? (versionsByBuild[version.buildId] ?? []).filter((v) => v.id !== version.id && v.isFinal) : [];
      await Promise.all(others.map((v) => updateSpecVersion(v.id, { isFinal: false })));
      setVersions((prev) => prev.map((v) =>
        v.id === saved.id ? saved : others.some((o) => o.id === v.id) ? { ...v, isFinal: false } : v));
      if (!on && version.partNo && !hideConfidential) {
        await onLog(`Part code ${version.partNo} released from "${version.label}" · reusable by the next final.`, version.id);
      }
      if (on) {
        if (partNo) await onLog(`Part code ${partNo} assigned to "${version.label}".`, version.id);
        if (hideConfidential) {
          await onLog(`"${version.label}" accepted · handed off to Engineering.`, version.id);
          const b = builds.find((x) => x.id === version.buildId);
          const deal = b?.dealId ? deals.find((d) => d.id === b.dealId) : null;
          if (deal && deal.status === "spec") {
            const savedDeal = await updateDeal(deal.id, { status: "quoting" });
            setDeals((prev) => prev.map((d) => (d.id === savedDeal.id ? { ...d, ...savedDeal } : d)));
            if (openDealId === deal.id) onSelectDeal?.({ ...deal, ...savedDeal });
            await onLog(`Deal ${deal.dealNo} moved to Quoting.`, deal.id);
          }
        } else {
          await onLog(`"${version.label}" marked as the final spec.`, version.id);
        }
      }
    } catch (err) {
      fail("Failed to update the final flag. Run db/migrations/2026-09-02c_spec_version_part_no.sql if part_no is missing.", err);
    } finally {
      setBusy(null);
    }
  }

  /** 드로어에서 링크/상태/삭제가 바뀐 뒤 전체 갱신. */
  async function reloadAll() {
    try {
      const [d, ds] = await Promise.all([
        fetchSpecBuilds(company.id),
        dealMode ? fetchDealSummaries(company.id) : Promise.resolve([] as DealSummary[]),
      ]);
      setBuilds(d.builds);
      setVersions(d.versions);
      setDeals(ds);
    } catch (err) {
      console.error("reload failed:", err);
    }
  }

  async function confirmDelete() {
    if (!confirmDel) return;
    const target = confirmDel;
    setConfirmDel(null);
    try {
      if (target.kind === "deal") {
        // 딜 + 그 spec 컨테이너(파트들 cascade) 삭제 — 번호는 비어서 다음 New deal이 이어 쓴다.
        if (target.build) {
          await deleteSpecBuild(target.build.id);
          setBuilds((prev) => prev.filter((b) => b.id !== target.build!.id));
          setVersions((prev) => prev.filter((v) => v.buildId !== target.build!.id));
        }
        await deleteDeal(target.deal.id);
        setDeals((prev) => prev.filter((d) => d.id !== target.deal.id));
        if (openDealId === target.deal.id) {
          setOpenDealId(null);
          setOpenVersionId(null);
          editHistory.reset(null);
          onSelectVersion(null);
          onSelectDeal?.(null);
        }
        await onLog(`Deal ${target.deal.dealNo} deleted. Its number is freed for the next deal.`);
        return;
      }
      if (target.kind === "build") {
        await deleteSpecBuild(target.build.id);
        setBuilds((prev) => prev.filter((b) => b.id !== target.build.id));
        setVersions((prev) => prev.filter((v) => v.buildId !== target.build.id));
        if (openBuildId === target.build.id) setOpenBuildId(null);
        selectVersion(null);
        await onLog(`Deal #${target.build.buildNo} deleted.`);
      } else {
        await deleteSpecVersion(target.version.id);
        setVersions((prev) => prev.filter((v) => v.id !== target.version.id));
        if (openVersionId === target.version.id) selectVersion(null);
        await onLog(`Part "${target.version.label}" deleted.`);
      }
    } catch (err) {
      fail("Failed to delete.", err);
    }
  }

  /** 최종 spec → Printing verification 빌드 자동 생성 (모델 스펙 프리필). */
  async function createPvBuild(version: SpecVersion) {
    setBusy(`pv-${version.id}`);
    try {
      const modelSpec: Record<string, Record<string, string>> = {};
      for (const row of version.rows) (modelSpec[row.section] ??= {})[row.parameter] = row.merged ? row.value : `${row.valueHot} / ${row.valueCold}`;
      const vBuild = builds.find((b) => b.id === version.buildId);
      const vDeal = vBuild?.dealId ? deals.find((d) => d.id === vBuild.dealId) : null;
      const modelCode = vDeal
        ? `${vDeal.dealNo} · ${version.label}`
        : `${company.ref || company.name} · Spec B${vBuild?.buildNo ?? "?"} ${version.label}`;
      const printingBuild = await insertBuild(company.id, modelCode, meId, modelSpec, { dealId: vDeal?.id ?? null, specVersionId: version.id });
      await onLog(`Printing verification opened from final spec "${version.label}" (${modelCode}).`, version.id);
      // 인쇄검증 시작 = 딜이 Manufacturing 단계로 — 상단 스테퍼가 따라온다.
      if (vDeal) {
        const adv = await advanceDeal(vDeal.id, "manufacturing");
        if (adv) {
          setDeals((prev) => prev.map((d) => (d.id === adv.id ? { ...d, ...adv } : d)));
          if (openDealId === vDeal.id) onSelectDeal?.({ ...vDeal, ...adv });
          await onLog(`Deal ${vDeal.dealNo} moved to Manufacturing (printing verification started).`, vDeal.id);
        }
      }
      await onPvBuildCreated(printingBuild.id);
    } catch (err) {
      fail("Failed to create the printing-verification build.", err);
    } finally {
      setBusy(null);
    }
  }

  // ── AI 업로드 ──────────────────────────────────────────────────────────────
  function pickFile(target: SpecVersion | "pick") {
    uploadTarget.current = target;
    fileRef.current?.click();
  }

  async function onFile(file: File) {
    const target = uploadTarget.current;
    uploadTarget.current = null;
    if (!target) return;
    if (target === "pick") {
      const firstBuild = builds[0]?.id ?? "";
      setPick({ file, buildId: firstBuild || "__new__", mode: "new", versionId: "", label: "" });
      return;
    }
    await runExtract(file, { versionId: target.id, buildId: target.buildId, label: target.label, copyRows: target.rows });
  }

  async function runExtract(file: File, target: { versionId: string | null; buildId: string | null; label: string; copyRows: SpecVersionRow[] }) {
    if (file.size > 15 * 1024 * 1024) { setError("File too big. Keep it under 15MB."); return; }
    setExtractBusy(true);
    setError(null);
    try {
      // 엑셀/CSV는 모델이 바이너리로 못 읽으므로 시트를 CSV 텍스트로 변환해 보낸다
      // (2026-09-28 "import from excel sheet 작동 안 됨" — PDF로 위장 전송되던 버그).
      const isSheet = /\.(xlsx|xls|csv)$/i.test(file.name) || /spreadsheet|ms-excel|csv/i.test(file.type);
      let textContent = "";
      let dataBase64 = "";
      if (isSheet) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        textContent = wb.SheetNames
          .map((n) => `# Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`)
          .join("\n\n")
          .slice(0, 150_000);
      } else {
        dataBase64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
          fr.onerror = () => reject(new Error("file read failed"));
          fr.readAsDataURL(file);
        });
      }
      const res = await fetch("/api/spec-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          dataBase64,
          textContent,
          parameters: target.copyRows.map((r) => ({ parameter: r.parameter, symbol: r.symbol, unit: r.unit, columns:r.columnLabels, sides: r.merged ? "merged" : "columns" })),
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      const result = json as ExtractResult;
      setReviewX({ target, res: result, diffs: extractDiff(target.copyRows, result) });
    } catch (err) {
      fail("AI extraction failed.", err);
    } finally {
      setExtractBusy(false);
    }
  }

  async function applyReview() {
    if (!reviewX) return;
    const { target, res } = reviewX;
    setReviewX(null);
    setBusy("apply-extract");
    try {
      const nextRows = applyExtract(target.copyRows, res);
      if (target.versionId) {
        const saved = await updateSpecVersion(target.versionId, { rows: nextRows });
        setVersions((prev) => prev.map((v) => (v.id === saved.id ? saved : v)));
        selectVersion(saved);
        await onLog(`Spec "${saved.label}" filled from AI upload.`, saved.id);
      } else {
        // 신규 빌드/버전 생성 경로
        let buildId = target.buildId;
        let buildNo: number | undefined;
        if (!buildId) {
          const no = builds.reduce((a, b) => Math.max(a, b.buildNo), 0) + 1;
          const build = await insertSpecBuild(company.id, no, meId);
          setBuilds((prev) => [build, ...prev]);
          buildId = build.id;
          buildNo = no;
          setOpenBuildId(build.id);
        } else {
          buildNo = builds.find((b) => b.id === buildId)?.buildNo;
        }
        const siblings = versionsByBuild[buildId] ?? [];
        const label = target.label.trim() || res.suggestedLabel.trim() || "AI import";
        const version = await insertSpecVersion(buildId, label, nextRows, siblings.length, meId);
        setVersions((prev) => [...prev, version]);
        selectVersion(version);
        await onLog(`Part "${label}" created from AI upload (deal #${buildNo}).`, version.id);
      }
    } catch (err) {
      fail("Failed to apply the extracted values.", err);
    } finally {
      setBusy(null);
    }
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  /** 버전/파트 카드 하나 — 딜 카드와 빌드 카드가 공용으로 쓴다 (단어만 NOUN). */
  const versionCard = (version: SpecVersion) => {
    const isOpen = openVersionId === version.id;
    const rows = isOpen && editRows ? editRows : version.rows;
    const { sections, map } = sectionsWithMap(rows, hideConfidential);
    const display = sections;
    return (
      <div key={version.id}
        draggable={dealMode && !editRows}
        onDragStart={dealMode ? (e: React.DragEvent) => {
          e.dataTransfer.setData("text/spec-part", version.id);
          e.dataTransfer.effectAllowed = "move";
          setTimeout(() => setDragPartId(version.id), 0);
        } : undefined}
        onDragEnd={dealMode ? () => { setDragPartId(null); setOverDropDealId(null); } : undefined}
        title={dealMode ? "Drag onto another deal card to move this part" : undefined}
        style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, opacity: dragPartId === version.id ? 0.4 : 1, ...(dealMode ? { cursor: "grab" } : {}) }}>
        {/* 버전/파트 행 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={`spec-${version.id}`}
            onClick={() => selectVersion(isOpen ? null : version)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "none", background: "none", cursor: "pointer", padding: 0, font: "inherit" }}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--text-strong)" }}>{version.label}</span>
          </button>
          {version.partNo && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--color-primary)" }}>
              {version.partNo}
            </span>
          )}
          <Badge tone={version.isFinal ? "success" : "neutral"} size="sm">{version.isFinal ? (hideConfidential ? "Accepted" : "Final spec") : "Needs review"}</Badge>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{fmtDate(version.createdAt)}</span>
          <span style={{ flex: 1 }} />
          {!(isOpen && editRows) && (
            <Button id={`spec-edit-${version.id}`} variant="secondary" size="sm" leftIcon={<Pencil size={13} />} disabled={editRows !== null}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (!selectVersion(version)) return;
                editOpener.current = e.currentTarget;
                editHistory.reset(version.rows.map((row) => ({ ...row })));
                requestAnimationFrame(() => document.getElementById(`spec-${version.id}`)?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus());
              }}>
              Edit
            </Button>
          )}
          <ActionsMenu label={`Actions for ${version.label}`}>
            <Button disabled={editRows !== null} variant="ghost" size="sm" leftIcon={<FileSpreadsheet size={14} />} style={{ justifyContent: "flex-start" }}
              title="Export Excel (.xlsx) · confidential rows are never exported"
              onClick={() => { const x = splitForExport(version.rows); void exportSpecToXlsx(company, x.sections, { confidential: [] }); }}>
              Export Excel
            </Button>
            <Button disabled={editRows !== null} variant="ghost" size="sm" leftIcon={<FileText size={14} />} style={{ justifyContent: "flex-start" }}
              title="Export PDF (print) · confidential rows are never exported"
              onClick={() => { const x = splitForExport(version.rows); exportSpecToPdf(company, x.sections, { confidential: [] }); }}>
              Export PDF
            </Button>
            <Button disabled={editRows !== null} variant="ghost" size="sm" leftIcon={<Upload size={14} />} style={{ justifyContent: "flex-start" }}
              title={`AI upload. Fill this ${NOUN} from a document`} onClick={() => pickFile(version)}>
              Import spec (AI)
            </Button>
            <Button disabled={editRows !== null} variant="ghost" size="sm" leftIcon={<Pencil size={14} />} style={{ justifyContent: "flex-start" }}
              onClick={() => setRename({ kind: "version", id: version.id, value: version.label })}>
              Rename {NOUN}
            </Button>
            {version.isFinal && (
              <Button disabled={editRows !== null} variant="ghost" size="sm" loading={busy === `final-${version.id}`} style={{ justifyContent: "flex-start" }}
                onClick={() => void markFinal(version, false)}>
                {hideConfidential ? "Undo acceptance" : "Unmark final"}
              </Button>
            )}
            <Button disabled={editRows !== null} variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} style={{ justifyContent: "flex-start", color: "var(--red-600, #dc2626)" }}
              onClick={() => setConfirmDel({ kind: "version", version })}>
              Delete {NOUN}
            </Button>
          </ActionsMenu>
        </div>

        {/* 펼친 버전/파트 — spec sheet + Edit/Save */}
        {isOpen && (
          <div id={`spec-${version.id}`} onKeyDown={(e) => { if (editRows) editorKeys(e, { history: editHistory, onSave: () => void saveEdits(version), onCancel: cancelSpecEdits, busy: busy === "save" }); }} style={{ borderTop: "1px solid var(--border-subtle)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {editRows && <EditorActions history={editHistory} onSave={() => void saveEdits(version)} onCancel={cancelSpecEdits} busy={busy === "save"} />}
            <SpecSheet
              key={`${version.id}-${editRows ? "edit" : "view"}`}
              title={`${company.name} · ${version.label}`}
              titleNote={company.ref}
              sections={display}
              editable={!!editRows}
              onCellChange={(e: { section: number; row: number; column: string; value: string }) => {
                setEditRows((prev) => {
                  if (!prev) return prev;
                  const idx = map[e.section]?.[e.row];
                  if (idx == null) return prev;
                  const next = prev.map((r) => ({ ...r }));
                  const row = next[idx];
                  if (row.merged) row.value = e.value;
                  else if (e.column === "cold") row.valueCold = e.value;
                  else row.valueHot = e.value;
                  return next;
                });
              }}
            />
          </div>
        )}
        {/* 최종 spec 액션 — 파이프라인 다리 */}
        {(!version.isFinal || !hideConfidential || onQuotationFromSpec) && (
          <div role="group" aria-label={`Next step for ${version.label}`} style={{ borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 8, padding: "10px 12px", flexWrap: "wrap" }}>
          {!version.isFinal && (
            <Button disabled={editRows !== null} variant="soft" size="sm" loading={busy === `final-${version.id}`}
              leftIcon={hideConfidential ? <Send size={13} /> : undefined}
              title={hideConfidential ? "Accept this spec and hand it off to Engineering" : `Mark this ${NOUN}'s spec as final`}
              onClick={() => void markFinal(version, true)}>
              {hideConfidential ? "Send to Engineering" : "Mark final"}
            </Button>
          )}
            {/* Send to CRM은 실험 accept 뒤 Experiments 탭으로 이동 (2026-09-17 지시) */}
            {version.isFinal && !hideConfidential && (
              <Button disabled={editRows !== null} variant="soft" size="sm" leftIcon={<Layers size={13} />} loading={busy === `pv-${version.id}`}
                title="Open this spec’s printing verification, or create it if none exists"
                onClick={() => void createPvBuild(version)}>
                Open printing verification
              </Button>
            )}
            {version.isFinal && onQuotationFromSpec && (
              <Button disabled={editRows !== null} variant="soft" size="sm" leftIcon={<FileText size={13} />}
                title="Create a quotation draft prefilled from this spec (confidential rows excluded)"
                onClick={() => onQuotationFromSpec(splitForExport(version.rows).sections, builds.find((b) => b.id === version.buildId)?.dealId ?? undefined)}>
                New quotation from spec
              </Button>
            )}
          </div>
        )}


      </div>
    );
  };

  if (loading) {
    return <div style={{ display: "grid", placeItems: "center", padding: 40, color: "var(--text-muted)" }}><Spinner /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {hideConfidential && dealMode && <SpecRequestsPanel
        companyId={company.id} companyName={company.name} deals={deals} initialRequestId={specRequestId}
        selectedVersionId={openVersionId} disabled={editRows !== null}
        open={requestContext !== null} scopeDealId={requestContext?.dealId} onClose={() => setRequestContext(null)}
        targets={builds.flatMap((b) => visibleVersions(versionsByBuild[b.id] ?? []).map((v) => ({ rows:v.rows,id: v.id, dealId: b.dealId ?? "", partLabel: v.label, label: `${deals.find((d) => d.id === b.dealId)?.dealNo ?? "Deal"} · ${v.label}` }))).filter((v) => v.dealId)}
        onRefresh={reloadAll} onCreateTarget={createRequestTarget}
      />}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />

      {error && <Alert tone="warning" title="Spec builds" onClose={() => setError(null)}>{error}</Alert>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>
          {dealMode
            ? (hideConfidential
              ? "Review each deal's part specifications, then hand off the accepted spec to Engineering."
              : "Review and finalize each deal's part specifications for CRM and printing verification.")
            : "Deals hold spec parts (initial request → interim → final). The final part's spec feeds CRM and printing verification."}
        </span>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Button variant="soft" size="sm" leftIcon={extractBusy ? <Spinner size="sm" /> : <Upload size={14} />} disabled={extractBusy || editRows !== null}
            title={`Upload a customer spec (PDF/image). Pick which ${NOUN} it fills`}
            onClick={() => pickFile("pick")}>
            {extractBusy ? "Reading…" : "Import spec (AI)"}
          </Button>
          {dealMode ? (
            <Button disabled={editRows !== null} variant="primary" size="sm" leftIcon={<Plus size={14} />}
              onClick={() => setNewDeal({ kind: "new", title: "", ownerKey: meId })}>
              New deal
            </Button>
          ) : (
            <Button disabled={editRows !== null} variant="primary" size="sm" leftIcon={<Plus size={14} />} loading={busy === "new-build"} onClick={() => void newBuild()}>
              New deal
            </Button>
          )}
        </div>
      </div>

      {(dealMode ? deals.length === 0 && builds.length === 0 : builds.length === 0) && (
        <EmptyState
          icon={<Layers size={24} />}
          title="No deals yet"
          description={dealMode
            ? 'Press "New deal" to start one. It becomes a card here and splits into parts (the spec table appears once you add a part).'
            : 'Press "New deal" to start one. It opens with a "Customer initial request" part.'}
        />
      )}

      {/* dealMode — CRM에서 넘어온 딜이 최상위 카드, 안에서 파트로 나뉜다. */}
      {dealMode && deals.map((deal) => {
        const b = builds.find((x) => x.dealId === deal.id) ?? null;
        const vs = visibleVersions(b ? (versionsByBuild[b.id] ?? []) : []);
        const open = openDealId === deal.id;
        return (
          <div key={deal.id}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("text/spec-part")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverDropDealId(deal.id);
            }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverDropDealId((c) => (c === deal.id ? null : c));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/spec-part");
              if (id) void movePartToDeal(id, deal);
            }}
            style={{
              border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)",
              background: dragPartId && overDropDealId === deal.id ? "var(--color-primary-soft, #eef3fb)" : "var(--surface-default)",
              outline: overDropDealId === deal.id && dragPartId ? "2px dashed var(--color-primary)" : "none", outlineOffset: 2,
            }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleDeal(deal, open)}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleDeal(deal, open); } }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
            >
              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-strong)" }}>{deal.dealNo}</span>
              <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.title}</span>
              <Badge tone="info" size="sm">{DEAL_KIND_LABEL[deal.kind]}</Badge>
              <Badge tone="neutral" size="sm">{DEAL_STATUS_LABEL[deal.status]}</Badge>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{vs.length} part{vs.length === 1 ? "" : "s"}</span>
              {vs.some((v) => v.isFinal) && <Badge tone="success" size="sm">{hideConfidential ? "accepted" : "final ready"}</Badge>}
              <span style={{ flex: 1 }} />
              <ActionsMenu label={`Actions for ${deal.dealNo}`}>
                {hideConfidential && <Button variant="ghost" size="sm" leftIcon={<Mail size={14} />} style={{ justifyContent: "flex-start" }} disabled={editRows !== null} onClick={() => setRequestContext({ dealId: deal.id })}>Customer spec requests</Button>}
                <Button variant="ghost" size="sm" leftIcon={<Pencil size={14} />} style={{ justifyContent: "flex-start" }}
                  title="Edit the deal title"
                  onClick={() => setRename({ kind: "deal", id: deal.id, value: deal.title })}>
                  Edit title
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<ExternalLink size={14} />} style={{ justifyContent: "flex-start" }}
                  title="Status, linked parts, POs and documents in one view"
                  onClick={() => setDrawerDealId(deal.id)}>
                  Linked items &amp; status
                </Button>
                <Button variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} style={{ justifyContent: "flex-start", color: "var(--red-600, #dc2626)" }}
                  title="Delete this deal and all of its spec parts"
                  onClick={() => setConfirmDel({ kind: "deal", deal, build: b })}>
                  Delete deal and specs
                </Button>
              </ActionsMenu>
            </div>
            {open && (
              <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                {vs.map(versionCard)}
                <Button variant="ghost" size="sm" leftIcon={<Plus size={13} />} loading={busy === "add-version" || busy === "new-build"}
                  onClick={() => void addPartToDeal(deal)}>
                  Add part
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {dealMode && builds.some((b) => !b.dealId) && (
        <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-subtle)", marginTop: 8 }}>
          Deals without a number (legacy)
        </div>
      )}

      {(dealMode ? builds.filter((b) => !b.dealId) : builds).map((build) => {
        const vs = visibleVersions(versionsByBuild[build.id] ?? []);
        const open = openBuildId === build.id;
        return (
          <div key={build.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--surface-default)" }}>
            {/* 빌드 헤더 — 접기/펼치기 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => { if (!editRows || cancelSpecEdits()) setOpenBuildId(open ? null : build.id); }}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (!editRows || cancelSpecEdits()) setOpenBuildId(open ? null : build.id); } }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
            >
              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text-strong)" }}>{buildTitle(build)}</span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                {build.name.trim() ? `#${build.buildNo} · ` : ""}{fmtDate(build.createdAt)} · {vs.length} {NOUN}{vs.length === 1 ? "" : "s"}
              </span>
              {vs.some((v) => v.isFinal) && <Badge tone="success" size="sm">final ready</Badge>}
              <span style={{ flex: 1 }} />
              <Button variant="ghost" size="sm" iconOnly aria-label="Rename deal" title="Rename deal"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setRename({ kind: "build", id: build.id, value: build.name.trim() || `Deal #${build.buildNo}` }); }}>
                <Pencil size={14} />
              </Button>
              <Button variant="ghost" size="sm" iconOnly aria-label="Delete deal"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setConfirmDel({ kind: "build", build }); }}>
                <Trash2 size={14} />
              </Button>
            </div>

            {open && (
              <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                {vs.map(versionCard)}

                <Button variant="ghost" size="sm" leftIcon={<Plus size={13} />} disabled={editRows !== null} loading={busy === "add-version"}
                  onClick={() => setAddVersion({ buildId: build.id, label: "", copyFrom: vs.length > 0 })}>
                  Add {NOUN}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* 딜 드로어 — 상태·레지스트리 파트·벤더 PO·문서 연결·삭제 */}
      <DealDrawer
        companyName={company.name}
        deal={deals.find((d) => d.id === drawerDealId) ?? null}
        onClose={() => setDrawerDealId(null)}
        onChanged={() => void reloadAll()}
        onDeleted={() => { setDrawerDealId(null); void reloadAll(); }}
      />

      {/* 딜 생성 모달 (dealMode) */}
      <Modal open={newDeal !== null} onClose={() => setNewDeal(null)} title="New deal" subtitle={company.name} size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setNewDeal(null)}>Cancel</Button>
            <Button variant="primary" loading={dealSaving} disabled={!newDeal} onClick={() => void submitNewDeal()}>
              Create (assign number)
            </Button>
          </div>
        }>
        {newDeal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormField label="Type">
              <Select value={newDeal.kind}
                options={(["new", "reorder"] as DealKind[]).map((k) => ({ value: k, label: DEAL_KIND_LABEL[k] }))}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewDeal({ ...newDeal, kind: e.target.value as DealKind })} />
            </FormField>
            <FormField label="Title (optional)">
              <Input value={newDeal.title} placeholder='Optional — leave blank to display the deal number'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDeal({ ...newDeal, title: e.target.value })} />
            </FormField>
            <FormField label="Owner">
              <Select value={newDeal.ownerKey}
                options={TEAM_MEMBERS.map((m) => ({ value: m.id, label: m.fullName }))}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewDeal({ ...newDeal, ownerKey: e.target.value })} />
            </FormField>
          </div>
        )}
      </Modal>

      {/* 버전 추가 모달 */}
      <Modal
        open={addVersion !== null}
        onClose={() => setAddVersion(null)}
        title="Add part"
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setAddVersion(null)}>Cancel</Button>
            <Button disabled={!addVersion?.label.trim()} onClick={() => void submitAddVersion()}>Add</Button>
          </div>
        }
      >
        {addVersion && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input
              autoFocus
              placeholder="Part label…"
              value={addVersion.label}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddVersion({ ...addVersion, label: e.target.value })}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {LABEL_PRESETS.map((l) => (
                <button key={l} type="button" onClick={() => setAddVersion({ ...addVersion, label: l })}
                  style={{ border: "1px solid var(--border-default)", background: "transparent", borderRadius: 999, padding: "3px 10px", cursor: "pointer", fontSize: "var(--text-xs)", color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>
                  {l}
                </button>
              ))}
            </div>
            <Checkbox
              checked={addVersion.copyFrom}
              onChange={(e) => setAddVersion({ ...addVersion, copyFrom: e.target.checked })}
            >
              Copy values from the latest {NOUN}
            </Checkbox>
          </div>
        )}
      </Modal>

      {/* 삭제 확인 */}
      <Modal
        open={confirmDel !== null}
        onClose={() => setConfirmDel(null)}
        title={confirmDel?.kind === "deal" ? `Delete ${confirmDel.deal.dealNo}` : confirmDel?.kind === "build" ? `Delete ${buildTitle(confirmDel.build)}` : `Delete ${NOUN} "${confirmDel?.kind === "version" ? confirmDel.version.label : ""}"`}
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>Delete</Button>
          </div>
        }
      >
        {confirmDel?.kind === "deal" ? "This deletes the deal and every part inside it. Its number is freed. The next New deal takes it. Links from documents/POs are cleared (the documents stay). This can’t be undone." : confirmDel?.kind === "build" ? `This deletes the deal and every ${NOUN} inside it. This can’t be undone.` : "This can’t be undone."}
      </Modal>

      {/* 이름 변경 (빌드 / 버전) */}
      <Modal
        open={rename !== null}
        onClose={() => setRename(null)}
        title={rename?.kind === "build" || rename?.kind === "deal" ? "Rename deal" : `Rename ${NOUN}`}
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setRename(null)}>Cancel</Button>
            <Button variant="primary" loading={renameSaving} disabled={rename?.kind !== "deal" && !rename?.value.trim()} onClick={() => void saveRename()}>Save</Button>
          </div>
        }
      >
        {rename && (
          <Input
            autoFocus
            value={rename.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRename({ ...rename, value: e.target.value })}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" && rename.value.trim()) void saveRename(); }}
          />
        )}
      </Modal>

      {/* AI 업로드 대상 선택 (톱레벨 Import) */}
      <Modal
        open={pick !== null}
        onClose={() => setPick(null)}
        title="Where should this spec go?"
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setPick(null)}>Cancel</Button>
            <Button
              disabled={pick?.mode === "existing" && !pick.versionId}
              onClick={() => {
                if (!pick) return;
                const file = pick.file;
                const buildId = pick.buildId === "__new__" ? null : pick.buildId;
                if (pick.mode === "existing" && pick.versionId) {
                  const v = versions.find((x) => x.id === pick.versionId);
                  if (v) { setPick(null); void runExtract(file, { versionId: v.id, buildId: v.buildId, label: v.label, copyRows: v.rows }); return; }
                }
                const siblings = buildId ? (versionsByBuild[buildId] ?? []) : [];
                const copyRows = siblings.length > 0 ? siblings[siblings.length - 1].rows : specVersionTemplate();
                setPick(null);
                void runExtract(file, { versionId: null, buildId, label: pick.label, copyRows });
              }}
            >
              Extract
            </Button>
          </div>
        }
      >
        {pick && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{pick.file.name}</span>
            <Select
              size="sm"
              value={pick.buildId}
              options={[
                ...(dealMode ? [] : [{ value: "__new__", label: "➕ New deal" }]),
                ...builds.map((b) => {
                  const deal = b.dealId ? deals.find((d) => d.id === b.dealId) : null;
                  return { value: b.id, label: deal ? `${deal.dealNo} · ${deal.title}` : `${buildTitle(b)} (${fmtDate(b.createdAt)})` };
                }),
              ]}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPick({ ...pick, buildId: e.target.value, mode: e.target.value === "__new__" ? "new" : pick.mode, versionId: "" })}
            />
            {pick.buildId !== "__new__" && (
              <Select
                size="sm"
                value={pick.mode === "new" ? "__newv__" : pick.versionId}
                options={[
                  { value: "__newv__", label: `➕ New ${NOUN}` },
                  ...(versionsByBuild[pick.buildId] ?? []).map((v) => ({ value: v.id, label: `Overwrite: ${v.label}` })),
                ]}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const val = e.target.value;
                  setPick(val === "__newv__" ? { ...pick, mode: "new", versionId: "" } : { ...pick, mode: "existing", versionId: val });
                }}
              />
            )}
            {pick.mode === "new" && (
              <Input
                size="sm"
                placeholder={`New ${NOUN} label (blank = AI suggestion)`}
                value={pick.label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPick({ ...pick, label: e.target.value })}
              />
            )}
          </div>
        )}
      </Modal>

      {/* AI 추출 리뷰 — Apply 전엔 아무것도 저장되지 않는다 */}
      <Modal
        open={reviewX !== null}
        onClose={() => setReviewX(null)}
        title="Review extracted values"
        size="md"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setReviewX(null)}>Discard</Button>
            <Button leftIcon={<Sparkles size={13} />} loading={busy === "apply-extract"} onClick={() => void applyReview()}>
              Apply{reviewX ? ` (${reviewX.diffs.length})` : ""}
            </Button>
          </div>
        }
      >
        {reviewX && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviewX.res.notes.length > 0 && (
              <Alert tone="info" title="Review points">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {reviewX.res.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </Alert>
            )}
            {reviewX.diffs.length === 0 ? (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>No values found in the document.</span>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
                <thead>
                  <tr>
                    {["Parameter", "Current", "Extracted"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--border-strong)", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-subtle)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviewX.diffs.map((d) => (
                    <tr key={d.idx}>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border-subtle)" }}>
                        {reviewX.target.copyRows[d.idx].confidential && <Lock size={10} style={{ marginRight: 4 }} />}
                        {reviewX.target.copyRows[d.idx].parameter}
                      </td>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-subtle)" }}>{d.from || "N/A"}</td>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600 }}>{d.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
