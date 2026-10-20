# CRM implementation report

## Preserved application structure

The actual original `CrmWorkspace` and its component/domain dependency closure are ported. This includes company pipeline/table, company/contact details and targeting, independent deals and seven sales stages, execution statuses, first contact, NDA, requirement/spec/build versions, quotations/customer POs/invoices, catalogs, activity/timeline/comments/reactions, sales activity and follow-ups, engineering handoff, procurement, inspection and experiments.

The shell is CRM-only: no global Engineering, Procurement, Approvals, DocsHub or NDA screen. CRM settings is a header dialog. The dependency inventory and exclusive removals are recorded in CRM-BOUNDARY.md. Company execution panels, deal parts, linked vendors/POs, documents and internal NDA requests remain. Separate service actions are visibly disabled. The recipient `/sign` page remains because the original company NdaPanel directly requires the request/sign/countersign flow.

The retained technical functions include spec cell/version conversion, document/PO totals, execution-stage grouping, scoped numbering, parser/import validation and spec answer comparison. Company-specific people, customer mappings, addresses, signer identity, document terms, branding and fixed operational URLs are removed or entered in CRM settings. The initial database is empty.

## Actual server behaviour

- Authenticated routes derive the owner from the starter ChatGPT identity helper. D1 row keys structurally include owner/entity/id. Queries and mutations enforce explicit entity/action/column allowlists; protected request/link data is excluded from the generic API. Foreign references are checked inside the authenticated owner's records.
- Explicit-null updates use SQL `json_set`; unrelated field updates do not replace entire record snapshots. Batches validate before mutation. Financial line amounts/totals are recomputed on the server. Database unique indexes enforce company references/party codes, deal numbers and repeat-handoff identity.
- Durable counters allocate concurrent document/part numbers without reusing counter values. Atomic change-request endpoints apply the decision, target edits and activity together. Decision guards prevent repeat application.
- Private R2 adapters implement upload, authenticated streaming and delete for documents/builds/inspection photos. Customer requirement attachments use bounded uploads, extension/magic-byte checks and token/owner access checks.
- Customer requirement links use random tokens with only SHA-256 hashes stored separately. Public saves use revision checks; submission preserves unknown values. Review creates a new draft spec version and preserves the approved/final version. No external email is claimed sent before Gmail accepts it.
- NDA requests retain a document snapshot/hash. Public signature submission validates consent, name/title and a PNG signature; countersigning creates the archived PDF/certificate and an owned library record. Final-email failure is returned separately from successful archiving. Reissue/void revoke prior tokens. The owner's configured identity and complete NDA terms are used unchanged in preview and snapshot. No legal clauses are supplied; missing terms prevent sending.
- Original AI extraction/draft/compare schemas call the real OpenAI SDK behind authenticated routes. Email briefing/routing uses saved owned email text. Missing key/model produces 503. Gmail delivery has a real MIME/attachment/HTML/plaintext/signature/thread-reference adapter with explicit provider failures and durable integration-run records.
- Finance handoff saves an actual owned invoice payload in this workspace; the UI explicitly says it is a local handoff. It does not fabricate delivery to a separate Finance service.

## Verification

- `npm test`: Domain assertions pass. Covers configurable schema validation, immutable field snapshots, numeric values, escaped custom rendering, rounding/billed-line totals, execution-stage grouping, valid/unknown/nonnumeric answers and actual SheetJS workbook parsing, formula rejection, wrong-customer rejection and input preservation.
- `npm run test:server`: HTTP assertions pass against the real local built Worker, D1 and R2. Covers unsigned rejection, empty owned database, validated CRUD, cross-owner selection/mutation/foreign-reference denial, unsupported table/field/RPC rejection, invalid-input preservation, explicit nulls, settings/spec/contact/follow-up persistence, authoritative document totals, atomic invalid batches, concurrent unique numbering, R2 byte persistence/access rejection, missing AI/email credentials, invalid private links, origin rejection and atomic approval/apply/duplicate-decision rejection. Test fixtures are only created by tests under disposable owner IDs in `.wrangler/state-test`.
- Worker stop/restart test: an owned D1 setting persisted after the Worker was stopped and restarted; the disposable marker was then deleted.
- Generated migration `0000_thick_masked_marvel.sql` applies to a real empty local D1. A repeated apply reports no migrations to apply. No request handler creates schema.
- `npm run typecheck`: passes. `npm run build`: passes all five Vinext build stages. Vinext reports a large CRM document/export chunk and its dynamic-page classification notice; no performance claim is made.
- Parent browser QA confirmed company create/reload persistence. A pre-existing source defect omitted untouched new leads from every board column; the default now places them in Targeting. Parent confirmed Targeting count/card after reload and removed its disposable fixture. Parent also verified the mobile toolbar remains accessible. KPI cards wrap while board columns retain horizontal scrolling; the earlier empty screenshot is superseded by a parent-owned CRM-only capture.
- The prior identity/URL audit did not cover specification defaults; the later specification audit found and removed fixed company-specific schema and workbook assets from the working tree. Historical Git objects require a separate repository-history decision. Third-party parsers/renderers and local font/starter licenses are retained. No blanket open-source license was added.

## External setup and remaining limitations

