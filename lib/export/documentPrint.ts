

import type { CompanyDocument, Vendor, VendorPo } from "@/types/domain";
import { documentTotals } from "@/lib/data/documents";
import { fetchPoSignature, orgForPrint } from "@/lib/data/org";
import { lineItemImageUrl } from "@/lib/data/docs";
import { CEO_SIGNER, PURCHASE_ORDER_TERMS } from "@/lib/config/company";

const LOGO_URL = "/brand/workspace-lockup-blue.png";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));


const escLines = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

function money(n: number | null | undefined, currency: string): string {
  const v = Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "USD" ? `$${v}` : `${currency} ${v}`;
}


function fileBase(kind: string, no: string | null): string {
  const tail = (no ?? "draft").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `workspace_${kind}_${tail}`;
}


function printWindow(html: string): boolean {
  const win = window.open("", "_blank", "width=920,height=1000");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();

  // print()는 반드시 한 번만 — load 핸들러와 fallback 타이머가 둘 다 발화해
  // 인쇄 대화상자가 두 번 뜨고, 첫 "PDF로 저장"이 두 번째 print()에 밀려
  // 저장이 실패하던 버그 수정 (2026-09-28 피드백).
  let fired = false;
  const go = () => {
    if (fired) return;
    fired = true;
    win.focus();
    win.print();
  };
  const img = win.document.querySelector("img");
  if (img && !img.complete) {
    img.addEventListener("load", () => setTimeout(go, 100));
    img.addEventListener("error", () => setTimeout(go, 100));
    setTimeout(go, 1500); // fallback if neither event fires
  } else {
    setTimeout(go, 250);
  }
  return true;
}


const TEMPLATE_CSS = `
    @page { size: letter; margin: 0.5in; }
    
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Calibri, Carlito, 'Segoe UI', Arial, sans-serif; color: #000; margin: 0; font-size: 9pt; line-height: 1.3; }
    
    table.pagewrap { width: 100%; border-collapse: collapse; }
    table.pagewrap > thead > tr > td { padding: 0 0 6pt; }
    table.pagewrap > tfoot > tr > td { padding: 10pt 0 0; }
    .runhead { text-align: right; font-size: 8pt; color: #888888; }
    .pagefoot { text-align: center; font-size: 8pt; color: #888888; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .logo { height: 52px; display: block; margin-bottom: 8px; }
    .co { font-size: 9pt; }
    .co b { color: #0F4C81; font-size: 11pt; }
    .hr { width: 47%; }
    h1 { font-size: 20pt; font-weight: 700; color: #0F4C81; margin: 0 0 10px; text-align: right; }
    table.info { border-collapse: collapse; font-size: 9.5pt; width: 100%; }
    table.info td { border: 1px solid #8c8c8c; padding: 4px 9px; vertical-align: top; }
    table.info td.k { background: #EAF2F8; color: #0F4C81; font-weight: 700; white-space: nowrap; width: 104px; }
    table.pair { width: 100%; border-collapse: collapse; margin-top: 14px; }
    table.pair > tbody > tr > td { width: 50%; border: 1px solid #8c8c8c; padding: 7px 11px; vertical-align: top; font-size: 9pt; }
    table.pair.vs > tbody > tr > td { background: #F2F2F2; }
    .bh { color: #0F4C81; font-weight: 700; font-size: 10pt; margin-bottom: 4px; }
    b.nm { font-size: 10pt; }
    .it { font-style: italic; }
    .refbar { background: #0F4C81; color: #fff; font-size: 10pt; padding: 5px 10px; margin-top: 12px; }
    .refbar b { font-weight: 700; }
    table.items { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 12px; }
    table.items tr { page-break-inside: avoid; }
    table.items tbody.totals { page-break-inside: avoid; }
    table.items th { background: #0F4C81; color: #fff; font-weight: 700; padding: 5px 6px; text-align: center; border: 1px solid #0F4C81; font-size: 9pt; }
    table.items th.dsc { text-align: left; }
    table.items td { border: 1px solid #8c8c8c; padding: 5px 6px; vertical-align: top; }
    table.items td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    table.items td.c { text-align: center; }
    tr.tot td { font-weight: 700; }
    tr.tot td.lbl { text-align: right; }
    tr.tot.alt td { background: #F2F2F2; }
    tr.grand td { background: #0F4C81; color: #fff; }
    .notes { margin-top: 12px; border: 1px solid #8c8c8c; background: #EAF2F8; padding: 8px 12px; }
    .notes .h { color: #0F4C81; font-weight: 700; font-size: 9pt; margin-bottom: 3px; }
    .notes .body { font-size: 9pt; white-space: pre-wrap; }
    .fnote { font-size: 9pt; margin-top: 4px; }
    table.pair.sign { page-break-inside: avoid; }
    table.pair.sign td { padding-bottom: 10px; }
    .sign .row { display: flex; align-items: flex-end; gap: 5px; margin-top: 10px; }
    .sign .lbl { font-size: 9pt; white-space: nowrap; }
    .sign .val { width: 230px; border-bottom: 1px solid #000; min-height: 14px; padding: 0 4px 1px; font-size: 9.5pt; position: relative; }
    .sign img.sig { position: absolute; left: 12px; bottom: -3px; height: 32px; }
    .tnc { margin-top: 18px; }
    .tnc .title { text-align: center; color: #0F4C81; font-weight: 700; font-size: 14pt; margin-bottom: 8px; }
    .tnc .ch { color: #0F4C81; font-weight: 700; font-size: 10pt; margin: 7px 0 1px; page-break-after: avoid; }
    .tnc .cb { font-size: 9pt; line-height: 1.26; }
    
    @media screen { body { padding: 28px 34px; background: #fff; } }
  `;

