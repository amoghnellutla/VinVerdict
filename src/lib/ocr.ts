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

/** The average colour along the image's edges (its background, near enough). */
function edgeColour(src: HTMLCanvasElement): string {
  const ctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#fff";
  const w = src.width;
  const h = src.height;
  let sum = 0;
  let n = 0;
  for (const [x, y, rw, rh] of [[0, 0, w, 1], [0, h - 1, w, 1], [0, 0, 1, h], [w - 1, 0, 1, h]] as const) {
    const d = ctx.getImageData(x, y, rw, rh).data;
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i];
      n++;
    }
  }
  const g = n ? Math.round(sum / n) : 255;
  return `rgb(${g},${g},${g})`;
}

/** What a VIN photo read is doing, for its status line. */
export type VinReadProgress = { stage: "loading" | "reading" | "angle"; pct: number };

/**
 * A copy of the prepared image turned by `deg` degrees. The new corners are filled with the
 * photo's own background (its edge colour): white corners around a grey photo make a big slanted
 * shape that the reader takes for a picture and skips the text inside (seen in testing).
 */
function rotated(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const r = (deg * Math.PI) / 180;
  const w = src.width;
  const h = src.height;
  const W = Math.ceil(Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r)));
  const H = Math.ceil(Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r)));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = edgeColour(src);
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(r);
  ctx.drawImage(src, -w / 2, -h / 2);
  return c;
}

/**
 * The VIN(s) in a photo of the car (windshield plate, door sticker, title), read on the device.
 * A hand-held photo is rarely straight, and a few degrees of tilt is enough to lose the VIN, so
 * when the straight read finds none it tries again at small angles (one reader, so the extra
 * time is only spent when needed). Only check-digit-valid VINs are returned (lib/vin-read).
 */
export async function readVinPhoto(file: File, onProgress: (p: VinReadProgress) => void, find: (text: string) => { strong: string[]; weak: string[] }): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  let stage: VinReadProgress["stage"] = "reading";
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: `${window.location.origin}/ocr/lang`,
    workerBlobURL: false,
    logger: (m) => onProgress({ stage: m.status !== "recognizing text" ? "loading" : stage, pct: Math.round((m.progress ?? 0) * 100) }),
  });
  try {
    const base = await prepare(file);
    // A clean read (the VIN as a word) wins at once; a guess (one stray character dropped) is kept
    // while the other angles are tried, and only used if none of them reads it cleanly.
    const weak: string[] = [];
    const read = async (c: HTMLCanvasElement) => {
      const r = find((await worker.recognize(c)).data.text);
      for (const v of r.weak) if (!weak.includes(v)) weak.push(v);
      return r.strong;
    };
    const straight = await read(base);
    if (straight.length) return straight;
    stage = "angle";
    for (const deg of [-4, 4, -8, 8, -12, 12]) {
      const found = await read(rotated(base, deg));
      if (found.length) return found;
    }
    return weak.slice(0, 3);
  } finally {
    await worker.terminate();
  }
}