1. Hosted audience stays **owner-private**. External customers cannot use signing/requirements links until the owner intentionally changes audience. Local endpoints are implemented, but hosted external-distribution access is deliberately not enabled.
2. OpenAI needs user-owned `OPENAI_API_KEY` and explicit `OPENAI_MODEL`. Gmail needs `GMAIL_ACCESS_TOKEN` with `gmail.send` and `GMAIL_SENDER_EMAIL`; customer links need `PUBLIC_APP_URL`. Organisation/legal/signing details must be saved. No paid AI calls, emails or real company records were used during verification. Optional README examples use fictional local-only records. Provider output/delivery and complete emailed signing cycles remain unverified until the owner's credentials are connected.
3. Gmail OAuth authorisation/refresh, mailbox collection and mailbox attachment retrieval are not implemented. The real send adapter accepts a server-held access token and reports expiry. Briefs explicitly mark themselves partial and use persisted text. No scheduler or background collector is silently running.
4. Finance delivery to a separate service needs an authenticated cross-service contract; current handoff persistence is local. Live presence and shared multi-user tenancy are not implemented; the directory provides assignment and mentions within one account's records.
5. The NDA PDF retains English/Latin character limitations. Legal identities are validated instead of silently corrupting glyphs. Automated signing/requirement endpoint happy paths were not exercised through external email during this build.
6. Compatibility queries load an owner's entity collection before filtering. This is actual D1 persistence, with structural ownership/indexes, but large-tenant performance is unverified. File bytes are in R2; metadata/workflow mutations are D1 batches, not a distributed R2/D1 transaction.

The owner account can countersign its own NDA after legal identity setup; no removed company-admin email allowlist is required.

The Site ID is unchanged. Parent owns browser screenshots, native hosting configuration, remote deployment, credentials and private GitHub publication. No child-agent push, deployment, audience change or original-source edit occurred.

## CRM-only correction and README examples

Removed global navigation/screens/routes and exclusive Studio, preview, wiki, procurement administration and approvals dependencies; removed vendor-site API exposure. Retained original within-company tabs, deal milestone fields, part builder, document/PO/invoice, change-request, NDA and customer requirement contracts. No removed-module navigation remains. External handoffs retain local state or show an unavailable integration.

`npm run readme:seed` created 8 fictional companies, 5 deals, 8 contacts, activities, a requirement, a versioned initial-request spec and linked physical part, draft documents and a follow-up through the actual native loopback API on port 4323. These examples are not production seeds. The helper enforces loopback HTTP/port, confirms local sign-in, uses namespaced exact IDs, preflights existing IDs and inserts only. `readme:cleanup` targets only those IDs and refuses non-fixture relationships before cascade deletion. No organisation settings, external sends or AI calls are inserted. Parent owns the corrected screenshot and publication.

Final correction verification:

- `npm test`: Schema/domain assertions plus CRM boundary and fixture safety checks pass. Boundary checks preserve required company/NDA files, reject removed entry points/packages and reject non-loopback fixture targets.
- `npm run typecheck`: passes.
- `npm run build`: all five stages pass; only the known large document/export chunk and route-classification notices remain.
- `npm run test:server`: HTTP assertions pass on a freshly restarted built Worker using isolated `.wrangler/state-test`; added checks reject vendor-site generic access and return 404 for removed global pages/APIs.
- `readme:cleanup` followed by `readme:seed` succeeded through native loopback API; duplicate seeding and a remote URL were rejected without mutation. Fictional examples remain locally for parent screenshot capture.
- Parent browser confirmed the CRM-only shell. Theme tokens now use sky-blue surfaces and controls with distinct green success, red error and amber warning states. Company document stage nodes cannot shrink into overlapping labels; their original rail scrolls internally.


## Configurable specification update

First sign-in requires the operator to define a schema name, one or two named value columns, and 1–80 unique fields with sections, optional symbols/units, numeric/text types and single/separate values. This schema is validated by the server and stored under the authenticated owner in D1. Saved versions and customer links retain column/field snapshots. Updated settings affect future sheets. Customer request validation, comparison, workbook import/export, print/PDF, AI extraction, build checklists and experiment measurements use the configured definitions. Internal part registration accepts an operator-authored description instead of fixed private geometry codes.

Removed the bundled confidential workbook, fixed field JSON, industry-derived calculations, default parameter values, suggestions and fixed-cell export implementation. Replaced README examples with neutral delivery/quality fields. The previous screenshot was removed pending a new capture from those examples. No database records or Git history were rewritten. All system runtime literals are English; user data is preserved as entered. Some pre-existing developer comments remain Korean.

Verification for this update:

- `npm test` passes: schema shape/duplicate/column validation, required first-run configuration, immutable snapshots, numeric validation, actual React sheet rendering, escaped custom print output, workbook import/formula/customer checks, existing totals/stages/permissions and CRM boundary checks.
- `npm run typecheck` and the five-stage production build pass. Existing large-chunk and route-classification notices remain.
- `CRM_TEST_URL=http://127.0.0.1:4317 npm run test:server` passes against the built Worker with isolated `.wrangler/state-schema-test`. Added schema setup, invalid-update preservation, cross-owner read/update denial, numeric spec rejection and saved-version snapshot persistence checks.
- A separate configured-schema fixture survived a complete Worker stop/restart and was then removed. The test suite cleans its fixtures; no business records were altered.
- TypeScript AST audit found zero Hangul string/template/JSX runtime literals in `app`, `components` and `lib`. Korean developer comments remain. Email drafts may follow user-authored instructions and customer data is not translated.
- Current source scan found no retained fixed private engineering parameter labels or original workbook. Git history was not rewritten and still requires the repository owner's separate treatment. The prior screenshot is removed pending parent capture of the neutral fixture.

External providers were not invoked. No new dependencies were added by this change. Schema limits are explicit: one or two value columns, 1–80 fields, text or numeric cells, no derived formula engine. Existing private business data is not migrated or deleted automatically.

NDA privacy follow-up: removed inherited legal template wording. CRM settings now saves owner-scoped `nda_terms`; the preview, signing HTML and hashed PDF text use that content with factual party details and signature fields. Tests cover missing/invalid terms, exact preservation, escaped rendering and owner isolation. Original industry assumptions were also removed from extraction/email prompts and examples.