// ── Sell side: quotation / invoice / received customer PO ─────────────────────

const DOC_TITLE: Record<CompanyDocument["docType"], string> = {
  quotation: "QUOTATION",
  purchase_order: "PURCHASE ORDER",
  invoice: "INVOICE",
};

const DOC_FILE_KIND: Record<CompanyDocument["docType"], string> = {
  quotation: "quotation",
  purchase_order: "po_received",
  invoice: "invoice",
};


export async function buildDocumentHtml(doc: CompanyDocument, companyName: string): Promise<string> {
  const org = await orgForPrint();
  const cur = doc.currency || "USD";
  const t = documentTotals(doc.lineItems, doc.discountPct, doc.taxRate);
  const title = DOC_TITLE[doc.docType];
  const filename = fileBase(DOC_FILE_KIND[doc.docType], doc.docNo);
  const usd = (n: number) => money(n, cur);

  // 발행/승인된 문서에는 대표 서명·성함·직함·날짜 자동 기재 (PO와 동일 규칙)
  const signed = doc.status === "issued" || doc.status === "accepted";
  const fmtUs = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const signDate = signed && doc.issueDate ? fmtUs(new Date(`${doc.issueDate}T12:00:00`)) : "";
  const signImg = signed ? await fetchPoSignature() : null;
  const signRow = (label: string, value: string, sig?: string | null) =>
    `<div class="row"><span class="lbl">${esc(label)}</span><span class="val">${sig ? `<img class="sig" src="${sig}" alt="">` : esc(value)}</span></div>`;

  // 발신 주소(us/kr) — 헤더 좌측 회사 블록에 반영
  const fromAddr = doc.fromAddr === "kr" && org.addressKr
    ? org.addressKr.split(/\r?\n/).filter((l) => l.trim() && l.trim() !== org.name).join("\n")
    : org.address;
  const addressOneLine = (fromAddr || "").replace(/\r?\n/g, ", ");

  // 이미지 라인은 서명 URL을 미리 받아 item 셀 썸네일로 찍는다 (실패 시 이미지 없이 인쇄).
  // billed === false(참고 단가) 라인은 Amount 셀에 "Reference only" — 합계는 documentTotals가 이미 제외.
  const rows = (
    await Promise.all(
      doc.lineItems.map(async (li, i) => {
        const img = li.imagePath ? await lineItemImageUrl(li.imagePath).catch(() => "") : "";
        return `<tr>
        <td class="c">${i + 1}</td>
        <td>${img ? `<img src="${esc(img)}" alt="" style="height:64px;max-width:140px;object-fit:contain;display:block;margin-bottom:3px;border:1px solid #d0d0d0">` : ""}${escLines(li.name)}${li.note ? `<br><span style="color:#777">${escLines(li.note)}</span>` : ""}</td>
        <td class="c">${esc(String(li.qty))}</td>
        <td class="c">${esc(li.unit || "pcs")}</td>
        <td class="n">${usd(li.unitPrice)}</td>
        <td class="n">${li.billed === false ? `<span style="color:#888">Reference only</span>` : usd(li.amount)}</td>
      </tr>`;
      }),
    )
  ).join("");

  const billLines = (doc.billTo || companyName).split(/\r?\n/);
  const shipLines = (doc.shipTo || doc.billTo || companyName).split(/\r?\n/);
  const noun = title.charAt(0) + title.slice(1).toLowerCase();

  const body = `
    <table class="pagewrap">
    <thead><tr><td><div class="runhead">${esc(org.name)} · ${esc(noun)}</div></td></tr></thead>
    <tfoot><tr><td><div class="pagefoot">${esc(org.name)} &nbsp;•&nbsp; ${esc(addressOneLine)}</div></td></tr></tfoot>
    <tbody><tr><td>

    <div class="head">
      <div>
        <div style="font-weight:700;font-size:20px">${esc(org.name)}</div>
        <div class="co">
          <b>${esc(org.name)}</b><br>
          ${escLines(fromAddr)}<br>
          Phone: ${esc(org.phone)}<br>
          Web: ${esc(org.web)}
        </div>
      </div>
      <div class="hr">
        <h1>${esc(title)}</h1>
        <table class="info">
          <tr><td class="k">${esc(title === "INVOICE" ? "Invoice" : title === "PURCHASE ORDER" ? "PO" : "Quotation")} No.:</td><td>${esc(doc.docNo ?? "(draft)")}</td></tr>
          <tr><td class="k">Issue Date:</td><td>${esc(doc.issueDate ?? "N/A")}</td></tr>
          <tr><td class="k">Currency:</td><td>${esc(cur)}</td></tr>
          <tr><td class="k">Payment Term:</td><td>${escLines(doc.paymentTerms || "N/A")}</td></tr>
          <tr><td class="k">Shipping Term:</td><td>${esc(doc.incoterms || "N/A")}</td></tr>
          ${doc.docType === "quotation" ? `<tr><td class="k">Valid Until:</td><td>${esc(doc.validUntil ?? "N/A")}</td></tr>` : ""}
          <tr><td class="k">Prepared by:</td><td>${esc(CEO_SIGNER.name)}</td></tr>
        </table>
      </div>
    </div>

    <table class="pair vs"><tbody><tr>
      <td>
        <div class="bh">CUSTOMER (TO):</div>
        <b class="nm">${esc(billLines[0] ?? companyName)}</b>${billLines.length > 1 ? `<br>${escLines(billLines.slice(1).join("\n"))}` : ""}
      </td>
      <td>
        <div class="bh">SHIP TO / CONSIGNEE:</div>
        <b class="nm">${esc(shipLines[0] ?? "")}</b>${shipLines.length > 1 ? `<br>${escLines(shipLines.slice(1).join("\n"))}` : ""}
        <div class="it">Please reference this ${esc(noun.toLowerCase())} number on all related correspondence.</div>
      </td>
    </tr></tbody></table>

    ${doc.projectRef ? `<div class="refbar"><b>Project / Reference:</b> ${esc(doc.projectRef)}</div>` : ""}

    <table class="items">
      <colgroup>
        <col style="width:6%"><col style="width:44%"><col style="width:8%"><col style="width:8%">
        <col style="width:16%"><col style="width:18%">
      </colgroup>
      <thead><tr>
        <th>Item</th><th class="dsc">Description / Part No.</th>
        <th>Qty</th><th>Unit</th><th>Unit Price</th><th>Amount</th>
      </tr></thead>
      <tbody>
        ${rows || `<tr><td class="c">1</td><td colspan="5">N/A</td></tr>`}
      </tbody>
      <tbody class="totals">
        <tr class="tot alt"><td colspan="5" class="lbl">Subtotal</td><td class="n">${usd(t.subtotal)}</td></tr>
        ${t.discount ? `<tr class="tot"><td colspan="5" class="lbl">Discount${doc.discountPct ? ` (${doc.discountPct}%)` : ""}</td><td class="n">(${usd(t.discount)})</td></tr>` : ""}
        ${t.discount ? `<tr class="tot alt"><td colspan="5" class="lbl">Net</td><td class="n">${usd(t.net)}</td></tr>` : ""}
        <tr class="tot${t.discount ? "" : " alt"}"><td colspan="5" class="lbl">Sales Tax${doc.taxRate ? ` (${doc.taxRate}%)` : ""}</td><td class="n">${usd(t.tax)}</td></tr>
        <tr class="tot grand"><td colspan="5" class="lbl">TOTAL (${esc(cur)})</td><td class="n">${usd(t.total)}</td></tr>
      </tbody>
    </table>

    <table class="pair sign"><tbody><tr>
      <td>
        <div class="bh" style="font-size:9pt">AUTHORIZED BY (${esc(org.name)})</div>
        ${signRow("Signature:", "", signImg)}
        ${signRow("Name:", signed ? CEO_SIGNER.name : "")}
        ${signRow("Title:", signed ? CEO_SIGNER.title : "")}
        ${signRow("Date:", signDate)}
      </td>
      <td>
        <div class="bh" style="font-size:9pt">ACCEPTED BY (${esc(companyName)})</div>
        ${signRow("Signature:", "")}
        ${signRow("Name:", "")}
        ${signRow("Title:", "")}
        ${signRow("Date:", "")}
      </td>
    </tr></tbody></table>

    ${doc.terms ? `<div class="tnc"><div class="title">TERMS AND CONDITIONS</div><div class="cb" style="white-space:pre-wrap">${escLines(doc.terms)}</div></div>` : ""}

    </td></tr></tbody>
    </table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(filename)}</title>
  <style>${TEMPLATE_CSS}</style></head><body>${body}</body></html>`;
}

