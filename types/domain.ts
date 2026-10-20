/* Workspace dashboard domain types.
   Shapes mirror the planned Supabase tables so the mock seam (lib/mock, lib/auth)
   can be swapped for real queries without changing consumers. */

export type Team = "engineer" | "exec" | "support" | "manufacturing";
export type Role = "member" | "admin";

export interface User {
  id: string;
  email: string;
  fullName: string;
  team: Team;
  /** Free-form job title, e.g. "Sales engineer", "CEO". */
  title: string;
  role: Role;
  avatarUrl: string | null;
  /** Per-user tool-access overrides (toolKey → allowed). Empty = team defaults.
     Set by admins on the Admin page; read by canAccess. */
  toolAccess?: Record<string, boolean>;
  /** Stored tool defaults (app_settings) resolved for this user's team at
     load time — canAccess falls back here before the built-in defaults. */
  defaultAccess?: Record<string, boolean>;
}

/** CRM pipeline stages (company progress). */
export type Stage = "lead" | "in_review" | "spec" | "quoted" | "won" | "lost";
export type Importance = "low" | "med" | "high";

export interface Company {
  id: string;
  /** Quote/record id shown in mono, e.g. "Q-2041". */
  ref: string;
  /** 3-letter uppercase counterparty code used in quotation/invoice numbers
     (DOC-Q-ACC-2026-001). Empty until an admin sets it. */
  partyCode: string;
  name: string;
  sector: string;
  stage: Stage;
  ownerId: string;
  /** Engineering 트랙 담당자 — CRM(영업) ownerId와 별도 (2026-09-02 SQL eng_owner_key). */
  engOwnerId: string;
  contact: string;
  importance: Importance;
  /** Quote value in USD; null until quoted. */
  value: number | null;
  /** 0–100 progress within the pipeline. */
  progress: number;
  /** 청구지 주소(멀티라인) — 견적 편집기의 "Customer address" 채움 원천 (2026-09-03 SQL).
     mock 데이터 호환을 위해 optional; DB에서는 mapCompany가 항상 채운다. */
  address?: string;
  /** NDA 진행 — 프로세스 ②단계 (2026-09-17b SQL; 미실행 DB는 'none'으로 폴백). */
  ndaStatus?: "none" | "in_review" | "signed";
  ndaSignedOn?: string | null;
  /** 연결된 NDA 파일(doc_items id, Library → Engineering → NDA) — 2026-09-17e SQL. */
  ndaDocId?: string | null;
  updatedAt: string;
}

/** A row in a company's engineering requirement sheet (the SpecSheet). */
export type SpecSection = "process_data" | "customer_specs" | "liquid_properties";

export interface Spec {
  id: string;
  companyId: string;
  section: SpecSection;
  parameter: string;
  symbol: string;
  unit: string;
  valueHot: string;
  valueCold: string;
}

export type ActivityType =
  | "create"
  | "update"
  | "comment"
  | "upload"
  | "document"
  | "approval_requested"
  | "approved"
  | "rejected";

/** Sales document stages that follow the spec sheet. */
export type DocType = "quotation" | "purchase_order" | "invoice";
export type DocStatus = "draft" | "issued" | "accepted" | "void";

export interface DocLineItem {
  name: string;
  qty: number;
  /** Unit of measure printed next to the quantity (pcs, set, lot…). */
  unit?: string;
  unitPrice: number;
  amount: number;
  note?: string;
  /** false = 참고 단가 라인 — 합계(subtotal/total)에서 제외. 없으면 true 취급. */
  billed?: boolean;
  /** 아이템 이미지 스토리지 경로 — "doc-items/"는 docs 버킷, 그 외는 builds 버킷(빌드 사진 재사용). */
  imagePath?: string;
}

