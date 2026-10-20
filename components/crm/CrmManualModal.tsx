"use client";

import { Modal } from "@/components/ds/feedback/Modal";



const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Pipeline",
    body: (
      <>
        One board from research to paid invoice. The first three columns hold <b>companies</b>:
        Targeting (a research note was logged), First contact (touches or captured emails exist)
        and NDA (in review / signed). Once a company gets its first deal in the Spec sheet step,
        it leaves those columns and continues as a <b>deal card</b> through Spec sheet → Quotation →
        Customer PO → Invoice → Done. Drag deal cards to move stages; company cards just open the
        company. The amount on a column header is the total value of its deals (invoice first,
        otherwise the latest quote). Orange-badged deals are in execution and can&rsquo;t be dragged.
      </>
    ),
  },
  {
    title: "Companies",
    body: (
      <>
        All customer accounts in one table — search, sort, bulk-edit owners or priority with the checkboxes.
        Click a row to open the company screen, which is where all real work happens.
      </>
    ),
  },
  {
    title: "Company screen · the 7-step process",
    body: (
      <>
        The stepper at the top is the sales process: <b>⓪ Targeting → ① First contact → ② NDA →
        ③ Spec sheet → ④ Quotation → ⑤ Purchase Order → ⑥ Invoice</b>. Blue shows how far this
        company actually is; click any step to open its tab.
        <br /><br />
        <b>⓪ Targeting</b> — research before reaching out: why this company fits, how our product fits,
        how to get in. Logging a note here also puts the company on the Pipeline board.
        <br />
        <b>① First contact</b> — log every early touch (email, call, meeting) before any deal exists.
        Pick the person, write what happened, optionally set a next action with a due date.
        Saved or manually registered email records appear in the same feed; mailbox collection is not connected.
        <br />
        <b>② NDA</b> — track NDA status and signed date. Attach signed files and manage signature requests in the company NDA step.
        <br />
        <b>③ Spec sheet</b> — <b>deals are created here</b> (&ldquo;New deal&rdquo;). A deal holds parts,
        spec versions, and every document that follows.
        <br />
        <b>④–⑥</b> — create and issue Quotations, record the customer PO, then invoice.
        Issued invoices can be saved as local finance handoffs. Delivery to a separate Finance service requires a connection.
      </>
    ),
  },
  {
    title: "Overview tab",
    body: (
      <>
        The company at a glance: open deals, pipeline value, last touch, NDA status.
        Manage <b>Contacts</b> here — hover a card to edit or delete, click it to filter the activity
        feed to just that person; click a deal card to filter to that deal. The Activity feed shows
        conversations only (emails, calls, meetings, notes — system changes stay in the right-side
        activity log). Email records marked <b>PENDING</b>: Accept keeps one as an official
        record, Exclude hides it. The right column has next actions and the company&rsquo;s deals
        with their value (invoice first, quote as fallback).
      </>
    ),
  },
  {
    title: "Follow-ups tab",
    body: (
      <>
        Your to-do list for customers. A follow-up is one concrete next step — e.g.
        &ldquo;Confirm project requirements by Thursday&rdquo;.
        <br /><br />
        <b>How they get here:</b> when you log a sales activity and fill in &ldquo;Next action&rdquo;,
        or when you add one directly in a company&rsquo;s Overview.
        <br />
        <b>How to use it:</b> check this tab (or the company Overview) at the start of the day,
        do the item, press <b>Done</b>. Overdue items are labelled. That&rsquo;s it — it exists so
        no customer conversation silently goes cold.
      </>
    ),
  },
  {
    title: "Change requests",
    body: (
      <>
        Change requests that need a manager&rsquo;s sign-off — spec edits, stage or value changes.
        Requests and decisions remain in the CRM activity history. Owner-authorised edits apply locally; a separate approval workspace is not included.
      </>
    ),
  },
];

export function CrmManualModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="How the CRM works" size="lg">
      <div className="sx-scroll" style={{ maxHeight: "62vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 4 }}>
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          One place to run a customer from first hello to paid invoice. Everything hangs off a company;
          from Spec sheet onward, work is organized per deal.
        </p>
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h3 style={{ margin: "0 0 4px", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-strong)" }}>{s.title}</h3>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-default)", lineHeight: 1.65 }}>{s.body}</div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
