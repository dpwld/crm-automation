"use client";
import { KpiLanguageProvider } from "./KpiLanguage";
import { useScoreText } from "./ScorecardText";
import { useKpiData } from "./useKpiData";
import { DealMilestonesForm, saveScoreRecord } from "./ScorecardForms";
import type { ScoreData } from "@/lib/kpi/scorecard";
import "./QuarterScorecard.css";
export function DealKpiFields({ dealId }: { dealId: string }) {
  return (
    <KpiLanguageProvider>
      <Fields dealId={dealId} />
    </KpiLanguageProvider>
  );
}
function Fields({ dealId }: { dealId: string }) {
  const { tx } = useScoreText();
  const { data, error, refresh, loading } = useKpiData<ScoreData>(
    "/api/kpi/scorecard",
    true,
  );
  const deal = data?.rows.deals.find((d) => d.id === dealId);
  if (data?.sources.business === "restricted") return null;
  return (
    <details className="score-details">
      <summary>
        {tx(
          "KPI · quotation entry / paid pilot milestones",
          "KPI · quotation date / paid pilot confirmation",
        )}
      </summary>
      <div className="score-records">
        {loading && !data && <p>{tx("Loading…", "Loading…")}</p>}
        {error || data?.sources.business === "error" ? (
          <p role="alert">
            {tx("Could not load this record.", "Could not load records.")}{" "}
            <button onClick={() => void refresh()}>
              {tx("Retry", "Retry")}
            </button>
          </p>
        ) : deal ? (
          <DealMilestonesForm
            key={deal.id}
            deal={deal}
            save={async (body) => {
              await saveScoreRecord(body);
              await refresh();
            }}
          />
        ) : null}
      </div>
    </details>
  );
}
