/**
 * Reads a PDF the buyer attaches (the dealer's numbers) on the device, with pdf.js served from this site
 * (/ocr/pdf, scripts/copy-ocr-assets.mjs). A PDF with text is read as text; a scanned PDF (pictures of pages)
 * is drawn page by page and read with the on-device OCR. The file never leaves the device, and the PDF's own
 * scripts and forms are never run (only text extraction and drawing are used).
 */

import { linesFromPieces, type PdfPiece } from "@/lib/dealsheet/pdf-lines";
import { readCanvases, type OcrProgress } from "@/lib/ocr";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 8;

export type PdfRead = { text: string; pages: number; scanned: boolean };

export async function readPdf(file: File, onProgress: (p: OcrProgress) => void): Promise<PdfRead> {
  if (file.size > MAX_PDF_BYTES) throw new Error("too large");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: "/ocr/pdf/wasm/",
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;
  try {
    const n = Math.min(doc.numPages, MAX_PDF_PAGES);
    const pageTexts: string[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pieces: PdfPiece[] = content.items.flatMap((it) =>
        "str" in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height || Math.abs(it.transform[3]) }] : [],
      );
      pageTexts.push(linesFromPieces(pieces).join("\n"));
    }
    const text = pageTexts.join("\n\n");
    // Under a few words per page: pictures of pages (a scan or a phone photo saved as PDF). Draw and read them.
    if (text.replace(/\s/g, "").length >= 40 * n) return { text, pages: n, scanned: false };
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      // About 3x for OCR (small print reads better), but never a canvas bigger than 2600 x 3400 (phones run out of memory).
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2600 / base.width, 3400 / base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      canvases.push(canvas);
    }
    return { text: (await readCanvases(canvases, onProgress)).join("\n\n"), pages: n, scanned: true };
  } finally {
    await doc.loadingTask.destroy();
  }
}
