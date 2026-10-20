

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { CompanyDocument } from "@/types/domain";
import { buildDocumentHtml } from "@/lib/export/documentPrint";
import type { EmailAttachment } from "@/lib/mentions";

const FILE_KIND: Record<CompanyDocument["docType"], string> = {
  quotation: "quotation",
  purchase_order: "po_received",
  invoice: "invoice",
};


export function documentPdfFilename(doc: CompanyDocument): string {
  const tail = (doc.docNo ?? "draft").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `workspace_${FILE_KIND[doc.docType]}_${tail}.pdf`;
}

// A4 콘텐츠 폭(210 - 14mm 여백×2)을 인쇄 CSS와 같은 ~96dpi 픽셀 폭으로 렌더
// 해야 줄바꿈·표 배치가 인쇄본과 일치한다.
const PAGE_MARGIN_MM = 14;
const CONTENT_W_MM = 210 - PAGE_MARGIN_MM * 2;
const CONTENT_H_MM = 297 - PAGE_MARGIN_MM * 2;
const RENDER_W_PX = 794 - Math.round((PAGE_MARGIN_MM * 2 * 794) / 210); // ≈ 688

export async function buildDocumentPdfAttachment(doc: CompanyDocument, companyName: string): Promise<EmailAttachment> {
  const html = await buildDocumentHtml(doc, companyName);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-12000px;top:0;width:${RENDER_W_PX}px;height:1123px;border:0`;
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
      setTimeout(resolve, 4000); // onload가 안 오는 브라우저 폴백
    });
    const idoc = iframe.contentDocument;
    const body = idoc?.body;
    if (!idoc || !body) throw new Error("PDF render failed (iframe)");

    // 로고·라인아이템 사진 로드 대기 — 빈 자리로 캡처되는 것 방지
    await Promise.all(
      Array.from(idoc.images).map(
        (img) =>
          new Promise<void>((r) => {
            if (img.complete) return r();
            img.addEventListener("load", () => r());
            img.addEventListener("error", () => r());
            setTimeout(r, 3000);
          }),
      ),
    );

    const canvas = await html2canvas(body, {
      scale: 2,
      backgroundColor: "#ffffff",
      windowWidth: RENDER_W_PX,
      useCORS: true,
      logging: false,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pxPerMm = canvas.width / CONTENT_W_MM;
    const pageHpx = Math.floor(CONTENT_H_MM * pxPerMm);
    let y = 0;
    let first = true;
    while (y < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("PDF render failed (canvas)");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", PAGE_MARGIN_MM, PAGE_MARGIN_MM, CONTENT_W_MM, sliceH / pxPerMm);
      first = false;
      y += sliceH;
    }

    const uri = pdf.output("datauristring");
    const dataBase64 = uri.slice(uri.indexOf("base64,") + 7);
    return { filename: documentPdfFilename(doc), mimeType: "application/pdf", dataBase64 };
  } finally {
    iframe.remove();
  }
}
