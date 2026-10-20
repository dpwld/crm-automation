import {readJson} from '@/lib/http';
"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import type {ScoreDeal} from "@/lib/kpi/scorecard";
import { useScoreText, errorText } from "./ScorecardText";
import { seoulDate } from "@/lib/kpi/common";
export type SaveRecord = (body: Record<string, unknown>) => Promise<void>;
export async function saveScoreRecord(body: Record<string, unknown>) {
  const r = await fetch("/api/kpi/scorecard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson(r);
  if (!r.ok) throw new Error(data.error ?? "save_failed");
}
function SaveForm({
  save,
  children,
  onSubmit,
}: {
  save: SaveRecord;
  children: ReactNode;
  onSubmit: () => Record<string, unknown>;
}) {
  const { tx, language } = useScoreText();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await save(onSubmit());
      setFailed(false);
      setMessage(tx("Saved.", "Saved."));
    } catch (e) {
      setFailed(true);
      setMessage(
        errorText(e instanceof Error ? e.message : "", language === "en"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="score-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        {children}
        <div className="score-actions">
          <button type="submit">
            {busy ? tx("Saving…", "Saving…") : tx("Save", "Save")}
          </button>
          <span
            role={failed ? "alert" : "status"}
            className={failed ? "score-error" : ""}
          >
            {message}
          </span>
        </div>
      </fieldset>
    </form>
  );
}
export function DealMilestonesForm({
  deal,
  save,
  focus,
}: {
  deal: ScoreDeal;
  save: SaveRecord;
  focus?: "quotation" | "pilot";
}) {
  const { tx } = useScoreText();
  const [draft, setDraft] = useState({ ...deal });
  const fields: [
    keyof Pick<
      ScoreDeal,
      | "quotation_on"
      | "pilot_paid_on"
      | "pilot_completed_on"
      | "pilot_accepted_on"
    >,
    string,
    string,
  ][] = [
    ["quotation_on", "First quotation entry date", "First quotation entry date"],
    ["pilot_paid_on", "Pilot payment confirmed on", "Pilot payment confirmed on"],
    [
      "pilot_completed_on",
      "Pilot successfully completed on",
      "Pilot successfully completed on",
    ],
    ["pilot_accepted_on", "Customer accepted on", "Customer accepted on"],
  ];
  return (
    <SaveForm
      save={save}
      onSubmit={() => ({
        kind: "deal",
        id: deal.id,
        ...Object.fromEntries(fields.map(([key]) => [key, draft[key] || null])),
        pilot_evidence: draft.pilot_evidence,
      })}
    >
      <div className="score-fields">
        {fields
          .filter(([key]) =>
            focus === "quotation"
              ? key === "quotation_on"
              : focus === "pilot"
                ? key !== "quotation_on"
                : true,
          )
          .map(([key, ko, en]) => (
            <label key={key}>
              {tx(ko, en)}
              <input
                type="date"
                max={seoulDate(new Date().toISOString())}
                value={draft[key] ?? ""}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
      </div>
      {focus !== "quotation" && (
        <>
          <label>
            {tx(
              "Payment, completion and acceptance evidence (reference or link)",
              "Payment, completion and customer acceptance evidence (reference or link)",
            )}
            <textarea
              maxLength={2000}
              value={draft.pilot_evidence}
              onChange={(e) =>
                setDraft({ ...draft, pilot_evidence: e.target.value })
              }
            />
          </label>
          <p>
            {tx(
              "All three dates and evidence are required. The customer acceptance date determines the reporting quarter.",
              "All three dates and evidence are required. The customer acceptance date determines the reporting quarter.",
            )}
          </p>
        </>
      )}
      {focus === "quotation" && (
        <p>
          {tx(
            "Record the first quotation entry date. Keep it when the deal advances to a later stage.",
            "Record the first quotation entry date. Keep it when the deal advances to a later stage.",
          )}
        </p>
      )}
    </SaveForm>
  );
}
