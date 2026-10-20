"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Info, Pin, PinOff, Plus, Upload as UploadIcon } from "lucide-react";
import { Tabs } from "@/components/ds/navigation/Tabs";
import { Toast } from "@/components/ds/feedback/Toast";
import { Button } from "@/components/ds/core/Button";
import { Spinner } from "@/components/ds/core/Spinner";
import { Modal } from "@/components/ds/feedback/Modal";
import type { Build, BuildFile, Activity, ChangeRequest, Company, CompanyDocument, Comment as CommentT, DocType, FeedContext, Importance, Stage } from "@/types/domain";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/mock/companies";
import { memberName, CRM_OWNERS } from "@/lib/mock/team";
import { processUpload, type IntakeInput, type IntakeDraft, type IntakeSpecChange } from "@/lib/ai/intake";
import { specsForCompany } from "@/lib/mock/specs";
import type { SpecSheetSection } from "@/components/ds/sheets/SpecSheet";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { allowedSectors, canAccess, canSeeSector } from "@/lib/auth/roles";
import {
  fetchCrm, insertCompany, updateCompany, deleteCompany, insertSpecs,
  updateSpecCell, insertActivity, insertComment, deleteComment, setReaction, type DbSpecRow,
  fetchCompanySpecs,
} from "@/lib/data/crm";
import {
  fetchDocuments, insertDocument, updateDocument, deleteDocument, nextDocNo, sendInvoiceToFinance,
} from "@/lib/data/documents";
import { INVOICE_PREFIX, PARTY_CODE_RE, QUOTATION_PREFIX, nextScopedDocNo, scopedCounterValue } from "@/lib/data/docNumbering";
import { fetchChangeRequests, requestChange } from "@/lib/data/approvals";
import { notifyByEmail, notifyMentions } from "@/lib/mentions";
import { IMPORTANCE_LABEL } from "./crmFormat";
import { DealsBoard } from "./DealsBoard";
import { DEAL_STATUS_LABEL, advanceDeal, updateDeal, fetchDealSummaries, type DealStatus, type DealSummary } from "@/lib/data/deals";
import { fetchCompanyFavorites, setCompanyFavorite } from "@/lib/data/companyFavorites";
import { CompanyFavoriteButton } from "./CompanyFavoriteButton";
import { CompanyTable } from "./CompanyTable";
import { RequirementTable } from "./RequirementTable";
import { fetchBuildFiles, fetchBuilds } from "@/lib/data/builds";
import { CrmStats } from "./CrmStats";
import { DetailPanel } from "./DetailPanel";
import { ActivityFeed } from "./ActivityFeed";
import { GlobalActivityPanel } from "./GlobalActivityPanel";
import { ReviewModal } from "./ReviewModal";
import { CompanyFormModal, SECTORS as ALL_SECTORS } from "./CompanyFormModal";
import { CrmManualModal } from "./CrmManualModal";
import { ReasonModal, type PendingEdit } from "./ReasonModal";
import { UploadModal } from "./UploadModal";
import { DOC_LABEL, type DocCreateMeta, type DocFormValue } from "./DocumentPanel";
import { CompanyStagePanel, DealWorkspace, type CompanyBoardStage } from "./DealWorkspace";
import { useMobile } from "@/lib/hooks/useMobile";
import { useEdgePanel } from "@/lib/hooks/useEdgePanel";
import { CompanyOverview } from "./CompanyOverview";
import { SalesActivityModal, type SalesActivitySaved } from "./SalesActivityModal";

type View = "board" | "table";

type CompanyTab = "documents" | "log";
type ToastMsg = { tone: "success" | "danger"; title: string; text: string };

type SpecCellChange = { section: number; row: number; column: string; value: string };


function applySpecEdit(sections: SpecSheetSection[], e: SpecCellChange): SpecSheetSection[] {
  return sections.map((s, si) =>
    si !== e.section
      ? s
      : {
          ...s,
          rows: s.rows.map((r, ri) =>
            ri !== e.row ? r : { ...r, [e.column === "_merged" ? "value" : e.column]: e.value },
          ),
        },
  );
}



const COLUMN_LABEL: Record<string, string> = { hot: "Value 1", cold: "Value 2", value: "Value", _merged: "Value" };
const FEED_LABEL: Record<FeedContext, string> = { targeting: "Targeting", first_contact: "First contact", nda: "NDA", spec: "Spec sheet", quotation: "Quotation", purchase_order: "Purchase Order", invoice: "Invoice", engineering: "Engineering", procurement: "Procurement", inspection: "Inspection", experiments: "Experiments" };


