/**
 * Read listing screenshots on the device (browser only). Built for phones:
 * the Facebook Marketplace app has no "select all", but screenshots are easy.
 * tesseract.js runs in a Web Worker from files this site serves under /ocr
 * (scripts/copy-ocr-assets.mjs); the images never leave the device. First use
 * downloads about 7 MB (engine + English data), then the browser caches it.
 */

import { cleanOcrText } from "@/lib/listing/ocr-text";

export const MAX_SCREENSHOTS = 6;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_WIDTH = 2000;
const MIN_WIDTH = 1000;
const MAX_PIXELS = 16_000_000;
// A real screenshot is under ~20 MP; a tiny file claiming far more is a
// "decompression bomb" that could run a phone out of memory when decoded.
const MAX_SOURCE_PIXELS = 50_000_000;

export type OcrProgress = { image: number; of: number; pct: number; loading: boolean };

/** Raster images only (no SVG: it's a document that can carry script, and never a screenshot). */
const isRaster = (f: File) => f.type.startsWith("image/") && !f.type.includes("svg");

/** Keep only images, at most MAX_SCREENSHOTS, each under 25 MB. */
export function pickImages(files: FileList | File[] | null): { files: File[]; skipped: number } {
  const all = Array.from(files ?? []);
  const ok = all.filter((f) => isRaster(f) && f.size > 0 && f.size <= MAX_BYTES).slice(0, MAX_SCREENSHOTS);
  return { files: ok, skipped: all.length - ok.length };
}

/** The image's width and height from its header, without decoding the pixels. */
function measure(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error("not an image"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Scale to a size OCR reads well, grey it, and flip dark-mode screenshots to dark-on-light. */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const { w, h } = await measure(file);
  if (!w || !h || w * h > MAX_SOURCE_PIXELS) throw new Error("image too large");
  const bmp = await createImageBitmap(file);
  let scale = bmp.width < MIN_WIDTH ? MIN_WIDTH / bmp.width : bmp.width > MAX_WIDTH ? MAX_WIDTH / bmp.width : 1;
  if (bmp.width * bmp.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (bmp.width * bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
    sum += y;
  }
  if (sum / (d.length / 4) < 110) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Read each image on the device; one text per image, in order. */
export async function readEachScreenshot(files: File[], onProgress: (p: OcrProgress) => void): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  let current = 0;
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: `${window.location.origin}/ocr/lang`,
    workerBlobURL: false,
    logger: (m) => onProgress({ image: current + 1, of: files.length, pct: Math.round((m.progress ?? 0) * 100), loading: m.status !== "recognizing text" }),
  });
  try {
    const texts: string[] = [];
    for (let i = 0; i < files.length; i++) {
      current = i;
      const { data } = await worker.recognize(await prepare(files[i]));
      texts.push(data.text);
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}

export async function readScreenshots(files: File[], onProgress: (p: OcrProgress) => void): Promise<string> {
  return cleanOcrText((await readEachScreenshot(files, onProgress)).join("\n\n"));
}
