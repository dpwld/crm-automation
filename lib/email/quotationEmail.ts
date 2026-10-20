import type { CompanyDocument } from "@/types/domain";



const NAVY = "#0e2a52";
const BLUE = "#2f6fd8";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtMoney(n: number, currency: string): string {
  const sym = currency === "KRW" ? "₩" : currency === "USD" ? "$" : `${currency} `;
  return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: currency === "KRW" ? 0 : 2 })}`;
}


export function quotationEmailHtml(doc: CompanyDocument, companyName: string, message: string): string {
  const rows = doc.lineItems
    .filter((li) => li.name.trim())
    .map(
      (li, i) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e6e9f0;font-size:13px;color:#1f2430;${i % 2 ? "background:#f7f9fc;" : ""}">${esc(li.name).replace(/\n/g, "<br/>")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e6e9f0;font-size:13px;color:#1f2430;text-align:right;white-space:nowrap;${i % 2 ? "background:#f7f9fc;" : ""}">${li.qty} ${esc(li.unit ?? "pcs")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e6e9f0;font-size:13px;color:#1f2430;text-align:right;white-space:nowrap;${i % 2 ? "background:#f7f9fc;" : ""}">${fmtMoney(li.unitPrice, doc.currency)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e6e9f0;font-size:13px;color:#1f2430;text-align:right;white-space:nowrap;font-weight:600;${i % 2 ? "background:#f7f9fc;" : ""}">${fmtMoney(li.amount, doc.currency)}</td>
      </tr>`,
    )
    .join("");

  const meta = [
    doc.validUntil ? `Valid until <b>${esc(doc.validUntil)}</b>` : "",
    doc.incoterms ? `Incoterms <b>${esc(doc.incoterms)}</b>` : "",
    doc.paymentTerms ? `Payment <b>${esc(doc.paymentTerms)}</b>` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  return `
  <div style="font-family:-apple-system,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',sans-serif;max-width:640px;margin:0 auto;color:#1f2430">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px 10px 0 0;overflow:hidden">
      <tr>
        <td style="background:${NAVY};padding:18px 24px">
          <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:.02em">Workspace</span>
          <span style="float:right;font-size:12px;font-weight:600;color:#9db6dd;letter-spacing:.14em;padding-top:6px">QUOTATION</span>
        </td>
      </tr>
      <tr>
        <td style="background:${BLUE};height:4px;font-size:0;line-height:0">&nbsp;</td>
      </tr>
    </table>

    <div style="border:1px solid #e6e9f0;border-top:none;border-radius:0 0 10px 10px;padding:24px">
      <p style="margin:0 0 4px;font-size:13px;color:#67718a">${esc(companyName)}</p>
      <p style="margin:0 0 18px;font-size:16px;font-weight:700;color:${NAVY}">${esc(doc.docNo ?? "Quotation")}</p>

      ${message.trim() ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;white-space:pre-wrap">${esc(message)}</p>` : ""}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e6e9f0;border-radius:8px">
        <tr>
          <th style="padding:8px 10px;background:#eef3fb;font-size:11px;letter-spacing:.08em;color:${NAVY};text-align:left;text-transform:uppercase">Item</th>
          <th style="padding:8px 10px;background:#eef3fb;font-size:11px;letter-spacing:.08em;color:${NAVY};text-align:right;text-transform:uppercase">Qty</th>
          <th style="padding:8px 10px;background:#eef3fb;font-size:11px;letter-spacing:.08em;color:${NAVY};text-align:right;text-transform:uppercase">Unit&nbsp;price</th>
          <th style="padding:8px 10px;background:#eef3fb;font-size:11px;letter-spacing:.08em;color:${NAVY};text-align:right;text-transform:uppercase">Amount</th>
        </tr>
        ${rows}
        <tr>
          <td colspan="3" style="padding:10px;text-align:right;font-size:13px;font-weight:700;color:${NAVY};background:#f2f6fd">TOTAL</td>
          <td style="padding:10px;text-align:right;font-size:14px;font-weight:800;color:${NAVY};background:#f2f6fd;white-space:nowrap">${fmtMoney(doc.total ?? 0, doc.currency)}</td>
        </tr>
      </table>

      ${meta ? `<p style="margin:14px 0 0;font-size:12px;color:#67718a">${meta}</p>` : ""}
      <p style="margin:16px 0 0;font-size:12px;color:#8a93a8">The formal PDF copy of this quotation is attached to this email.</p>
    </div>
  </div>`;
}