export interface CompanyDocument {
  id: string;
  companyId: string;
  docType: DocType;
  /** Assigned at issue time, e.g. "DOC-Q-2026-001". Null while draft. */
  docNo: string | null;
  status: DocStatus;
  issueDate: string | null;
  validUntil: string | null;
  currency: string;
  lineItems: DocLineItem[];
  amount: number | null;
  tax: number | null;
  total: number | null;
  /** Incoterms (EXW, DAP, FOB…). */
  incoterms: string;
  paymentTerms: string;
  /** QUOTE FOR block — customer name + address, multi-line. */
  billTo: string;
  shipTo: string;
  projectRef: string;
  /** Discount applied to the line-item subtotal, in percent. */
  discountPct: number;
  /** Sales tax applied to the discounted net, in percent. */
  taxRate: number;
  /** Terms & conditions body (multi-line). */
  terms: string;
  memo: string;
  /** 발신(당사) 주소 선택 — 'us' 본사 / 'kr' 한국지사 (인쇄 발신 블록). */
  fromAddr: "us" | "kr";
  /** 커머셜 스파인 — 이 문서가 속한 딜 (2026-08-26b SQL). */
  dealId: string | null;
  /** 연결 문서 — 고객 PO ↔ 그 근거 견적 (2026-09-02d SQL). */
  linkedDocId: string | null;
  /** 버전 체인의 원본 문서 id — 원본 자신은 null. */
  revisionOf: string | null;
  /** 1부터. 발행 번호는 원본 번호 + "-R{revision}" (revision 2+). */
  revision: number;
  createdByKey: string;
  updatedAt: string;
}

/** 견적 라인아이템 재사용 카탈로그 (2026-08-06b SQL). */
export interface CatalogItem {
  id: string;
  modelCode: string;
  name: string;
  unit: string;
  unitPrice: number;
  currency: string;
  active: boolean;
}

/** Company identity printed on quotations and purchase orders. Stored as a
   single row in org_settings and editable on the Admin page. */
export interface OrgSettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  web: string;
  /** Registered address — legal/registration use only. */
  registeredAddress: string;
  /** 한국지사 주소 블록 — 구매 PO의 Ship to 선택지 (여러 줄). */
  addressKr: string;
}

/** Procurement (buy side): vendors Workspace issues purchase orders to. Kept out
   of the CRM `companies` table on purpose — vendors are not deals. */
