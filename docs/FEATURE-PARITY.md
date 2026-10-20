# CRM feature inventory

This repository contains the original `CrmWorkspace` and the dependencies required by its company and deal workflows. New databases start empty. The optional README screenshot helper inserts fictional records only into the loopback development preview.

| Original CRM workflow | Retained implementation | Persistence / boundary |
| --- | --- | --- |
| Company board/table, filters, favorites, contact/detail rail | CrmWorkspace, CompanyTable, DealsBoard, CompanyFormModal, DetailPanel | Owned companies; new untouched leads appear in Targeting |
| Contacts, targeting, overview, first contact, timeline and sales activity | CompanyContactsSection, CompanyOverview, TargetingPanel, FirstContactPanel, CompanyTimeline, SalesActivityModal | Owned contacts/logs/emails, notes and activities |
| Independent deals and sales/execution stages | DealWorkspace, DealDrawer, deal data functions and milestone fields | Durable deal numbers, stages, quotation/pilot dates and evidence |
| Company NDA step and signature history | NdaPanel → NdaSendModal / NdaRequestsList → NDA APIs → `/sign` | Operator-provided terms required; snapshots/signatures preserved; recipient page retained, no standalone global NDA screen |
| Requirements, spec versions/builds, uploads and customer requests | RequirementTable, SpecBuildsPanel, SpecRequestsPanel, CustomerSpecForm | Owner-configured field/column snapshots, version/review/apply and private-link response |
| Company quotations, customer POs and invoices | DocumentPanel, catalog, document/print/export modules | Owned lines/totals/revisions; scoped atomic numbering; local finance-handoff record |
| Within-company engineering, procurement, inspection and experiments | EngineeringPanel, ProcurementPanel, InspectionPanel, ExperimentsPanel, deal PartBuilderModal | Local builds, parts, statuses, files and linked vendor/PO summaries remain; separate service actions are disabled with setup explanations |
| Activity, comments, mentions, reactions and change requests | ActivityFeed, GlobalActivityPanel, ReviewModal, request/decision contracts | Owner-scoped records and atomic decision/apply; no separate Approvals workspace |
| Follow-ups and assisted email workflows | Company/deal follow-ups, EmailAiPanel, EmailComposerModal, data functions | Durable create/complete/snooze; manual sends and AI need operator credentials |
| Company specification schema, CRM organisation, terms and assignment directory | Header **CRM settings** dialog | Owned settings and directory; no platform settings sidebar |

## Explicit CRM-only boundary

Removed global Engineering, Procurement, Approvals, Document library and NDA navigation/screens; the Studio proxy/inbox/viewer, global PartsTracker, vendor-site administration, wiki/previews and exclusive dependencies are removed. No replacement platform screen is mounted. Company-level documents, NDA, specs, PO/invoice steps and execution tabs remain.

The original `NdaPanel` imports the request modal/history directly. Its signed-link recipient page is therefore a required CRM dependency and remains. This does not recreate a standalone NDA service. Company NDA attachments still use authenticated R2; the removed Library shortcut is no longer shown.

Outbound procurement/part-tracker actions explicitly state that the separate service is not connected. CRM handoffs preserve local records/status. Finance delivery remains local and does not claim cross-service receipt. See [CRM-BOUNDARY.md](CRM-BOUNDARY.md) for the dependency inventory and [IMPLEMENTATION-REPORT.md](IMPLEMENTATION-REPORT.md) for checks and external gaps.