function nextRef(companies: Company[]): string {
  const max = companies.reduce((m, c) => {
    const n = parseInt(c.ref.replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `Q-${max + 1}`;
}

function blankCompany(companies: Company[]): Company {
  return {
    id: `new-${Date.now()}`,
    ref: nextRef(companies),
    partyCode: "",
    name: "",
    sector: "Data center",
    stage: "lead" as Stage,
    ownerId: CRM_OWNERS[0],
    engOwnerId: "",
    contact: "",
    importance: "med" as Importance,
    value: null,
    progress: 10,
    updatedAt: new Date().toISOString(),
  };
}


function describeChange(patch: Partial<Company>): string | null {
  if (patch.stage) return `Changed stage to ${STAGE_LABEL[patch.stage]}`;
  if (patch.ownerId) return `Reassigned owner to ${memberName(patch.ownerId)}`;
  if (patch.engOwnerId != null) return `Reassigned engineering owner to ${patch.engOwnerId ? memberName(patch.engOwnerId) : "Unassigned"}`;
  if (patch.importance) return `Set priority to ${IMPORTANCE_LABEL[patch.importance]}`;
  if (patch.value !== undefined) return `Changed value to ${patch.value == null ? "N/A" : `$${patch.value.toLocaleString("en-US")}`}`;
  if (patch.contact != null) return null; // contact edits are noisy (per keystroke) — skip
  return null;
}



export interface SpecBatchEdit { specId: string; column: string; label: string; old: string; new: string }

const editLine = (e: SpecBatchEdit) => `${e.label}: ${e.old || "N/A"} → ${e.new || "N/A"}`;


function batchLog(edits: SpecBatchEdit[]): string {
  if (edits.length === 1) return editLine(edits[0]);
  return `${edits.length} spec edits\n${edits.map((e) => `• ${editLine(e)}`).join("\n")}`;
}

function requestSummary(req: ChangeRequest): string {
  const p = req.payload as { label?: string; old?: unknown; new?: unknown; summary?: string; edits?: SpecBatchEdit[] };
  if (p.edits?.length) return batchLog(p.edits);
  if (p.summary) return p.summary;
  return `${p.label ?? "value"}: ${String(p.old ?? "N/A")} → ${String(p.new ?? "N/A")}`;
}

export function CrmWorkspace({ view: screen = "sales" }: { view?: "sales" | "engineering" } = {}) {
  const defaultTab: FeedContext = screen === "engineering" ? "spec" : "quotation";
  const me = useCurrentUser();
  const isApprover = canAccess("admin", me);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<FeedContext>(defaultTab);
  // Search / KPI deep link (?company=…&build=… or &deal=…) — captured once, consumed
  // after companies load, then stripped from the URL.
  const deepLink = useRef<{ company: string | null; build: string | null; deal: string | null; specRequest?: string | null } | null>(null);
  const companyOpenSequence = useRef(0);
  if (deepLink.current === null && typeof window !== "undefined") {
    const sp = new URLSearchParams(window.location.search);
    deepLink.current = { company: sp.get("company"), build: sp.get("build"), deal: sp.get("deal"), specRequest: sp.get("specRequest") };
  }
  const [specRequestLink, setSpecRequestLink] = useState<string | null>(null);
  const [focusBuildId, setFocusBuildId] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");
  const [commentsByCompany, setCommentsByCompany] = useState<Record<string, CommentT[]>>({});
  const [activitiesByCompany, setActivitiesByCompany] = useState<Record<string, Activity[]>>({});
  const [specsByCompany, setSpecsByCompany] = useState<Record<string, SpecSheetSection[]>>({});
  const [documentsByCompany, setDocumentsByCompany] = useState<Record<string, CompanyDocument[]>>({});
  const [requests, setRequests] = useState<{ pending: ChangeRequest[]; decided: ChangeRequest[] }>({ pending: [], decided: [] });
  const [buildsByCompany, setBuildsByCompany] = useState<Record<string, Build[]>>({});
  const [buildFilesByCompany, setBuildFilesByCompany] = useState<Record<string, Record<string, BuildFile[]>>>({});
  const [gate, setGate] = useState<{ edits: PendingEdit[]; file: (reason: string) => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [review, setReview] = useState<{ source: IntakeInput; drafts: IntakeDraft[] } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [form, setForm] = useState<{ mode: "create" | "edit"; company: Company } | null>(null);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyFormError, setCompanyFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [rightWidth, setRightWidth] = useState(404);
  // 좌우 패널(회사 목록·Details) — sales 데스크톱에서는 접혀 있다가 가장자리에 커서를
  // 대면 떠오르고, 핀으로 고정할 수 있다 (2026-10-06 지시: 가운데 작업 영역을 넓게).
  const mobile = useMobile();
  const railPanel = useEdgePanel("crm.pin.rail", screen === "sales" && !mobile);
  const detailsPanel = useEdgePanel("crm.pin.details", screen === "sales" && !mobile);
  // Engineering spec 탭에서 선택된 버전 — 우측 기록(활동·댓글)의 스코프.
  const [specVersionSel, setSpecVersionSel] = useState<{ id: string; label: string } | null>(null);
  // Sales 문서 탭에서 편집 중인 문서 — 우측 기록 스코프.
  const [docSel, setDocSel] = useState<{ id: string; label: string } | null>(null);
  // 선택된 딜 — 상단 스테퍼 진행 단계와 Details의 딜 스테이지가 이걸 따른다.
  const [selectedDeal, setSelectedDeal] = useState<DealSummary | null>(null);
  // ---- 통합 CRM v3 (sales 전용) ----
  // 회사 통합 화면 탭 — Overview(Contacts·활동·다음 행동) / Timeline / Documents(기존).
  const [companyTab, setCompanyTab] = useState<CompanyTab>("documents");
  // 좌측 회사 사이드바 검색 (회사를 열어둔 채 바로 다른 회사로 전환)
  const [sideSearch, setSideSearch] = useState("");
  const [favoriteState, setFavoriteState] = useState<{ userId: string; ids: string[] } | null>(null);
  const favoritesReady = favoriteState?.userId === me.id;
  const favoriteIds = favoritesReady ? favoriteState.ids : [];
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [railWidth, setRailWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 216;
    const saved = Number(window.localStorage.getItem("crm.railWidth"));
    return Number.isFinite(saved) && saved >= 160 && saved <= 420 ? saved : 216;
  });
  function startRailResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = railWidth;
    const move = (ev: MouseEvent) => setRailWidth(Math.min(420, Math.max(160, startW + (ev.clientX - startX))));
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const final = Math.min(420, Math.max(160, startW + (ev.clientX - startX)));
      try { window.localStorage.setItem("crm.railWidth", String(final)); } catch {  }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }
  // AI 단계 제안 → First contact 폼 프리필 (EmailAiPanel "Open step")
  const [aiPrefill, setAiPrefill] = useState<{ body?: string; nextAction?: string } | null>(null);
  // 파이프라인 보드에서 선택된 딜 — 아래 딜 워크스페이스가 뜬다.
  const [boardDeal, setBoardDeal] = useState<DealSummary | null>(null);
  // 보드 하단 패널 — 회사 카드 선택(초기 단계, 보드 칼럼 단계 포함) + 높이 드래그 조절 (2026-10-01)
  const [boardCompany, setBoardCompany] = useState<{ company: Company; stage: CompanyBoardStage } | null>(null);
  const [boardPanelH, setBoardPanelH] = useState<number>(() => {
    if (typeof window === "undefined") return 260;
    const saved = Number(window.localStorage.getItem("crm.boardPanelH"));
    return Number.isFinite(saved) && saved >= 140 && saved <= 640 ? saved : 260;
  });
  function startBoardPanelResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = boardPanelH;
    const move = (ev: MouseEvent) => setBoardPanelH(Math.min(640, Math.max(140, startH + (startY - ev.clientY))));
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const final = Math.min(640, Math.max(140, startH + (startY - ev.clientY)));
      try { window.localStorage.setItem("crm.boardPanelH", String(final)); } catch {  }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
  }
  // 전체 딜 목록 (Overview 딜 카드·Follow-ups·활동 폼 딜 셀렉트 공용).
  const [allDeals, setAllDeals] = useState<DealSummary[]>([]);
  const [dealsRefresh, setDealsRefresh] = useState(0);
  // 영업 활동 기록 폼 — 회사 + 기본 연결 딜.
  const [activityModal, setActivityModal] = useState<{ companyId: string; defaultDealId: string | null } | null>(null);
  const [overviewRefresh, setOverviewRefresh] = useState(0);

  // sales 전용 — 딜 목록 로드 (dealsRefresh로 재조회)
  useEffect(() => {
    if (screen !== "sales") return;
    let alive = true;
    fetchDealSummaries()
      .then((ds) => { if (alive) setAllDeals(ds); })
      .catch((err) => console.error("deals load failed:", err));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealsRefresh]);

  
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    const move = (ev: MouseEvent) => {
      const next = Math.min(720, Math.max(320, startW + (startX - ev.clientX)));
      setRightWidth(next);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  // Load the whole workspace from Supabase on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [data, reqs] = await Promise.all([fetchCrm(), fetchChangeRequests()]);
        if (!alive) return;
        // Hide companies in sectors this user isn't allowed to see (Aerospace is
        // restricted unless granted on the Admin page; admins see all).
        const visibleCompanies = data.companies.filter((c) => canSeeSector(c.sector, me));
        setCompanies(visibleCompanies);
        setSpecsByCompany(data.specs);
        setActivitiesByCompany(data.activities);
        setCommentsByCompany(data.comments);
        setRequests(reqs);
        // CRM 진입 = 마지막에 보던 회사로 직행 (2026-10-01) — 딥링크가 있으면 그쪽 우선.
        try {
          const params = new URLSearchParams(window.location.search);
          const last = window.localStorage.getItem(`crm.lastCompany.${screen}`);
          if (!params.get("company") && !params.get("deal") && !params.get("build") && last && visibleCompanies.some((c) => c.id === last)) {
            openCompany(last);
          }
        } catch {  }
      } catch (err) {
        console.error("CRM load failed:", err);
        if (alive) setToast({ tone: "danger", title: "Couldn’t load", text: "Failed to load CRM data. Refresh to retry." });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (screen !== "sales") return;
    let alive = true;
    fetchCompanyFavorites().then(ids => { if (alive) setFavoriteState({ userId: me.id, ids }); })
      .catch(() => { if (alive) setToast({ tone: "danger", title: "Favorites unavailable", text: "Couldn’t load your favorites. Refresh to retry." }); });
    return () => { alive = false; };
  }, [screen, me.id]);

  async function toggleFavorite(id: string) {
    if (!favoritesReady || favoriteBusy) return;
    const favorite = !favoriteIds.includes(id);
    setFavoriteBusy(true);
    try {
      await setCompanyFavorite(id, favorite);
      setFavoriteState(state => state?.userId === me.id ? { ...state, ids: favorite ? [...state.ids, id] : state.ids.filter(value => value !== id) } : state);
    } catch { fail("Couldn’t save this favorite. Try again."); }
    finally { setFavoriteBusy(false); }
  }

  // Lazy-load a company's documents the first time it's opened.
  useEffect(() => {
    if (!selectedId || documentsByCompany[selectedId]) return;
    let alive = true;
    fetchDocuments(selectedId)
      .then((docs) => { if (alive) setDocumentsByCompany((prev) => ({ ...prev, [selectedId]: docs })); })
      .catch((err) => console.error("documents load failed:", err));
    return () => { alive = false; };
  }, [selectedId, documentsByCompany]);

  // Engineering builds for the selected company (lazy, like documents).
  useEffect(() => {
    if (screen !== "engineering" || !selectedId || buildsByCompany[selectedId]) return;
    reloadBuilds(selectedId).catch((err) => console.error("builds load failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function reloadBuilds(companyId: string) {
    const builds = await fetchBuilds(companyId);
    const files = await fetchBuildFiles(builds.map((b) => b.id));
    const byBuild: Record<string, BuildFile[]> = {};
    for (const f of files) (byBuild[f.buildId] ??= []).push(f);
    setBuildsByCompany((prev) => ({ ...prev, [companyId]: builds }));
    setBuildFilesByCompany((prev) => ({ ...prev, [companyId]: byBuild }));
  }

  const selected = companies.find((c) => c.id === selectedId) ?? null;
  // Right-pane feed is scoped to the open stage tab; spec 탭에서 버전을 열면
  // 그 버전(targetId) 기록만, 아니면 탭 단위(targetId 없음) 기록만 보인다.
  const feedTarget =
    detailTab === "spec" ? (specVersionSel?.id ?? null)
    : screen === "sales" ? (docSel?.id ?? null)
    : null;
  const feedTargetLabel = feedTarget ? (detailTab === "spec" ? specVersionSel?.label : docSel?.label) ?? null : null;
  const inScope = (targetId: string | null | undefined) => (feedTarget ? targetId === feedTarget : !targetId);
  const comments = selectedId ? (commentsByCompany[selectedId] ?? []).filter((c) => c.context === detailTab && inScope(c.targetId)) : [];
  const activities = selectedId ? (activitiesByCompany[selectedId] ?? []).filter((a) => a.context === detailTab && inScope(a.targetId)) : [];
  const documents = selectedId ? (documentsByCompany[selectedId] ?? []) : [];
  const pendingForSelected = selectedId ? requests.pending.filter((r) => r.companyId === selectedId) : [];

  
  function openCompany(id: string, tab?: CompanyTab) {
    try { window.localStorage.setItem(`crm.lastCompany.${screen}`, id); } catch {  }
    companyOpenSequence.current += 1;
    const stage = companies.find((c) => c.id === id)?.stage;
    setSelectedId(id);
    // 2026-09-16 확정 프로세스: lead·검토 단계는 ①First contact부터, spec 단계는 ③Spec sheet부터.
    setDetailTab(
      screen === "sales" && (stage === "lead" || stage === "in_review") ? "first_contact"
      : screen === "sales" && stage === "spec" ? "spec"
      : defaultTab,
    );
    setSpecVersionSel(null);
    setDocSel(null);
    setSelectedDeal(null);
    // 통합 CRM v3 — sales는 회사 통합 홈(Overview)이 기본 진입.
    setCompanyTab(tab ?? "documents");
  }

  // Consume the global-search deep link once companies are in.
  useEffect(() => {
    const dl = deepLink.current;
    if (!dl?.company || companies.length === 0) return;
    if (companies.some((c) => c.id === dl.company)) {
      openCompany(dl.company);
      if (screen === "sales" && dl.specRequest) { setDetailTab("spec"); setCompanyTab("documents"); setSpecRequestLink(dl.specRequest); }
      if (screen === "engineering" && dl.build) { setFocusBuildId(dl.build); setDetailTab("engineering"); }
      if (screen === "sales" && dl.deal) {
        const requestSequence = companyOpenSequence.current;
        setDetailTab("spec");
        setCompanyTab("documents"); // 딜 딥링크는 문서 컨텍스트로 직행
        void fetchDealSummaries(dl.company).then((deals) => {
          if (requestSequence !== companyOpenSequence.current) return;
          const deal = deals.find((d) => d.id === dl.deal);
          if (deal) setSelectedDeal(deal);
          else setToast({ tone: "danger", title: "Deal unavailable", text: "This deal is no longer linked to this account or is not accessible." });
        }).catch(() => {
          if (requestSequence === companyOpenSequence.current) setToast({ tone: "danger", title: "Couldn’t load deal", text: "Open the deal from the account’s Spec sheet to retry." });
        });
      }
    }
    deepLink.current = { company: null, build: null, deal: null };
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  function fail(text: string) {
    setToast({ tone: "danger", title: "Couldn’t save", text });
  }


  
  async function logActivity(companyId: string, type: Activity["type"], summary: string, context: FeedContext = "spec", targetId: string | null = null) {
    try {
      const entry = await insertActivity(companyId, me.id, type, summary, context, targetId);
      setActivitiesByCompany((prev) => ({ ...prev, [companyId]: [...(prev[companyId] ?? []), entry] }));
    } catch (err) {
      console.error("log activity failed:", err);
    }
  }

  // ---- Approval gate ---------------------------------------------------------

  
  function openGate(opts: {
    companyId: string;
    targetKind: ChangeRequest["targetKind"];
    targetId: string | null;
    payload: Record<string, unknown>;
    context: FeedContext;
    edits: PendingEdit[];
    apply: () => Promise<void>;
    onQueued?: () => void;
  }) {
    setGate({
      edits: opts.edits,
      file: async (reason: string) => {
        try {
          const req = await requestChange({
            companyId: opts.companyId,
            targetKind: opts.targetKind,
            targetId: opts.targetId,
            payload: { ...opts.payload, context: opts.context },
            reason,
            requestedByKey: me.id,
            autoApprove: isApprover,
          });
          if (isApprover) {
            await opts.apply();
            setRequests((prev) => ({ ...prev, decided: [req, ...prev.decided].slice(0, 20) }));
            await logActivity(opts.companyId, "approved", `${requestSummary(req)} · ${reason}`, opts.context);
            setToast({ tone: "success", title: "Applied", text: "Change applied and recorded (approver)." });
          } else {
            setRequests((prev) => ({ ...prev, pending: [...prev.pending, req] }));
            await logActivity(opts.companyId, "approval_requested", `Requested: ${requestSummary(req)} · ${reason}`, opts.context);
            opts.onQueued?.();
            setToast({ tone: "success", title: "Sent for approval", text: "An approver has to accept it before it applies." });
          }
        } catch (err) {
          console.error("change request failed:", err);
          fail("Failed to file the change request.");
        } finally {
          setGate(null);
        }
      },
    });
  }




  // ---- Intake ---------------------------------------------------------------

  async function handleIntake(input: IntakeInput) {
    setBusy(true);
    try {
      const drafts = await processUpload(input, companies);
      // Don't touch the list yet — open the review modal for confirmation/edits.
      setUploadOpen(false);
      setReview({ source: input, drafts });
    } catch (err) {
      console.error("intake failed:", err);
      setToast({ tone: "danger", title: "Couldn’t process", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  
  function findSpecCell(sections: SpecSheetSection[], change: IntakeSpecChange) {
    const target = change.parameter.trim().toLowerCase();
    for (let si = 0; si < sections.length; si++) {
      const rows = sections[si].rows;
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri] as DbSpecRow;
        const p = String(row.param ?? "").toLowerCase();
        if (p === target || p.includes(target) || target.includes(p)) {
          const column = row.merged ? "_merged" : change.side === "cold" ? "cold" : "hot";
          return { si, ri, row, column };
        }
      }
    }
    return null;
  }

  
  async function applySpecChanges(
    companyId: string,
    sectionsIn: SpecSheetSection[],
    changes: IntakeSpecChange[],
    skipped: string[],
    opts?: { gated?: boolean; reason?: string },
  ) {
    let sections = sectionsIn;
    let queued = 0;
    for (const ch of changes) {
      if (!ch.newValue.trim()) continue; // cleared in review = skip
      const hit = findSpecCell(sections, ch);
      if (!hit || !hit.row._id) {
        skipped.push(ch.parameter);
        continue;
      }
      // AI-suggested edits to an existing company ALWAYS go through approval —
      // even an approver's, so the change is visible in the Approvals queue.
      if (opts?.gated) {
        const old = hit.row.merged ? String(hit.row.value ?? "") : String((hit.row as Record<string, unknown>)[hit.column] ?? "");
        const req = await requestChange({
          companyId,
          targetKind: "spec_cell",
          targetId: hit.row._id,
          payload: { column: hit.column, old, new: ch.newValue, label: `${String(hit.row.param)} (${COLUMN_LABEL[hit.column] ?? hit.column})`, context: "spec" },
          reason: opts.reason || "AI intake revision",
          requestedByKey: me.id,
        });
        setRequests((prev) => ({ ...prev, pending: [...prev.pending, req] }));
        await logActivity(companyId, "approval_requested", `Requested: ${requestSummary(req)}`, "spec");
        queued++;
        continue;
      }
      const updatedAt = await updateSpecCell(companyId, hit.row._id, hit.column, ch.newValue);
      sections = applySpecEdit(sections, { section: hit.si, row: hit.ri, column: hit.column, value: ch.newValue });
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, updatedAt } : c)));
      await logActivity(companyId, "update", `Edited “${String(hit.row.param)}” (${COLUMN_LABEL[hit.column] ?? hit.column}) to ${ch.newValue}`);
    }
    if (queued) {
      setToast({ tone: "success", title: "Sent for approval", text: `${queued} spec change${queued === 1 ? "" : "s"} await approval · CRM → Approvals tab.` });
    }
    return sections;
  }

  async function postNote(companyId: string, note: string) {
    const cm = await insertComment(companyId, me.id, note, null);
    setCommentsByCompany((prev) => ({ ...prev, [companyId]: [...(prev[companyId] ?? []), cm] }));
  }

  async function confirmReview(edited: IntakeDraft[]) {
    setReview(null);
    setBusy(true);
    try {
      const skipped: string[] = [];
      let added = 0;
      let updated = 0;
      let firstId: string | null = null;

      for (const draft of edited) {
        if (draft.kind === "create") {
          const company = await insertCompany(draft.company);
          let sections = await insertSpecs(company.id, specsForCompany(company));
          sections = await applySpecChanges(company.id, sections, draft.specChanges, skipped);
          setSpecsByCompany((prev) => ({ ...prev, [company.id]: sections }));
          setCompanies((prev) => [company, ...prev]);
          await logActivity(company.id, "upload", draft.summary || "Imported from upload, reviewed, and added.");
          if (draft.note) await postNote(company.id, draft.note);
          firstId ??= company.id;
          added++;
        } else {
          if (Object.keys(draft.patch).length) {
            const saved = await updateCompany(draft.companyId, draft.patch);
            setCompanies((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
          }
          const sections = specsByCompany[draft.companyId];
          if (sections) {
            const next = await applySpecChanges(draft.companyId, sections, draft.specChanges, skipped, {
              gated: true,
              reason: draft.summary || "AI intake revision",
            });
            setSpecsByCompany((prev) => ({ ...prev, [draft.companyId]: next }));
          } else if (draft.specChanges.length) {
            skipped.push(...draft.specChanges.map((s) => s.parameter));
          }
          await logActivity(draft.companyId, "update", draft.summary || "Updated from an uploaded revision.");
          if (draft.note) await postNote(draft.companyId, draft.note);
          firstId ??= draft.companyId;
          updated++;
        }
      }

      if (firstId) openCompany(firstId);
      const parts = [added ? `added ${added}` : null, updated ? `updated ${updated}` : null].filter(Boolean).join(" · ");
      setToast({
        tone: "success",
        title: "Processed",
        text: `Applied · ${parts || "nothing"}.${skipped.length ? ` Couldn’t match spec rows: ${skipped.join(", ")} (edit them in the table).` : ""}`,
      });
    } catch (err) {
      console.error("confirm review failed:", err);
      fail("Failed to apply the reviewed records.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Company meta ----------------------------------------------------------

  
  async function saveCompanyPatch(companyId: string, patch: Partial<Company>) {
    const saved = await updateCompany(companyId, patch);
    setCompanies((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    const summary = describeChange(patch);
    if (summary) await logActivity(companyId, "update", summary);
  }

  async function updateSelected(patch: Partial<Company>) {
    if (!selectedId || !selected) return;

    // Key fields (stage, value) go through the approval gate.
    if (patch.stage !== undefined || patch.value !== undefined) {
      const isStage = patch.stage !== undefined;
      const from = isStage ? STAGE_LABEL[selected.stage] : selected.value == null ? "N/A" : `$${selected.value.toLocaleString("en-US")}`;
      const to = isStage ? STAGE_LABEL[patch.stage as Stage] : patch.value == null ? "N/A" : `$${(patch.value as number).toLocaleString("en-US")}`;
      openGate({
        companyId: selectedId,
        targetKind: "company_field",
        targetId: null,
        payload: { field: isStage ? "stage" : "value", old: isStage ? selected.stage : selected.value, new: isStage ? patch.stage : patch.value, label: isStage ? "Stage" : "Value" },
        context: "spec",
        edits: [{ label: isStage ? "Stage" : "Value (USD)", from, to }],
        apply: () => saveCompanyPatch(selectedId, patch),
      });
      return;
    }

    // Ungated fields (owner, contact, priority) save immediately, as before.
    const prevCompanies = companies;
    setCompanies((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)));
    try {
      await saveCompanyPatch(selectedId, patch);
    } catch (err) {
      console.error("update company failed:", err);
      setCompanies(prevCompanies); // revert — don't keep showing an unsaved value
      fail("Failed to save the change.");
    }
  }

  // ---- Documents ---------------------------------------------------------------

  const STAGE_RANK: Record<Stage, number> = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i])) as Record<Stage, number>;

  
  async function maybeAdvanceStage(company: Company, target: Stage, cause: string, context: FeedContext) {
    if (STAGE_RANK[company.stage] >= STAGE_RANK[target] || company.stage === "lost") return;
    const saved = await updateCompany(company.id, { stage: target });
    setCompanies((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    await logActivity(company.id, "update", `Stage auto-advanced to ${STAGE_LABEL[target]} (${cause}).`, context);
  }

  function setDocs(companyId: string, fn: (docs: CompanyDocument[]) => CompanyDocument[]) {
    setDocumentsByCompany((prev) => ({ ...prev, [companyId]: fn(prev[companyId] ?? []) }));
  }

  async function createDoc(docType: DocType, form: DocFormValue, meta?: DocCreateMeta) {
    if (!selectedId) return;
    try {
      const doc = await insertDocument({
        companyId: selectedId, docType, currency: form.currency, lineItems: form.lineItems.filter((li) => li.name.trim()),
        validUntil: form.validUntil, incoterms: form.incoterms, paymentTerms: form.paymentTerms,
        billTo: form.billTo, shipTo: form.shipTo, projectRef: form.projectRef,
        discountPct: form.discountPct, taxRate: form.taxRate,
        terms: form.terms, memo: form.memo, createdByKey: me.id,
        ...(form.dealId ? { dealId: form.dealId } : {}),
        // 고객 PO 접수 — 고객사 번호·발행 상태·근거 견적 연결 그대로 저장
        ...(meta?.docNo ? { docNo: meta.docNo } : {}),
        ...(meta?.status ? { status: meta.status } : {}),
        ...(meta?.issueDate ? { issueDate: meta.issueDate } : {}),
        ...(meta?.linkedDocId ? { linkedDocId: meta.linkedDocId } : {}),
      });
      setDocs(selectedId, (docs) => [doc, ...docs]);
      bumpSelectedDealDoc(doc.dealId, docType);
      if (meta?.docNo && docType === "purchase_order" && doc.dealId) {
        void autoAdvanceDeal(doc.dealId, "customer_po", `customer PO ${meta.docNo} registered`, docType);
      }
      await logActivity(
        selectedId, "document",
        meta?.docNo ? `Registered customer ${DOC_LABEL[docType].toLowerCase()} ${meta.docNo}.` : `Created a ${DOC_LABEL[docType].toLowerCase()} draft.`,
        docType, doc.id,
      );
    } catch (err) {
      console.error("create document failed:", err);
      fail("Failed to create the document. The new quotation fields need db/migrations/2026-08-05_quotation_po.sql applied in Supabase.");
    }
  }

  
  async function createInvoiceFromPo(po: CompanyDocument) {
    try {
      const inv = await insertDocument({
        companyId: po.companyId, docType: "invoice", currency: po.currency,
        lineItems: po.lineItems.map((li) => ({ ...li })),
        incoterms: po.incoterms, paymentTerms: po.paymentTerms,
        billTo: po.billTo, shipTo: po.shipTo, projectRef: po.projectRef,
        discountPct: po.discountPct, taxRate: po.taxRate,
        terms: "", memo: `From customer PO ${po.docNo ?? ""}`.trim(),
        createdByKey: me.id,
        ...(po.dealId ? { dealId: po.dealId } : {}),
        linkedDocId: po.id,
      });
      setDocs(po.companyId, (docs) => [inv, ...docs]);
      bumpSelectedDealDoc(inv.dealId, "invoice");
      await logActivity(po.companyId, "document", `Invoice draft created from customer PO ${po.docNo ?? ""}.`, "invoice", inv.id);
      setDetailTab("invoice");
      setToast({ tone: "success", title: "Invoice draft", text: `Invoice draft built from PO ${po.docNo ?? ""} · review and issue it.` });
    } catch (err) {
      console.error("invoice from po failed:", err);
      fail("Failed to create the invoice draft.");
    }
  }

  async function saveDoc(doc: CompanyDocument, form: DocFormValue) {
    const patch: Partial<CompanyDocument> = {
      lineItems: form.lineItems.filter((li) => li.name.trim()),
      currency: form.currency, validUntil: form.validUntil,
      incoterms: form.incoterms, paymentTerms: form.paymentTerms,
      billTo: form.billTo, shipTo: form.shipTo, projectRef: form.projectRef,
      discountPct: form.discountPct, taxRate: form.taxRate,
      terms: form.terms, memo: form.memo,
      // 발행일 수정 — 발행된 문서만 (draft는 Issue 시점에 자동 기재, 2026-09-17 지시)
      ...(doc.status !== "draft" && form.issueDate !== undefined && form.issueDate !== doc.issueDate
        ? { issueDate: form.issueDate } : {}),
      // deal_id 컬럼(2026-08-26b SQL) 미실행 DB 보호 — 값이 관련될 때만 보낸다.
      ...(form.dealId || doc.dealId ? { dealId: form.dealId || null } : {}),
      // 고객 PO만 — 고객사 문서번호·근거 견적 연결 수정 가능
      ...(doc.docType === "purchase_order" ? { docNo: (form.poNo ?? "").trim() || null } : {}),
      ...(doc.docType === "purchase_order" && (form.linkedDocId || doc.linkedDocId) ? { linkedDocId: form.linkedDocId || null } : {}),
    };
    const apply = async () => {
      const saved = await updateDocument(doc.id, patch);
      setDocs(doc.companyId, (docs) => docs.map((d) => (d.id === saved.id ? saved : d)));
    };

    if (doc.status === "draft") {
      try {
        await apply();
        await logActivity(doc.companyId, "document", `Edited ${DOC_LABEL[doc.docType].toLowerCase()} draft.`, doc.docType, doc.id);
      } catch (err) {
        console.error("save document failed:", err);
        fail("Failed to save the document.");
      }
      return;
    }

    // Issued documents change only with approval.
    const oldTotal = doc.total ?? 0;
    const newTotal = patch.lineItems!.reduce((a, li) => a + li.amount, 0);
    openGate({
      companyId: doc.companyId,
      targetKind: "document",
      targetId: doc.id,
      payload: {
        patch: patch as Record<string, unknown>,
        label: `${DOC_LABEL[doc.docType]} ${doc.docNo ?? ""}`.trim(),
        summary: `${DOC_LABEL[doc.docType]} ${doc.docNo ?? ""}: total ${oldTotal.toLocaleString("en-US")} → ${newTotal.toLocaleString("en-US")}`,
      },
      context: doc.docType,
      edits: [{ label: `${DOC_LABEL[doc.docType]} ${doc.docNo ?? ""}`, from: `total ${oldTotal.toLocaleString("en-US")}`, to: `total ${newTotal.toLocaleString("en-US")}` }],
      apply,
    });
  }

  
  async function createRevision(doc: CompanyDocument) {
    const rootId = doc.revisionOf ?? doc.id;
    const chain = (documentsByCompany[doc.companyId] ?? []).filter((d) => d.id === rootId || d.revisionOf === rootId);
    const nextRev = Math.max(1, ...chain.map((d) => d.revision)) + 1;
    try {
      const draft = await insertDocument({
        companyId: doc.companyId, docType: doc.docType, currency: doc.currency,
        lineItems: doc.lineItems.map((li) => ({ ...li })),
        validUntil: null, incoterms: doc.incoterms, paymentTerms: doc.paymentTerms,
        billTo: doc.billTo, shipTo: doc.shipTo, projectRef: doc.projectRef,
        discountPct: doc.discountPct, taxRate: doc.taxRate,
        terms: doc.terms, memo: doc.memo,
        revisionOf: rootId, revision: nextRev, createdByKey: me.id,
      });
      setDocs(doc.companyId, (docs) => [draft, ...docs]);
      await logActivity(doc.companyId, "document", `Created revision R${nextRev} of ${doc.docNo ?? "quotation"}.`, doc.docType, doc.id);
      setToast({ tone: "success", title: "New version", text: `${doc.docNo ?? "Quotation"} revision R${nextRev} draft created. Review and edit it before issuing.` });
    } catch (err) {
      console.error("create revision failed:", err);
      fail("Could not create the revision. Please try again.");
    }
  }

  async function issueDoc(doc: CompanyDocument) {
    const company = companies.find((c) => c.id === doc.companyId);
    // 번호 체계 2026-08-05 대표 확정: 상대코드 스코프 — nextDocNo(전역 연도 시퀀스)는 구 체계.
    // 고객이 보낸 PO(수신 기록)는 상대코드 체계 밖이라 구 채번을 그대로 쓴다.
    const prefix = doc.docType === "quotation" ? QUOTATION_PREFIX : doc.docType === "invoice" ? INVOICE_PREFIX : null;
    const partyCode = (company?.partyCode ?? "").trim().toUpperCase();
    // 개정본은 원본 번호 + "-R{n}"을 물려받는다 — 새 일련번호를 태우지 않는다.
    const root = doc.revisionOf ? (documentsByCompany[doc.companyId] ?? []).find((d) => d.id === doc.revisionOf) : null;
    const revisionNo = doc.revisionOf && root?.docNo ? `${root.docNo}-R${doc.revision}` : null;
    if (prefix && !doc.docNo && !revisionNo && !PARTY_CODE_RE.test(partyCode)) {
      setToast({
        tone: "danger",
        title: "Customer code required",
        text: `${company?.name ?? "This company"} needs a three-letter customer code. Set it under Edit company → Customer code before generating document numbers.`,
      });
      return;
    }
    try {
      // 취소(void)·삭제로 비게 된 번호가 있으면 새 번호를 태우지 않고 그 번호부터 이어 쓴다.
      let freed: string | undefined;
      if (prefix && !doc.docNo && !revisionNo) {
        try {
          const scopedPrefix = `${prefix}-${partyCode}-${new Date().getFullYear()}-`;
          const used = new Set(
            (documentsByCompany[doc.companyId] ?? [])
              .filter((d) => d.docType === doc.docType && d.docNo?.startsWith(scopedPrefix) && !d.docNo.endsWith("-VOID"))
              .map((d) => parseInt(d.docNo!.slice(scopedPrefix.length), 10))
              .filter((n) => !Number.isNaN(n)),
          );
          const last = await scopedCounterValue(prefix, partyCode);
          for (let n = 1; n <= last; n++) {
            if (!used.has(n)) { freed = `${scopedPrefix}${String(n).padStart(3, "0")}`; break; }
          }
        } catch {  }
      }
      const docNo = doc.docNo ?? revisionNo ?? freed ?? (prefix ? await nextScopedDocNo(prefix, partyCode) : await nextDocNo(doc.docType));
      const saved = await updateDocument(doc.id, { status: "issued", docNo, issueDate: new Date().toISOString().slice(0, 10) });
      setDocs(doc.companyId, (docs) => docs.map((d) => (d.id === saved.id ? saved : d)));
      await logActivity(doc.companyId, "document", `Issued ${DOC_LABEL[doc.docType].toLowerCase()} ${docNo}.${freed && docNo === freed ? " (reused a voided number)" : ""}`, doc.docType, doc.id);
      if (company) {
        if (doc.docType === "quotation") await maybeAdvanceStage(company, "quoted", `quotation ${docNo} issued`, doc.docType);
        if (doc.docType === "invoice") await maybeAdvanceStage(company, "won", `invoice ${docNo} issued`, doc.docType);
      }
      if (doc.dealId) {
        if (doc.docType === "quotation") void autoAdvanceDeal(doc.dealId, "quoting", `quotation ${docNo} issued`, doc.docType);
        if (doc.docType === "invoice") void autoAdvanceDeal(doc.dealId, "invoiced", `invoice ${docNo} issued`, doc.docType);
      }
      setToast({ tone: "success", title: "Issued", text: `${DOC_LABEL[doc.docType]} ${docNo} issued.` });
    } catch (err) {
      console.error("issue document failed:", err);
      fail("Failed to issue the document · numbering needs db/migrations/2026-08-05_quotation_po.sql applied in Supabase.");
    }
  }

  
  async function autoAdvanceDeal(dealId: string, to: DealStatus, cause: string, context: FeedContext) {
    try {
      const adv = await advanceDeal(dealId, to);
      if (!adv) return;
      setSelectedDeal((prev) => (prev && prev.id === dealId ? { ...prev, ...adv } : prev));
      if (adv.companyId) await logActivity(adv.companyId, "update", `Deal ${adv.dealNo} moved to ${DEAL_STATUS_LABEL[to]} (${cause}).`, context, dealId);
    } catch (err) {
      console.error("deal auto-advance failed:", err);
    }
  }

  
  function bumpSelectedDealDoc(dealId: string | null, docType: DocType) {
    if (!dealId) return;
    setSelectedDeal((prev) =>
      prev && prev.id === dealId
        ? { ...prev, docCounts: { ...prev.docCounts, [docType]: (prev.docCounts[docType] ?? 0) + 1 } }
        : prev);
  }

  
  async function changeDealStatus(deal: DealSummary, status: DealStatus) {
    try {
      const saved = await updateDeal(deal.id, { status });
      setSelectedDeal({ ...deal, ...saved });
      if (deal.companyId) await logActivity(deal.companyId, "update", `Deal ${deal.dealNo} moved to ${status}.`, "spec", deal.id);
    } catch (err) {
      console.error("deal status change failed:", err);
      fail("Failed to change the deal stage.");
    }
  }

  
  async function voidDoc(doc: CompanyDocument) {
    try {
      const saved = await updateDocument(doc.id, {
        status: "void",
        ...(doc.docNo && !doc.docNo.endsWith("-VOID") ? { docNo: `${doc.docNo}-VOID` } : {}),
      });
      setDocs(doc.companyId, (docs) => docs.map((d) => (d.id === saved.id ? saved : d)));
      await logActivity(doc.companyId, "document", `Voided ${DOC_LABEL[doc.docType].toLowerCase()} ${doc.docNo ?? ""} · number freed for reuse.`, doc.docType, doc.id);
    } catch (err) {
      console.error("void document failed:", err);
      fail("Failed to void the document.");
    }
  }

  
  async function linkDealToDoc(doc: CompanyDocument, dealId: string) {
    try {
      const saved = await updateDocument(doc.id, { dealId: dealId || null });
      setDocs(doc.companyId, (docs) => docs.map((d) => (d.id === saved.id ? saved : d)));
      await logActivity(doc.companyId, "document", `Linked ${DOC_LABEL[doc.docType].toLowerCase()} ${doc.docNo ?? "(draft)"} to a deal.`, doc.docType, doc.id);
    } catch (err) {
      console.error("link deal failed:", err);
      fail("Failed to link the deal.");
    }
  }

  async function removeDoc(doc: CompanyDocument) {
    try {
      await deleteDocument(doc.id);
      setDocs(doc.companyId, (docs) => docs.filter((d) => d.id !== doc.id));
      await logActivity(doc.companyId, "document", `Deleted a ${DOC_LABEL[doc.docType].toLowerCase()} draft.`, doc.docType);
    } catch (err) {
      console.error("delete document failed:", err);
      fail("Failed to delete the draft.");
    }
  }

  async function sendToFinance(doc: CompanyDocument) {
    const company = companies.find((c) => c.id === doc.companyId);
    try {
      await sendInvoiceToFinance(doc, company?.name ?? "");
      await logActivity(doc.companyId, "document", `Saved local finance handoff for invoice ${doc.docNo ?? ""}.`, "invoice", doc.id);
      setToast({ tone: "success", title: "Finance handoff saved", text: "Saved in this workspace. A separate Finance service connection is required for delivery." });
    } catch (err) {
      console.error("send to finance failed:", err);
      fail("Failed to save the finance handoff.");
    }
  }

  // ---- Comments / company CRUD (unchanged) ------------------------------------

  async function addComment(text: string, parentId: string | null = null) {
    if (!selectedId) return;
    try {
      const next = await insertComment(selectedId, me.id, text, parentId, detailTab, feedTarget);
      setCommentsByCompany((prev) => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), next] }));
      // @멘션된 팀원에게 상단 벨 알림 (실패해도 댓글은 유지).
      void notifyMentions({
        body: text,
        actorKey: me.id,
        title: `[${screen === "engineering" ? "Engineering" : "CRM"}] ${selected?.name ?? "Company"} · ${FEED_LABEL[detailTab]}`,
        link: "/crm",
      });
    } catch (err) {
      console.error("add comment failed:", err);
      fail("Failed to post the comment.");
    }
  }

  
  async function removeComment(commentId: string) {
    if (!selectedId) return;
    try {
      await deleteComment(commentId);
      setCommentsByCompany((prev) => ({
        ...prev,
        [selectedId]: (prev[selectedId] ?? []).filter((c) => c.id !== commentId && c.parentId !== commentId),
      }));
    } catch (err) {
      console.error("delete comment failed:", err);
      fail("Failed to delete the comment.");
    }
  }

  function openCreate() {
    setCompanyFormError(null);
    setForm({ mode: "create", company: blankCompany(companies) });
  }
  async function submitForm(company: Company) {
    if (companySaving) return;
    const isCreate = form?.mode === "create";
    setCompanySaving(true);
    setCompanyFormError(null);
    try {
      if (isCreate) {
        const created = await insertCompany(company);
        setCompanies((prev) => [created, ...prev]);
        setSelectedId(created.id);
        setDetailTab("spec");
        setSelectedDeal(null);
        setSpecVersionSel(null);
        setDocSel(null);
        let specsReady = true;
        try {
          const sections = await insertSpecs(created.id, specsForCompany(created));
          setSpecsByCompany((prev) => ({ ...prev, [created.id]: sections }));
        } catch (err) {
          specsReady = false;
          console.error("company spec initialization failed:", err);
          fail("The company was created, but its initial specification could not be prepared. Refresh the company before continuing.");
        }
        await logActivity(created.id, "create", "Added the company manually.");
        if (specsReady) setToast({ tone: "success", title: "Company created", text: `Add a deal and its requirements for ${created.name || "this company"}.` });
      } else {
        const saved = await updateCompany(company.id, company);
        setCompanies((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        await logActivity(company.id, "update", "Edited company details.");
      }
      setForm(null);
    } catch (err) {
      console.error("submit company failed:", err);
      setCompanyFormError(isCreate ? "Could not add the company. Your inputs are kept. Try again." : "Could not save company details. Your inputs are kept. Try again.");
    } finally {
      setCompanySaving(false);
    }
  }
  async function confirmDelete() {
    const prevCompanies = companies;
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setCompanies((prev) => prev.filter((c) => c.id !== target.id));
    if (selectedId === target.id) setSelectedId(null);
    try {
      await deleteCompany(target.id);
      setToast({ tone: "success", title: "Processed", text: `Deleted ${target.name || "company"}.` });
    } catch (err) {
      console.error("delete company failed:", err);
      setCompanies(prevCompanies); // restore the optimistically-removed row
      fail("Failed to delete the company.");
    }
  }

  
  async function bulkPatchCompanies(ids: string[], patch: Partial<Company>) {
    try {
      const saved: Company[] = [];
      for (const id of ids) saved.push(await updateCompany(id, patch));
      setCompanies((prev) => prev.map((c) => saved.find((s) => s.id === c.id) ?? c));
      setToast({ tone: "success", title: "Processed", text: `Updated ${ids.length} compan${ids.length === 1 ? "y" : "ies"}.` });
    } catch (err) {
      console.error("bulk update failed:", err);
      fail("Failed to update some companies. Refresh to see the saved state.");
    }
  }

  
  async function bulkDeleteCompanies(ids: string[]) {
    const prevCompanies = companies;
    setCompanies((prev) => prev.filter((c) => !ids.includes(c.id)));
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    try {
      for (const id of ids) await deleteCompany(id);
      setToast({ tone: "success", title: "Processed", text: `Deleted ${ids.length} compan${ids.length === 1 ? "y" : "ies"}.` });
    } catch (err) {
      console.error("bulk delete failed:", err);
      setCompanies(prevCompanies); // restore the optimistically-removed rows
      fail("Failed to delete some companies. Refresh to see the saved state.");
    }
  }

  async function toggleCommentReaction(commentId: string, emoji: string, on: boolean) {
    if (!selectedId) return;
    const prevComments = commentsByCompany;
    // optimistic
    setCommentsByCompany((prev) => {
      const list = prev[selectedId] ?? [];
      const updated = list.map((c) => {
        if (c.id !== commentId) return c;
        const others = c.reactions.filter((r) => r.emoji !== emoji);
        const cur = c.reactions.find((r) => r.emoji === emoji);
        const userIds = new Set(cur?.userIds ?? []);
        if (on) userIds.add(me.id);
        else userIds.delete(me.id);
        const reactions = userIds.size ? [...others, { emoji, userIds: [...userIds] }] : others;
        return { ...c, reactions };
      });
      return { ...prev, [selectedId]: updated };
    });
    try {
      await setReaction(commentId, me.id, emoji, on);
    } catch (err) {
      console.error("reaction failed:", err);
      setCommentsByCompany(prevComments);
      fail("Failed to update the reaction.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className={selected ? "sx-stack-m" : "sx-page-wide"} style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
        {}
        {selected && screen === "sales" && railPanel.floating && (
          <button type="button" className="sx-edge-strip sx-edge-strip--left sx-desktop-only" aria-label="Show companies" title="Companies"
            onMouseEnter={railPanel.show} onMouseLeave={railPanel.cancel} onClick={railPanel.openNow}>
            <ChevronRight size={12} />
          </button>
        )}
        {selected && screen === "sales" && (
          <nav ref={railPanel.panelRef} className={`sx-desktop-only${railPanel.floating ? " sx-edge-floating sx-edge-floating--left" : ""}`} aria-label="Companies"
            onMouseEnter={railPanel.floating ? railPanel.cancel : undefined} onMouseLeave={railPanel.floating ? railPanel.hide : undefined}
            style={{ width: railWidth, flexShrink: 0, borderRight: "1px solid var(--border-subtle)", background: "var(--surface-card)", display: railPanel.floating && !railPanel.open ? "none" : "flex", flexDirection: "column", minHeight: 0, ...(railPanel.floating ? { left: 0 } : { position: "relative" as const }) }}>
            <div onMouseDown={startRailResize} role="separator" aria-orientation="vertical" aria-label="Resize companies rail" title="Drag to resize"
              style={{ position: "absolute", top: 0, right: -3, bottom: 0, width: 6, cursor: "col-resize", zIndex: 5 }} />
            <div style={{ flexShrink: 0, padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={() => setSelectedId(null)}
                style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "var(--font-sans)" }}>
                <ArrowLeft size={12} /> Pipeline
              </button>
              <span style={{ flex: 1 }} />
              {!mobile && (
                <Button variant="ghost" size="sm" iconOnly aria-pressed={railPanel.pinned}
                  aria-label={railPanel.pinned ? "Unpin companies panel" : "Pin companies panel"}
                  title={railPanel.pinned ? "Unpin — opens when you point at the left edge" : "Pin open"}
                  onClick={railPanel.togglePin}>
                  {railPanel.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                </Button>
              )}
              </div>
              <input
                value={sideSearch}
                onChange={(e) => setSideSearch(e.target.value)}
                placeholder="Search…"
                aria-label="Search companies"
                style={{ width: "100%", boxSizing: "border-box", padding: "5px 9px", borderRadius: 7, border: "1px solid var(--border-subtle)", background: "var(--surface-default)", color: "var(--text-default)", fontSize: "var(--text-xs)" }}
              />
            </div>
            <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 6px 10px" }}>
              {companies
                .filter((c) => !sideSearch.trim() || `${c.name} ${c.ref}`.toLowerCase().includes(sideSearch.trim().toLowerCase()))
                .sort((a, b) => Number(favoriteIds.includes(b.id)) - Number(favoriteIds.includes(a.id)))
                .map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center" }}>
                  <button type="button" onClick={() => { if (c.id !== selected.id) openCompany(c.id); railPanel.close(); }}
                    style={{
                      display: "block", flex: 1, minWidth: 0, textAlign: "left", border: "none", cursor: "pointer",
                      borderRadius: 8, padding: "7px 9px", fontFamily: "var(--font-sans)",
                      background: c.id === selected.id ? "var(--color-primary-soft, #eef2ff)" : "none",
                    }}>
                    <span style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: c.id === selected.id ? 700 : 500, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ display: "block", fontSize: "var(--text-2xs)", fontFamily: "var(--font-mono)", color: "var(--text-subtle)" }}>{c.partyCode || c.ref}</span>
                  </button>
                  <CompanyFavoriteButton name={c.name} favorite={favoriteIds.includes(c.id)} disabled={!favoritesReady || favoriteBusy} onToggle={() => void toggleFavorite(c.id)} />
                  </div>
                ))}
            </div>
          </nav>
        )}
        {}
        <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {loading ? (
            <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-muted)", gap: 10 }}>
              <Spinner size="lg" />
              <span style={{ fontSize: "var(--text-sm)" }}>Loading {screen === "engineering" ? "Engineering" : "CRM"}…</span>
            </div>
          ) : selected ? (
            <>
              {}
              {screen === "sales" && companyTab === "log" && (
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "10px 20px 6px" }}>
                  <span style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selected.name}
                  </span>
                  <Tabs
                    variant="enclosed"
                    value={companyTab}
                    onChange={(v) => setCompanyTab(v as CompanyTab)}
                    items={[
                      { value: "documents", label: "Documents" },
                      { value: "log", label: "Log" },
                    ]}
                    style={{ marginLeft: "auto" }}
                  />
                </div>
              )}
              {screen === "sales" && companyTab === "log" ? (
                <div style={{ flex: 1, minHeight: 0 }}>
                  {}
                  <ActivityFeed
                    activities={activitiesByCompany[selected.id] ?? []}
                    comments={commentsByCompany[selected.id] ?? []}
                    onReact={toggleCommentReaction}
                    onAddComment={addComment}
                    onDeleteComment={removeComment}
                  />
                </div>
                            ) : (
            <RequirementTable
              fcPrefill={aiPrefill}
              headerRight={screen === "sales" ? (
                <Tabs
                  variant="enclosed"
                  value={companyTab}
                  onChange={(v) => setCompanyTab(v as CompanyTab)}
                  items={[
                    { value: "documents", label: "Documents" },
                    { value: "log", label: "Log" },
                  ]}
                />
              ) : undefined}
              view={screen}
              onShowCompanies={screen === "sales" && railPanel.floating ? railPanel.openNow : undefined}
              buildsLoading={screen === "engineering" && !buildsByCompany[selected.id]}
              documentsLoading={!documentsByCompany[selected.id]}
              focusBuildId={focusBuildId}
              specRequestId={specRequestLink}
              company={selected}
              tab={detailTab}
              onTabChange={(t) => { setDetailTab(t); setSpecVersionSel(null); setDocSel(null); }}
              documents={documents}
              pendingForCompany={pendingForSelected}
              canSendToFinance={canAccess("finance", me)}
              onBack={() => setSelectedId(null)}
              onDelete={() => setDeleteTarget(selected)}
              onUpload={() => setUploadOpen(true)}
              onCreateDoc={createDoc}
              onSaveDoc={saveDoc}
              onIssueDoc={issueDoc}
              onDeleteDoc={removeDoc}
              onSendToFinance={sendToFinance}
              onCreateRevision={createRevision}
              meId={me.id}
              builds={buildsByCompany[selected.id] ?? []}
              buildFiles={buildFilesByCompany[selected.id] ?? {}}
              onBuildsChanged={() => reloadBuilds(selected.id)}
              onSelectSpecVersion={setSpecVersionSel}
              onSelectDoc={setDocSel}
              onEmailDoc={async (doc, opts) => {
                const r = await notifyByEmail({
                  recipients: opts.to,
                  ...(opts.cc.length ? { cc: opts.cc } : {}),
                  ...(opts.bcc.length ? { bcc: opts.bcc } : {}),
                  subject: opts.subject,
                  bodyText: opts.message,
                  ...(opts.html ? { bodyHtml: opts.html } : {}),
                  ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
                  external: true,
                });
                if (r?.error || !r?.sent) {
                  fail(r?.error === "no_google_token" || r?.error === "token_refresh_failed"
                    ? "Email not sent. Sign in with the Google button so Pulse can send from your account."
                    : r?.error === "no_gmail_scope"
                      ? "Email not sent. Sign out and back in with Google to grant the email permission."
                      : `Email not sent (${r?.error ?? "unknown"}).`);
                  return;
                }
                const recipientsLabel = opts.to.join(", ")
                  + (opts.cc.length ? ` (cc: ${opts.cc.join(", ")})` : "")
                  + (opts.bcc.length ? ` (bcc: ${opts.bcc.length})` : "");
                const entry = await insertActivity(selected.id, me.id, "document", `${DOC_LABEL[doc.docType]} ${doc.docNo ?? "(draft)"} emailed to ${recipientsLabel}.`, doc.docType, doc.id);
                setActivitiesByCompany((prev) => ({ ...prev, [selected.id]: [...(prev[selected.id] ?? []), entry] }));
                setToast({ tone: "success", title: "Email sent", text: `Email sent to ${recipientsLabel}.` });
              }}
              onCreateInvoiceFromPo={createInvoiceFromPo}
              onVoidDoc={voidDoc}
              onLinkDealDoc={linkDealToDoc}
              selectedDeal={selectedDeal}
              onSelectDeal={setSelectedDeal}
              onLogFeed={(summary, context) => logActivity(selected.id, "update", summary, context)}
              onCompanyPatch={(patch) => updateSelected(patch)}
              onEditCompany={() => { setCompanyFormError(null); setForm({ mode: "edit", company: selected }); }}
              onLogSpec={async (summary, targetId) => {
                const entry = await insertActivity(selected.id, me.id, "update", summary, "spec", targetId ?? null);
                setActivitiesByCompany((prev) => ({ ...prev, [selected.id]: [...(prev[selected.id] ?? []), entry] }));
              }}
              onSpecSynced={() => {
                void fetchCompanySpecs(selected.id)
                  .then((sections) => setSpecsByCompany((prev) => ({ ...prev, [selected.id]: sections })))
                  .catch((err) => console.error("spec refresh failed:", err));
              }}
              onLogEngineering={async (summary) => {
                // Unlike logActivity, engineering logs THROW on failure so the
                // panel surfaces the error instead of silently dropping it.
                const entry = await insertActivity(selected.id, me.id, "update", summary, "engineering");
                setActivitiesByCompany((prev) => ({ ...prev, [selected.id]: [...(prev[selected.id] ?? []), entry] }));
              }}
              onRefresh={async () => {
                await Promise.all([
                  reloadBuilds(selected.id),
                  fetchDocuments(selected.id).then((docs) =>
                    setDocumentsByCompany((prev) => ({ ...prev, [selected.id]: docs })),
                  ),
                ]);
              }}
            />
              )}
            </>
          ) : (
            <>
              <div className="crm-pipeline-toolbar" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "12px 20px 8px" }}>
                <Tabs
                  variant="enclosed"
                  value={view}
                  onChange={(v) => {
                    // sales의 Companies 탭 = 목록이 아니라 마지막에 보던 회사로 직행 (2026-10-02)
                    if (screen === "sales" && v === "table") {
                      let last: string | null = null;
                      try { last = window.localStorage.getItem(`crm.lastCompany.${screen}`); } catch {  }
                      const target = (last && companies.some((c) => c.id === last)) ? last : companies[0]?.id;
                      if (target) openCompany(target);
                      return;
                    }
                    setView(v as View);
                  }}
                  items={screen === "sales" ? [
                    { value: "board", label: "Pipeline" },
                    { value: "table", label: "Companies" },
                  ] : [
                    { value: "board", label: "Board" },
                    { value: "table", label: "Table" },
                  ]}
                />
                <div className="crm-pipeline-actions" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", maxWidth: "100%", gap: 8 }}>
                  <Button variant="ghost" size="sm" iconOnly aria-label="How the CRM works" title="How the CRM works" onClick={() => setManualOpen(true)}>
                    <Info size={15} />
                  </Button>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{companies.length} companies</span>
                  <Button variant="secondary" size="sm" leftIcon={<UploadIcon size={15} />} onClick={() => setUploadOpen(true)}>Upload</Button>
                  <Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={openCreate}>New company</Button>
                </div>
              </div>
              {}
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "4px 20px 20px" }}>
                {view === "board" ? (
                  <>
                    <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
                    <CrmStats companies={companies} />
                    {}
                    <DealsBoard
                      companies={companies}
                      companyName={(id) => (id ? (companies.find((c) => c.id === id)?.name ?? "?") : "In-house")}
                      onOpenCompany={openCompany}
                      refreshKey={dealsRefresh}
                      {...(screen === "sales" ? {
                        selectedDealId: boardDeal?.id ?? null,
                        onSelectDeal: (d: DealSummary) => { setBoardDeal(d); setBoardCompany(null); },
                        onSelectCompany: (c: Company, stage: CompanyBoardStage) => { setBoardCompany({ company: c, stage }); setBoardDeal(null); },
                      } : {})}
                      onMoved={(deal, status) => {
                        if (deal.companyId) void logActivity(deal.companyId, "update", `Deal ${deal.dealNo} moved to ${status}.`, "spec", deal.id);
                        setAllDeals((list) => list.map((d) => (d.id === deal.id ? { ...d, status } : d)));
                        setBoardDeal((cur) => (cur?.id === deal.id ? { ...cur, status } : cur));
                      }}
                    />
                    </div>
                    {screen === "sales" && (boardDeal || boardCompany) && (
                      <div style={{ flexShrink: 0, paddingTop: 2 }}>
                        <div onMouseDown={startBoardPanelResize} role="separator" aria-orientation="horizontal" aria-label="Resize detail panel" title="Drag to resize"
                          style={{ height: 8, cursor: "row-resize", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ width: 44, height: 4, borderRadius: 999, background: "var(--border-strong)" }} />
                        </div>
                        {}
                        <div className="sx-scroll" style={{ maxHeight: boardPanelH, overflow: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--surface-card)" }}>
                          {boardCompany ? (
                            
                            <CompanyStagePanel
                              key={`${boardCompany.company.id}:${boardCompany.stage}`}
                              company={boardCompany.company}
                              stage={boardCompany.stage}
                              onOpenCompany={(id, tab) => (tab === "documents" ? openCompany(id, "documents") : openCompany(id))}
                              onLogActivity={(id) => setActivityModal({ companyId: id, defaultDealId: null })}
                              onClose={() => setBoardCompany(null)}
                            />
                          ) : boardDeal && (
                      <DealWorkspace
                        key={`${boardDeal.id}:${boardDeal.status}`}
                        deal={boardDeal}
                        companyName={boardDeal.companyId ? (companies.find((c) => c.id === boardDeal.companyId)?.name ?? "?") : "In-house"}
                        onOpenCompany={(id, tab) => openCompany(id, tab === "overview" ? "documents" : tab)}
                        onStatusChange={(deal, status) => {
                          void (async () => {
                            try {
                              await updateDeal(deal.id, { status });
                              setBoardDeal({ ...deal, status });
                              setAllDeals((list) => list.map((d) => (d.id === deal.id ? { ...d, status } : d)));
                              setDealsRefresh((n) => n + 1);
                              if (deal.companyId) void logActivity(deal.companyId, "update", `Deal ${deal.dealNo} moved to ${status}.`, "spec", deal.id);
                            } catch (err) {
                              console.error("deal status change failed:", err);
                              fail("Failed to change the deal stage.");
                            }
                          })();
                        }}
                        onLogActivity={(deal) => {
                          if (deal.companyId) setActivityModal({ companyId: deal.companyId, defaultDealId: deal.id });
                        }}
                      />
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                    <CompanyTable companies={companies} onSelect={openCompany}
                      favoriteIds={favoriteIds} favoritesDisabled={!favoritesReady || favoriteBusy}
                      onToggleFavorite={screen === "sales" ? id => void toggleFavorite(id) : undefined}
                      ownerField={screen === "engineering" ? "engOwnerId" : "ownerId"}
                      showValue={screen !== "engineering"}
                      onBulkPatch={(ids, patch) => void bulkPatchCompanies(ids, patch)}
                      onBulkDelete={(ids) => void bulkDeleteCompanies(ids)} />
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {}
        {!(screen === "sales" && !selected) && (
        <>
        {detailsPanel.floating ? (
          <button type="button" className="sx-edge-strip sx-edge-strip--right" aria-label="Show details" title="Details"
            onMouseEnter={detailsPanel.show} onMouseLeave={detailsPanel.cancel} onClick={detailsPanel.openNow}>
            <ChevronLeft size={12} />
          </button>
        ) : (
        <div
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          title="Drag to resize"
          style={{ width: 6, flexShrink: 0, cursor: "col-resize", background: "transparent", transition: "background 0.12s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-soft)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        />
        )}

        {}
        <aside ref={detailsPanel.panelRef} className={detailsPanel.floating ? "sx-edge-floating sx-edge-floating--right" : undefined}
          onMouseEnter={detailsPanel.floating ? detailsPanel.cancel : undefined} onMouseLeave={detailsPanel.floating ? detailsPanel.hide : undefined}
          style={{ width: rightWidth, flexShrink: 0, borderLeft: "1px solid var(--border-subtle)", background: "var(--surface-card)", display: detailsPanel.floating && !detailsPanel.open ? "none" : "flex", flexDirection: "column", minHeight: 0, ...(detailsPanel.floating ? { right: 0 } : { position: "relative" as const }) }}>
          {screen === "sales" && !mobile && (
            <Button variant="ghost" size="sm" iconOnly aria-pressed={detailsPanel.pinned}
              aria-label={detailsPanel.pinned ? "Unpin details panel" : "Pin details panel"}
              title={detailsPanel.pinned ? "Unpin — opens when you point at the right edge" : "Pin open"}
              onClick={detailsPanel.togglePin}
              style={{ position: "absolute", top: 6, right: 8, zIndex: 2 }}>
              {detailsPanel.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </Button>
          )}
          {!selected ? (
            <GlobalActivityPanel
              meId={me.id} activitiesByCompany={activitiesByCompany} companies={companies} onOpenCompany={openCompany} />
          ) : (
            <>
              <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border-subtle)" }}>
                <DetailPanel company={selected} onChange={updateSelected} variant={screen} sectors={allowedSectors(ALL_SECTORS, me)}
                  deal={selectedDeal} onDealStatusChange={(d, st) => void changeDealStatus(d, st)} />
              </div>
              {screen === "sales" ? (
                
                <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "10px 14px 16px" }}>
                  <CompanyOverview
                    company={selected}
                    deals={allDeals}
                    activities={activitiesByCompany[selected.id] ?? []}
                    documents={documents}
                    documentsLoading={!documentsByCompany[selected.id]}
                    comments={commentsByCompany[selected.id] ?? []}
                    onAddComment={(text) => addComment(text)}
                    allCompanies={companies}
                    refreshKey={overviewRefresh}
                    onLogActivity={() => setActivityModal({ companyId: selected.id, defaultDealId: null })}
                    onSelectDeal={(d) => { setSelectedDeal(d); setDetailTab("spec"); setCompanyTab("documents"); }}
                    onOpenStep={(step, prefill) => {
                      setAiPrefill(step === "first_contact" ? prefill ?? null : null);
                      setSpecVersionSel(null);
                      setDocSel(null);
                      setSelectedDeal(null);
                      setDetailTab(step);
                      setCompanyTab("documents");
                    }}
                  />
                </div>
              ) : (
                <>
                  <div style={{ flexShrink: 0, padding: "8px 16px 0", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-subtle)" }}>
                      {FEED_LABEL[detailTab]}{feedTargetLabel ? ` · ${feedTargetLabel}` : ""} · log &amp; comments
                    </span>
                  </div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <ActivityFeed activities={activities} comments={comments} onReact={toggleCommentReaction} onAddComment={addComment} onDeleteComment={removeComment} />
                  </div>
                </>
              )}
            </>
          )}
        </aside>
        </>
        )}
      </div>

      <UploadModal open={uploadOpen} busy={busy} onIntake={handleIntake} onClose={() => setUploadOpen(false)} />
      <CrmManualModal open={manualOpen} onClose={() => setManualOpen(false)} />

      {}
      {activityModal && (() => {
        const c = companies.find((x) => x.id === activityModal.companyId);
        if (!c) return null;
        return (
          <SalesActivityModal
            open
            companyId={c.id}
            companyName={c.name}
            deals={allDeals}
            defaultDealId={activityModal.defaultDealId}
            onClose={() => setActivityModal(null)}
            onSaved={(r: SalesActivitySaved) => {
              if (r.newDeal) {
                setDealsRefresh((n) => n + 1);
                setToast({ tone: "success", title: "Deal created", text: `${r.newDeal.dealNo} started at First contact.` });
              }
              setOverviewRefresh((n) => n + 1);
            }}
          />
        );
      })()}

      {review && (
        <ReviewModal
          open
          source={review.source}
          drafts={review.drafts}
          companies={companies}
          specsFor={(id) => specsByCompany[id]}
          onConfirm={confirmReview}
          onCancel={() => setReview(null)}
        />
      )}

      {form && (
        <CompanyFormModal
          open
          mode={form.mode}
          saving={companySaving}
          error={companyFormError}
          initial={form.company}
          sectors={allowedSectors(ALL_SECTORS, me)}
          onSubmit={submitForm}
          onCancel={() => setForm(null)}
        />
      )}

      {gate && (
        <ReasonModal
          open
          edits={gate.edits}
          isApprover={isApprover}
          onSubmit={gate.file}
          onCancel={() => setGate(null)}
        />
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="Delete company"
        subtitle={deleteTarget ? `${deleteTarget.name} · ${deleteTarget.ref}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}>Delete</Button>
          </>
        }
      >
        This removes the company and its requirement table from the list. This can’t be undone.
      </Modal>

      {toast && (
        <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 50, width: 360 }}>
          <Toast tone={toast.tone} title={toast.title} onClose={() => setToast(null)}>
            {toast.text}
          </Toast>
        </div>
      )}
    </div>
  );
}