export async function printDocument(doc: CompanyDocument, companyName: string): Promise<boolean> {
  return printWindow(await buildDocumentHtml(doc, companyName));
}

// ── Buy side: purchase order issued to a vendor ───────────────────────────────


const PO_TERMS: [string, string][] = [];

function extraClauses(text: string | undefined): [string, string][] {
  return (text || "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b, i) => {
      const [head, ...rest] = b.split("\n");
      const title = head.replace(/^\d+\.\s*/, "").trim();
      return [`${PO_TERMS.length + i + 1}. ${title}`, rest.join("\n").trim()];
    });
}


export async function buildVendorPoHtml(po: VendorPo, vendor: Vendor | null): Promise<string> {
  const org = await orgForPrint();
  const cur = po.currency || "USD";
  const shipping = po.shipping ?? 0;
  const tax = po.tax ?? 0;
  const filename = fileBase("po", po.poNo);
  // 할인 등 음수 라인은 품목이 아니라 실제 PO처럼 합계 영역의 별도 행(괄호 금액)으로 찍는다.
  const positives = po.lineItems.filter((li) => li.amount >= 0);
  const negatives = po.lineItems.filter((li) => li.amount < 0);
  // billed === false(참고 단가) 라인은 합계에서 제외 — 그런 라인이 있으면 저장된
  // po.total(전체 합) 대신 여기서 다시 계산한다 (poTotals는 procurement 소관이라 손대지 않음).
  const subtotal = positives.reduce((a, li) => a + (li.billed === false ? 0 : li.amount), 0);
  const negSum = negatives.reduce((a, li) => a + (li.billed === false ? 0 : li.amount), 0);
  const hasUnbilled = po.lineItems.some((li) => li.billed === false);
  const total = !hasUnbilled && po.total != null ? po.total : subtotal + negSum + shipping + tax;
  // "Tax not included / VAT excluded per quote"가 NOTES에 있으면 실제 PO처럼 "Not included*"로 표기
  const taxNotIncluded = tax === 0 && /(tax|vat)[^.\n]{0,60}(not included|excluded)/i.test(po.terms || "");
  // NOTES 안의 "*State and local taxes…" 각주 줄은 실제 PO처럼 박스 밖 아래에 찍는다.
  const termLines = (po.terms || "").split(/\r?\n/);
  const noteBody = termLines.filter((l) => !l.trim().startsWith("*")).join("\n").trim();
  const footNotes = termLines.filter((l) => l.trim().startsWith("*"));

  // 발행된 PO(승인 발행이든 대표 직접 발행이든)는 대표 서명·성함·직함·날짜가 자동 기재된다.
  // 날짜: 승인 건은 승인일, 직접 발행 건은 발행일. draft/void는 빈 줄.
  const signed = po.status === "issued" || po.status === "accepted";
  const fmtUs = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const signDate = !signed
    ? ""
    : po.approvalStatus === "approved" && po.approvalDecidedAt
      ? fmtUs(new Date(po.approvalDecidedAt))
      : po.issueDate
        ? fmtUs(new Date(`${po.issueDate}T12:00:00`)) // date-only는 UTC 자정 파싱으로 하루 밀리는 것 방지
        : "";
  const signImg = signed ? await fetchPoSignature() : null;
  // Buyer는 항상 대표(CEO) — 작성자가 누구든 회사 명의 구매자는 대표로 표기한다 (2026-08-13 지시).
  const buyerName = CEO_SIGNER.name;

  const fmtQty = (n: number) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd = (n: number) => money(n, cur);

  const rows = positives
    .map(
      (li, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td>${escLines(li.description)}</td>
        <td class="c">${fmtQty(li.qty)}</td>
        <td class="c">${esc(li.unit || "Each")}</td>
        <td class="n">${usd(li.unitPrice)}</td>
        <td class="n">${li.billed === false ? `<span style="color:#888">Reference only</span>` : usd(li.amount)}</td>
        <td class="c">${esc(li.delivery || "")}</td>
      </tr>`,
    )
    .join("");

  const css = TEMPLATE_CSS;

  const signRow = (label: string, value: string, sig?: string | null) =>
    `<div class="row"><span class="lbl">${esc(label)}</span><span class="val">${sig ? `<img class="sig" src="${sig}" alt="">` : esc(value)}</span></div>`;

  const negRow = (li: (typeof po.lineItems)[number]) =>
    `<tr class="tot"><td colspan="5" class="lbl">${esc(li.description)}</td><td class="n">${li.billed === false ? `<span style="color:#888;font-weight:400">Reference only</span>` : `(${money(Math.abs(li.amount), cur).replace(/^-/, "")})`}</td><td></td></tr>`;

  // 배송지 첫 줄(회사명)은 실제 PO처럼 굵게
  const shipLines = (po.shipTo || "N/A").split(/\r?\n/);
  const addressOneLine = (org.address || "").replace(/\r?\n/g, ", ");

  const body = `
    <table class="pagewrap">
    <thead><tr><td><div class="runhead">${esc(org.name)} · Purchase Order</div></td></tr></thead>
    <tfoot><tr><td><div class="pagefoot">${esc(org.name)} &nbsp;•&nbsp; ${esc(addressOneLine)}</div></td></tr></tfoot>
    <tbody><tr><td>

    <div class="head">
      <div>
        <div style="font-weight:700;font-size:20px">${esc(org.name)}</div>
        <div class="co">
          <b>${esc(org.name)}</b><br>
          ${escLines(org.address)}<br>
          Phone: ${esc(org.phone)}<br>
          Web: ${esc(org.web)}
        </div>
      </div>
      <div class="hr">
        <h1>PURCHASE ORDER</h1>
        <table class="info">
          <tr><td class="k">PO No.:</td><td>${esc(po.poNo ?? "(draft)")}</td></tr>
          <tr><td class="k">Issue Date:</td><td>${esc(po.issueDate ?? "N/A")}</td></tr>
          <tr><td class="k">Currency:</td><td>${esc(cur)}</td></tr>
          <tr><td class="k">Payment Term:</td><td>${escLines(po.paymentTerms || "N/A")}</td></tr>
          <tr><td class="k">Shipping Term:</td><td>${esc(po.shippingTerms || "N/A")}</td></tr>
          <tr><td class="k">Buyer:</td><td>${esc(buyerName)}</td></tr>
        </table>
      </div>
    </div>

    <table class="pair vs"><tbody><tr>
      <td>
        <div class="bh">VENDOR (TO):</div>
        ${vendor ? `<b class="nm">${esc(vendor.legalName)}</b><br>` : "N/A"}
        ${vendor?.contact ? `Attn: ${esc(vendor.contact)}<br>` : ""}
        ${vendor?.address ? `${escLines(vendor.address)}<br>` : ""}
        ${vendor?.phone ? `Phone: ${esc(vendor.phone)}<br>` : ""}
        ${vendor?.email ? `Email: ${esc(vendor.email)}<br>` : ""}
        ${po.memo ? `<span class="it">Vendor Ref / Quote: ${esc(po.memo.replace(/^Quote\s*/i, ""))}</span>` : ""}
      </td>
      <td>
        <div class="bh">SHIP TO / CONSIGNEE:</div>
        <b class="nm">${esc(shipLines[0] ?? "")}</b>${shipLines.length > 1 ? `<br>${escLines(shipLines.slice(1).join("\n"))}` : ""}
        <div class="it">Please include this PO number on all packing slips, invoices, and shipping documents.</div>
      </td>
    </tr></tbody></table>

    ${po.projectRef ? `<div class="refbar"><b>Project / Reference:</b> ${esc(po.projectRef)}</div>` : ""}

    <table class="items">
      <colgroup>
        <col style="width:5.6%"><col style="width:40.7%"><col style="width:6.5%"><col style="width:6.5%">
        <col style="width:13%"><col style="width:13.8%"><col style="width:13.9%">
      </colgroup>
      <thead><tr>
        <th>Item</th><th class="dsc">Description / Part No.</th>
        <th>Qty</th><th>Unit</th><th>Unit Price</th><th>Amount</th><th>Delivery</th>
      </tr></thead>
      <tbody>
        ${rows || `<tr><td class="c">1</td><td colspan="6">N/A</td></tr>`}
      </tbody>
      <tbody class="totals">
        <tr class="tot alt"><td colspan="5" class="lbl">Subtotal</td><td class="n">${usd(subtotal)}</td><td></td></tr>
        ${negatives.map(negRow).join("")}
        ${shipping !== 0 ? `<tr class="tot"><td colspan="5" class="lbl">Shipping / ${esc(po.shippingTerms?.split(/[;,(—]/)[0].trim() || "DAP")}</td><td class="n">${usd(shipping)}</td><td></td></tr>` : ""}
        <tr class="tot alt"><td colspan="5" class="lbl">Tax</td><td class="n">${taxNotIncluded ? "Not included*" : usd(tax)}</td><td></td></tr>
        <tr class="tot grand"><td colspan="5" class="lbl">TOTAL${negatives.length ? " (Net)" : ""}</td><td class="n">${usd(total)}</td><td></td></tr>
      </tbody>
    </table>

    ${noteBody ? `<div class="notes"><div class="h">NOTES / SPECIAL INSTRUCTIONS:</div><div class="body">${escLines(noteBody)}</div></div>` : ""}
    ${footNotes.map((l) => `<div class="fnote">${esc(l)}</div>`).join("")}

    <table class="pair sign"><tbody><tr>
      <td>
        <div class="bh" style="font-size:9pt">AUTHORIZED BY (${esc(org.name)})</div>
        ${signRow("Signature:", "", signImg)}
        ${signRow("Name:", signed ? CEO_SIGNER.name : "")}
        ${signRow("Title:", signed ? CEO_SIGNER.title : "")}
        ${signRow("Date:", signDate)}
      </td>
      <td>
        <div class="bh" style="font-size:9pt">ACCEPTED BY (${esc(vendor?.legalName ?? "Vendor")})</div>
        ${signRow("Signature:", "")}
        ${signRow("Name:", "")}
        ${signRow("Title:", "")}
        ${signRow("Date:", "")}
      </td>
    </tr></tbody></table>

    <div class="tnc">
      <div class="title">STANDARD TERMS AND CONDITIONS</div>
      ${[...(PURCHASE_ORDER_TERMS ? [["Terms and conditions", PURCHASE_ORDER_TERMS] as [string,string]] : []), ...extraClauses(po.extraTerms)].map(([h, t]) => `<div class="ch">${esc(h)}</div><div class="cb">${escLines(t)}</div>`).join("")}
    </div>

    </td></tr></tbody>
    </table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(filename)}</title>
  <style>${css}</style></head><body>${body}</body></html>`;
}

export async function printVendorPo(po: VendorPo, vendor: Vendor | null): Promise<boolean> {
  return printWindow(await buildVendorPoHtml(po, vendor));
}
