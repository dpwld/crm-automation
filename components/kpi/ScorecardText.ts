import { useKpiLanguage } from "./KpiLanguage";
export function useScoreText() {
 const {language}=useKpiLanguage();
 return {language,tx:(_previous:string,en:string)=>en};
}
export function errorText(code: string, english: boolean) {
  const messages: Record<string, [string, string]> = {
    target_conflict: [
      "This target changed in another session. Close and reopen it to review the latest value.",
      "This target changed in another session. Close and reopen to review the latest value.",
    ],
    invalid_quarter: ["Choose a valid quarter.", "Choose a valid quarter."],
    duplicate_serial: [
      "This serial already exists. Edit the existing unit.",
      "This serial already exists. Edit the existing unit.",
    ],
    pilot_evidence_required: [
      "Enter payment, successful completion and acceptance evidence dated on or before acceptance.",
      "Enter payment, successful completion and acceptance evidence dated on or before acceptance.",
    ],
    invalid_date: [
      "Enter a valid date that is not in the future.",
      "Enter a valid date that is not in the future.",
    ],
    date_required: ["Enter a date.", "Enter a date."],
    invalid_target: [
      "Counts must be positive integers; rates must be above 0 and at most 100.",
      "Counts must be positive integers; rates must be above 0 and at most 100.",
    ],
    ct_date_required: [
      "Enter both the CT date (on/after production) and deviation (%).",
      "Enter both the CT date (on/after production) and deviation (%).",
    ],
    test_date_required: [
      "Enter both the first-test date (on/after production) and result.",
      "Enter both the first-test date (on/after production) and result.",
    ],
    restricted: [
      "You do not have access to edit this record.",
      "You do not have access to edit this record.",
    ],
    company_mismatch: [
      "Choose a deal belonging to the quotation’s customer.",
      "Choose a deal belonging to the quotation’s customer.",
    ],
  };
  return (messages[code] ?? [
    "Could not save. Check the fields and connection, then retry.",
    "Could not save. Check the fields and connection, then retry.",
  ])[english ? 1 : 0];
}
