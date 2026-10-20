// CRM deal milestones; no global scorecard or target configuration.
export interface ScoreDeal {
  id: string;
  company_id: string | null;
  deal_no: string;
  title: string;
  kind: string;
  status: string;
  quotation_on: string | null;
  pilot_paid_on: string | null;
  pilot_completed_on: string | null;
  pilot_accepted_on: string | null;
  pilot_evidence: string;
}
export interface ScoreData {
 rows: {deals: ScoreDeal[]};
 sources: {business: "ready" | "restricted" | "error"};
}
