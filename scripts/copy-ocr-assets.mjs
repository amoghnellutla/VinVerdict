// Copies the on-device OCR engine (tesseract.js) into public/ocr so the
// browser loads it from this site, never a CDN (keeps the CSP 'self').
// Runs before `npm run dev` and `npm run build`. public/ocr is gitignored.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "public/ocr/worker.min.js"],
  // LSTM-only builds (all the app uses); the worker picks one by CPU support.
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "public/ocr/core/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "public/ocr/core/tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "public/ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "public/ocr/lang/eng.traineddata.gz"],
  // The PDF reader for the dealer's numbers (pdfjs-dist, on the device). Its worker and image decoders only:
  // not quickjs-eval, which runs a PDF's own JavaScript (VinVerdict never runs it).
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/ocr/pdf/pdf.worker.min.mjs"],
  ["node_modules/pdfjs-dist/wasm/openjpeg.wasm", "public/ocr/pdf/wasm/openjpeg.wasm"],
  ["node_modules/pdfjs-dist/wasm/jbig2.wasm", "public/ocr/pdf/wasm/jbig2.wasm"],
  ["node_modules/pdfjs-dist/wasm/qcms_bg.wasm", "public/ocr/pdf/wasm/qcms_bg.wasm"],
];

for (const [from, to] of files) {
  const src = join(root, from);
  const dest = join(root, to);
  if (!existsSync(src)) {
    console.error(`copy-ocr-assets: missing ${from}. Run npm install.`);
    process.exit(1);
  }
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) continue;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
console.log("copy-ocr-assets: public/ocr ready");
