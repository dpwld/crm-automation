# CRM dependency boundary

The pre-removal import graph contained 223 source dependencies reachable from the workspace, app routes and domain tests. After removing global entry points, the following files became exclusive to those additions and were deleted (along with JSX declaration companions). Shared CRM files were retained. No original source repository was modified.

- `components/Engineering.tsx`
- `components/NdaTools.tsx`
- `components/approvals/ChangeRequestsTab.tsx`
- `components/common/MemoView.tsx`
- `components/crm/ApprovalsView.tsx`
- `components/docs/DocsHub.tsx`
- `components/docs/Markdown.tsx`
- `components/ds/data/SpecList.jsx`
- `components/ds/feedback/Tooltip.jsx`
- `components/ds/forms/Radio.jsx`
- `components/ds/forms/Switch.jsx`
- `components/ds/index.ts`
- `components/ds/navigation/Breadcrumbs.jsx`
- `components/ds/navigation/Pagination.jsx`
- `components/ds/navigation/SideNav.jsx`
- `components/engineering/PartsTracker.tsx`
- `components/engineering/StudioRequestViewer.jsx`
- `components/engineering/StudioRequests.tsx`
- `components/engineering/studio-requests.css`
- `components/procurement/ProcurementWorkspace.tsx`
- `components/procurement/VendorSitesPanel.tsx`
- `lib/crm/decideChangeRequest.ts`
- `lib/data/vendor-sites.ts`
- `lib/docs/pptxThumb.ts`
- `lib/engineering/studio-gateway.ts`
- `lib/engineering/studio-geometry.mjs`
- `lib/engineering/studio-requests.ts`
- `lib/parts-dimensions.ts`

Additional introduced orphans removed: unused `FollowUpsView` (company follow-up controls remain), global scorecard calculations/targets/manufacturing forms and translations, document-library folder/wiki CRUD, vendor-site generic API exposure and its reference map. Deal milestone forms and their existing API contract remain; this is CRM opportunity data, not a scorecard workspace.

Removed app routes: `/engineering`, `/procurement`, `/docs`, `/nda`; removed APIs: `/api/engineering/studio-requests[/id]` and `/api/procurement/intake`. The original company document intake and PO extract/compare APIs remain. Removed direct packages: Three.js, PDF.js, docx-preview and JSZip, with exclusive vendored archives. Shared SheetJS, jsPDF and html2canvas remain for CRM workbook/PDF/export workflows.

## Retained shared contracts

- `components/engineering/PartBuilderModal` is imported by CRM DealDrawer for deal-linked parts.
- Company Engineering/Procurement/Inspection/Experiments panels retain local execution records and files. Separate part-tracker/procurement destinations are explicitly unavailable.
- `lib/data/procurement` supports linked vendor and PO data used within company/deal panels; no standalone procurement screen is mounted.
- `lib/data/docs` supports company NDA attachment selection/upload and document line-item images; no global library/wiki screen is mounted.
- Company NdaPanel directly imports the send modal and request list, which require NDA request/sign/countersign/PDF APIs and `/sign`. These remain as CRM dependencies. Global `/nda` does not exist.
- CRM change-request/review API contracts remain; standalone approvals UI and its exclusive decision adapter are removed.
- Header CRM settings supplies legal/print identity, terms, owner directory and integration status used by these workflows.

The storage migration and Site identity are unchanged. Existing stored data is not bulk-deleted by this scope cleanup. New databases remain empty. README examples are opt-in loopback-only records with bounded cleanup.