export interface Vendor {
  id: string;
  /** 3-letter uppercase code used in the PO number (DOC-BLT-2026-001). */
  code: string;
  legalName: string;
  /** 벤더 분류 (LPBF Supplier·Post Process 등) — 화면 셀렉트로 선택. */
  category: string;
  address: string;
  contact: string;
  email: string;
  phone: string;
  memo: string;
  /** 트래커 Vendors 시트 확장 (2026-08-11b SQL). */
  country: string;
  /** Prospect → NDA Signed → Under Audit → Approved → On Hold → Disqualified ('' = 미지정). */
  registrationStatus: string;
  capability: string;
  materials: string;
  leadTimeDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorSite {
  id: string;
  vendorId: string;
  name: string;
  address: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Parts 트래커 한 행 — 지오메트리(부품) 단위 (2026-08-11b SQL). */
export interface Part {
  id: string;
  /** 내부 식별자 (DOC-ACC-26-001) — 벤더에게 절대 노출하지 않는다. */
  partId: string;
  /** Operator-defined internal name. */
  name: string;
  /** 벤더에게 보이는 유일한 이름 (DOC-BLT-P001). */
  externalRef: string;
  rev: string;
  /** 고객사명 (customer …) 또는 내부 프로그램 (Standard Model …). */
  program: string;
  material: string;
  /** Operator-entered dimensions. */
  sizeLwh: string;
  qty: number;
  stage: string;
  status: string;
  /** Where is it now — 물리 위치. */
  location: string;
  locationVendorId?: string | null;
  locationVendorSiteId?: string | null;
  locationCompanyId?: string | null;
  locationDetail?: string;
  vendorId: string | null;
  /** Vendor Package 인쇄에 실리는 Note to Vendor. */
  vendorNote: string;
  nextAction: string;
  ownerKey: string;
  storage: string;
  fileNtop: string;
  fileStl: string;
  fileStep: string;
  fileCfd: string;
  fileCt: string;
  notionLink: string;
  notes: string;
  /** Engineering 빌드 연동 (프리필 원천). */
  buildId: string | null;
  /** 딜 직접 연결 (2026-09-21 SQL) — Procurement 패널의 딜 카드 스코프. */
  dealId: string | null;
  /** 회사 도착 (Mark arrived) / 검수 완료 (Mark inspected) — 2026-09-21 SQL. */
  arrivedAt: string | null;
  inspectedAt: string | null;
  inspectedBy: string;
  inspectionNote: string;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface PoLineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  /** Promised lead time / delivery date for this line. */
  delivery: string;
  /** false = 참고 단가 라인 — 합계에서 제외 (인쇄 렌더가 소비). 없으면 true 취급. */
  billed?: boolean;
}

export interface VendorPo {
  id: string;
  vendorId: string;
  /** 관련 고객사/빌드 참조 (선택) — Engineering 자료를 PO에 잇는 다리. */
  companyId: string | null;
  buildId: string | null;
  /** 커머셜 스파인 — 이 발주가 속한 딜 (2026-08-26b SQL). */
  dealId: string | null;
  /** Assigned at issue time via the next_po_no RPC. Null while draft. */
  poNo: string | null;
  status: DocStatus;
  issueDate: string | null;
  currency: string;
  paymentTerms: string;
  /** Incoterms 2020 shipping term. */
  shippingTerms: string;
  shipTo: string;
  projectRef: string;
  lineItems: PoLineItem[];
  subtotal: number | null;
  shipping: number | null;
  tax: number | null;
  total: number | null;
  /** NOTES / terms body. */
  terms: string;
  /** 추가 표준약관 조항 — 빈 줄 구분 블록(첫 줄 제목), 인쇄 시 11.부터 번호. */
  extraTerms: string;
  memo: string;
  /** 승인 워크플로 (2026-08-11e SQL): none → requested → approved/rejected. */
  approvalStatus: "none" | "requested" | "approved" | "rejected";
  approvalRequestedBy: string;
  approvalDecidedBy: string;
  approvalDecidedAt: string | null;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

/** An edit awaiting approval (spec cell, key company field, issued document). */
/** "spec_batch" = every cell edited in one Save, filed as a single request. */
export type ChangeTargetKind = "spec_cell" | "spec_batch" | "company_field" | "document";
export type ChangeStatus = "pending" | "approved" | "rejected";

export interface ChangeRequest {
  id: string;
  companyId: string;
  targetKind: ChangeTargetKind;
  /** company_specs.id or company_documents.id (null for company fields). */
  targetId: string | null;
  /** {column|field, old, new, label} for cells/fields; a patch for documents. */
  payload: Record<string, unknown>;
  reason: string;
  status: ChangeStatus;
  requestedByKey: string;
  requestedAt: string;
  decidedByKey: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

/** Which stage tab an activity/comment belongs to. */
export type FeedContext = "targeting" | "first_contact" | "nda" | "spec" | "quotation" | "purchase_order" | "invoice" | "engineering" | "procurement" | "inspection" | "experiments";

/** Engineering-track build (one 3D-printed model under verification). */
export type BuildStatus = "design" | "verification" | "passed" | "failed";

export interface BuildChecklistItem {
  label: string;
  done: boolean;
  note: string;
}

export interface Build {
  id: string;
  companyId: string;
  dealId?: string | null;
  sourceSpecVersionId?: string | null;
  /** e.g. "D-S-UC5.5-t0.4-thick" */
  modelCode: string;
  status: BuildStatus;
  ownerKey: string;
  /** External/Internal/Export spec tables — { section: { param: value } } */
  modelSpec: Record<string, Record<string, string>>;
  checklist: BuildChecklistItem[];
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildFile {
  id: string;
  buildId: string;
  /** Picture slot ("Top", "Side", …) — empty for plain attachments. */
  view: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  uploadedBy: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  companyId: string;
  actorId: string;
  type: ActivityType;
  summary: string;
  context: FeedContext;
  /** 기록 대상 스코프 — spec 버전 id·문서 id 등. null/없음 = 탭 단위 기록. */
  targetId?: string | null;
  createdAt: string;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Comment {
  id: string;
  companyId: string;
  authorId: string;
  body: string;
  parentId: string | null;
  context: FeedContext;
  /** 기록 대상 스코프 — spec 버전 id·문서 id 등. null/없음 = 탭 단위 기록. */
  targetId?: string | null;
  reactions: Reaction[];
  createdAt: string;
}

/** 장비 대장 — 실험장비·공구·IT·기타. */
export type EquipmentCategory = "lab" | "tool" | "it" | "etc";
export type EquipmentStatus = "available" | "in_use" | "maintenance" | "retired";

export interface Equipment {
  id: string;
  assetNo: string;
  name: string;
  category: EquipmentCategory;
  manufacturer: string;
  model: string;
  serialNo: string;
  purchaseDate: string | null;
  purchaseCost: number | null;
  location: string;
  status: EquipmentStatus;
  /** 관리 담당자 멤버 키. */
  custodianKey: string;
  /** 현재 지급/사용자 멤버 키 (E2). */
  holderKey: string;
  /** board 버킷 equipment/ 경로. */
  photoPath: string;
  driveFolder: string;
  /** 점검 주기(개월) — null이면 점검 관리 안 함. */
  inspectIntervalMonths: number | null;
  /** 다음 점검 예정일 (yyyy-mm-dd). */
  nextInspectOn: string | null;
  memo: string;
  /** P0-A (2026-09-22c SQL): 수명주기 — ended면 신규 업무 불가, 기록·QR 조회는 유지. */
  lifecycle: "active" | "ended";
  endedAt: string | null;
  endedReason: string;
  /** 사용 형태 — 미확인은 null (기본값으로 추정하지 않는다). */
  usageType: "shared_fixed" | "assignable" | null;
  acquisitionType: "purchase" | "rental" | "loan" | "selfmade" | null;
  /** 동시 수정 감지 — 저장 시 서버가 비교 후 증가. */
  version: number;
  /** P0-B (2026-09-22d SQL): 가동 상태 축 — 보유 관계와 분리 (§7.1). */
  opStatus: "normal" | "maintenance" | "stopped";
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

export type EquipmentLogKind =
  | "created" | "status" | "note" | "checkout" | "checkin" | "repair" | "inspect"
  | "updated" | "ended" | "import" | "workflow";

/* ── Equipment P0-B (2026-09-22d SQL): 워크플로·점검/교정 ── */

export type EquipmentWorkflowKind = "issue" | "move" | "loan_out" | "repair";
export type EquipmentWorkflowState =
  | "requested" | "approved" | "active" | "return_requested" | "resolved"
  | "done" | "rejected" | "cancelled";

export interface EquipmentWorkflow {
  id: string;
  equipmentId: string;
  kind: EquipmentWorkflowKind;
  state: EquipmentWorkflowState;
  /** JWT 이메일 (서버 기록 — 클라이언트 값 불신). */
  requestedBy: string;
  approvedBy: string;
  /** issue: 인수자 멤버 키 / loan_out: 반출 대상자. */
  targetKey: string;
  /** move: 새 위치 / loan_out: 목적지. */
  toLocation: string;
  reason: string;
  /** loan_out 반납 예정일. */
  dueOn: string | null;
  symptom: string;
  actionTaken: string;
  cost: number | null;
  requestedAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface EquipmentMaintenancePlan {
  id: string;
  equipmentId: string;
  kind: "inspection" | "calibration";
  /** 교정 필요 여부 — null=미확인 (false로 추정하지 않는다). */
  required: boolean | null;
  intervalMonths: number | null;
  nextDueOn: string | null;
  assigneeKey: string;
  active: boolean;
}

export interface EquipmentMaintenanceRecord {
  id: string;
  planId: string | null;
  equipmentId: string;
  kind: "inspection" | "calibration";
  performedOn: string;
  performer: string;
  result: "pass" | "fail" | "adjusted";
  certNo: string;
  /** 교정 유효기한 — 당일까지 유효 (§7.4). */
  validUntil: string | null;
  filePath: string;
  note: string;
  nextDueOn: string | null;
  workflowId: string | null;
  actorKey: string;
  createdAt: string;
}

export interface EquipmentLog {
  id: string;
  equipmentId: string;
  kind: EquipmentLogKind;
  body: string;
  cost: number | null;
  actorKey: string;
  /** 필드별 {from,to} 구조화 변경 내역 (2026-09-22c SQL). */
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

/** 사내 게시판(Board) 게시글 — 본문은 MemoEditor HTML. */
export interface BoardPost {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  authorKey: string;
  createdAt: string;
  updatedAt: string;
}

/** Board 게시글 첨부 (private 'board' bucket). */
export interface BoardFile {
  id: string;
  postId: string;
  fileName: string;
  fileSize: number | null;
  storagePath: string;
}

/** Board 댓글 (parent_id로 1단계 답글). */
export interface BoardComment {
  id: string;
  postId: string;
  parentId: string | null;
  authorKey: string;
  body: string;
  createdAt: string;
}

/** A Notion sprint task snapshotted into Supabase by an external synchronisation job. */
export interface SprintTask {
  id: string;
  team: string;
  name: string;
  status: string;
  /** Normalized priority, e.g. "🔴 Urgent" / "High" / "Medium" / "Low". */
  priority: string;
  /** ISO date or null. */
  deadline: string | null;
  people: { name: string; email: string }[];
  snapshotAt: string;
}

/* ── Sprint/PM module (pm_projects / pm_sprints / pm_tasks) ──────────────────
   자체 스프린트 보드. 노션 스냅샷(SprintTask)과 무관한 쓰기 가능 모듈. */

export type PmProjectStatus = "active" | "paused" | "done" | "archived";
export type PmSprintStatus = "planned" | "active" | "closed";
export type PmTaskStatus = "todo" | "in_progress" | "review" | "hold" | "done";
export type PmPriority = "urgent" | "high" | "medium" | "low";

export interface PmChecklistItem {
  text: string;
  done: boolean;
}

/** 태스크 메모 첨부 — 업로드 파일/이미지(storagePath, docs 버킷 sprint/ 경로)
   또는 외부 링크(url). */
export interface PmAttachment {
  kind: "image" | "file" | "link";
  name: string;
  url: string;
  storagePath: string;
}

/** 장기 과제(에픽). 진행률 컬럼은 없고 하위 태스크에서 rollup으로 계산. */
/** Sprint 작업공간의 팀 파티션 (프로젝트/태스크가 소속되는 스프린트 보드). */
export type PmTeam = "engineering" | "manufacturing" | "business";

export interface PmProject {
  id: string;
  name: string;
  description: string;
  status: PmProjectStatus;
  /** 프로젝트 우선순위 — Diagram 폴더 색을 좌우한다 (2026-08-12 SQL). */
  priority: PmPriority;
  team: PmTeam;
  /** Project DRI member key (member-id, …). */
  ownerKey: string;
  /** 부담당자 — 2명 이상 지정 가능 (2026-08-19 SQL). */
  coOwnerKeys: string[];
  /** 'private'면 owner·co-owner·memberKeys·admin만 프로젝트(와 그 태스크)를 본다. */
  visibility: "team" | "private";
  /** private 프로젝트를 볼 수 있는 추가 멤버. */
  memberKeys: string[];
  /** yyyy-mm-dd or null — 스프린트와 무관한 장기 목표일. */
  targetDate: string | null;
  /** Google Drive folder URL/ID — 대시보드에서 내용 탐색(browse). */
  driveFolder: string;
  sort: number;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

/** 2주 타임박스. */
export interface PmSprint {
  id: string;
  name: string;
  goal: string;
  /** yyyy-mm-dd */
  startsOn: string;
  /** yyyy-mm-dd */
  endsOn: string;
  status: PmSprintStatus;
  closedAt: string | null;
  createdAt: string;
}

/** 실행 단위 — 담당자 1명(DRI). sprintId null = 백로그. */
export interface PmTask {
  id: string;
  title: string;
  description: string;
  team: PmTeam;
  projectId: string | null;
  sprintId: string | null;
  assigneeKey: string;
  status: PmTaskStatus;
  priority: PmPriority;
  /** yyyy-mm-dd or null. */
  dueDate: string | null;
  /** yyyy-mm-dd — auto-set to the creation day; editable. Drives the Roadmap. */
  startedOn: string | null;
  /** 중간 보고 시점 (스프린트 법칙 ②, 2026-09-22b SQL). */
  checkpointDate: string | null;
  /** 완성의 기준 — 어느 수준이면 끝인가 (법칙 ③). */
  doneCriteria: string;
  checklist: PmChecklistItem[];
  /** Google Drive folder URL/ID — 대시보드에서 내용 탐색. */
  driveFolder: string;
  /** 기타 내용 자유 메모 (설명과 별개). */
  memo: string;
  attachments: PmAttachment[];
  sort: number;
  doneAt: string | null;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

/** 프로젝트/태스크 daily log — 날짜별 한 줄 진행 기록. */
export interface PmDailyLog {
  id: string;
  /** pm_projects.id 또는 pm_tasks.id */
  targetId: string;
  /** yyyy-mm-dd */
  logDate: string;
  body: string;
  authorKey: string;
  createdAt: string;
}

/** Sprint 태스크 댓글 (flat thread). */
export interface PmComment {
  id: string;
  taskId: string;
  authorKey: string;
  body: string;
  createdAt: string;
}

/** 인앱 알림 (상단 벨) — 현재는 CRM/Sprint 코멘트 @멘션에서 생성. */
export interface AppNotification {
  id: string;
  /** Recipient member key (member-id, …). */
  userKey: string;
  actorKey: string;
  kind: string;
  /** 맥락 한 줄, 예: [Sprint] 작업 "장비 발주". */
  title: string;
  /** 코멘트 발췌. */
  body: string;
  /** 클릭 시 이동 경로. */
  link: string;
  read: boolean;
  createdAt: string;
}

/** GPS fix captured when a time-clock button is pressed. */
export interface PunchLocation {
  lat: number;
  lng: number;
  accuracy: number;
  /** Reverse-geocoded place label, when available. */
  address?: string;
  /** Office vs remote, derived from the office geofence at submit time.
     Absent on older rows or when no office is configured. */
  mode?: "office" | "remote";
}

export type PunchField = "clock_in" | "lunch_start" | "lunch_end" | "clock_out";

/** One member-day of the employee timesheet (mirrors the xlsx: one row/day). */
export interface TimesheetDay {
  id: string;
  userKey: string;
  /** yyyy-mm-dd */
  workDate: string;
  clockIn: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  clockOut: string | null;
  clockInLoc: PunchLocation | null;
  lunchStartLoc: PunchLocation | null;
  lunchEndLoc: PunchLocation | null;
  clockOutLoc: PunchLocation | null;
  workCode: string;
  notes: string;  /** 다회 펀치 세션 (2026-08-21c) — 원본. clock_in/out은 첫/마지막 미러. */
  sessions: { in: string; out: string | null; inLoc: PunchLocation | null; outLoc: PunchLocation | null }[];
  /** 반차 (2026-09-18 SQL) — KR 점심 차감이 1h 대신 30분. */
  halfDay: boolean;
}

/** Document hub item — a stored file, an external (Drive) link, or a wiki doc. */
export type DocKind = "file" | "link" | "wiki";

export interface DocItem {
  id: string;
  kind: DocKind;
  category: string;
  /** 카테고리 안 1단계 폴더 이름 ("" = 루트). 2026-09-07 SQL. */
  folder: string;
  title: string;
  description: string;
  tags: string[];
  /** link kind — external URL (usually Google Drive). */
  url: string;
  /** file kind — path inside the private "docs" storage bucket. */
  storagePath: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  /** wiki kind — markdown body. */
  content: string;
  /** Display name of who added it. */
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

/* ── 기안·전자결재 (2026-09-14 SQL) ─────────────────────────────────────── */

export type ApprovalForm = "exp" | "pur" | "lev" | "lvc" | "gen" | "emp" | "car" | "crt";
export type ApprovalDocStatus = "draft" | "in_progress" | "approved" | "rejected";
export type ApprovalStepStatus = "waiting" | "current" | "approved" | "rejected" | "info_requested" | "skipped";

export interface ApprovalAttachment {
  path: string;
  name: string;
  size: number;
}

/** 결재 단계 — 지금은 단계당 승인자 1명 순차지만, 합의·병렬 확장을 위해
   approvers 배열 + rule(any/all)로 저장한다 (벤치마킹 확정 스키마). */
export interface ApprovalStep {
  id: string;
  docId: string;
  seq: number;
  approvers: string[];
  rule: "all" | "any";
  status: ApprovalStepStatus;
  decidedBy: string;
  comment: string;
  decidedAt: string | null;
}

export interface ApprovalDoc {
  id: string;
  /** 최종 승인 시 채번 (예: EXP-2026-001). 그 전엔 null. */
  docNo: string | null;
  form: ApprovalForm;
  title: string;
  body: string;
  amount: number | null;
  /** 양식별 구조화 필드 값 (스키마는 approvalForms.ts FORM_FIELDS). 옛 문서는 {}. */
  fields: Record<string, unknown>;
  attachments: ApprovalAttachment[];
  status: ApprovalDocStatus;
  ownerKey: string;
  currentStep: number;
  ccKeys: string[];
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
