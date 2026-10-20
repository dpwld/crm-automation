import { currentNdaOrganisation, ndaDetails, NDA_TITLE, validateNdaTerms, type NdaFields, type NdaKind, type NdaOrganisation } from "./template";

export function docHtml(f: NdaFields, _baseline?: NdaFields | null, _highlight = false, kind: NdaKind = "company", organisation: NdaOrganisation = currentNdaOrganisation()): string {
  const invalid = validateNdaTerms(organisation.terms);
  if (invalid) return `<p role="status">${escapeHtml(invalid)}</p>`;
  const base = "font:11pt/1.5 'Times New Roman',Times,serif;color:#111";
  const details = ndaDetails(f, kind, organisation)
    .map(([label, value]) => `<p style="margin:0 0 8pt"><strong>${label}:</strong> ${escapeHtml(value)}</p>`).join("");
  const signature = (name: string, individual = false) => `<td style="width:50%;vertical-align:top;padding-right:24pt">
    <p style="font-weight:bold">${escapeHtml(name)}</p>
    <p>Signature: ___________________________</p><p>Name: _______________________________</p>
    ${individual ? "" : "<p>Title: ________________________________</p>"}<p>Date: ________________________________</p></td>`;
  return `<div style="${base}">
    <p style="text-align:center;font-weight:bold">${NDA_TITLE}</p>
    ${details}
    <div style="white-space:pre-wrap;margin:20pt 0">${escapeHtml(organisation.terms)}</div>
    <table style="width:100%;border-collapse:collapse"><tr>${signature(organisation.name)}${signature(f.partyBName, kind === "individual")}</tr></table>
  </div>`;
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
