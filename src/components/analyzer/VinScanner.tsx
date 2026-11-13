"use client";

import { useEffect, useId, useRef, useState } from "react";
import { pickImages, readEachScreenshot } from "@/lib/ocr";
import { barcodeVin, vinsInText } from "@/lib/vin-read";

/**
 * "Scan the VIN": the phone's rear camera reads the VIN off the car, on the device.
 *  - Where the browser has a barcode reader (Chrome on Android), the door sticker's VIN barcode
 *    is read live: point and it's done.
 *  - Everywhere (iPhone Safari too): "Read it from the camera" grabs the frame, or "Use a photo"
 *    picks one; the text is read on the device (lib/ocr) and the VIN found in it (lib/vin-read).
 * Only a VIN whose check digit works is accepted, so a misread never starts a check.
 * Nothing leaves the device; the camera stops as soon as the panel closes.
 */

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
const WANT = ["code_39", "code_128", "data_matrix", "qr_code", "pdf417"];

export function VinScanner({ onVin, label = "Scan the VIN", hint = "Point at the barcode on the driver's door sticker, or the VIN plate at the bottom of the windshield.", className = "btn btn-secondary" }: {
  onVin: (vin: string) => void;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const live = useRef(false);

  function stop() {
    live.current = false;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => stop, []);

  function done(vin: string) {
    stop();
    setOpen(false);
    setStatus(null);
    setFound([]);
    onVin(vin);
  }

  async function start() {
    setOpen(true);
    setFound([]);
    setStatus("Starting the camera…");
    if (!navigator.mediaDevices?.getUserMedia) return setStatus("This browser can't use the camera here: use a photo instead.");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch {
      return setStatus("No camera access. Allow it in the browser, or use a photo instead.");
    }
    const v = video.current;
    if (!v) return stop();
    v.srcObject = stream.current;
    await v.play().catch(() => {});
    live.current = true;
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor) return setStatus("Hold it steady on the VIN, then press \"Read it\".");
    const supported = (await Ctor.getSupportedFormats?.().catch(() => [] as string[])) ?? [];
    const formats = WANT.filter((f) => !supported.length || supported.includes(f));
    const detector = new Ctor({ formats });
    setStatus("Looking for the VIN barcode… (or press \"Read it\" for the printed VIN)");
    timer.current = window.setInterval(async () => {
      if (!live.current || !video.current || video.current.readyState < 2) return;
      try {
        for (const b of await detector.detect(video.current)) {
          const vin = barcodeVin(b.rawValue);
          if (vin) return done(vin);
        }
      } catch {
        // A frame that can't be read: try the next one.
      }
    }, 300);
  }

  async function readText(file: File) {
    setStatus("Reading the VIN on this device…");
    try {
      const [text] = await readEachScreenshot([file], () => {});
      const vins = vinsInText(text ?? "");
      if (vins.length === 1) return done(vins[0]);
      if (vins.length > 1) {
        setFound(vins);
        return setStatus("Found more than one VIN. Which is on this car?");
      }
      setStatus("Couldn't read a VIN. Move closer so the VIN fills the frame, avoid glare, or type it in.");
    } catch {
      setStatus("Couldn't read that on this device. Type the VIN in instead.");
    }
  }

  async function readFrame() {
    const v = video.current;
    if (!v || v.readyState < 2) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (blob) await readText(new File([blob], "vin.png", { type: "image/png" }));
  }

  async function readPhoto(list: FileList | null) {
    const f = pickImages(list).files[0];
    if (f) await readText(f);
  }

  return (
    <div>
      {!open ? (
        <button type="button" className={className} onClick={start}>{label}</button>
      ) : (
        <div className="space-y-2 rounded-lg border border-border p-3" role="group" aria-labelledby={`${id}-t`}>
          <p id={`${id}-t`} className="font-semibold">{label}</p>
          <p className="text-sm text-muted">{hint}</p>
          <video ref={video} className="aspect-[4/3] w-full rounded-md bg-surface-muted object-cover" playsInline muted aria-label="Camera view" />
          {status && <p className="text-sm" role="status">{status}</p>}
          {found.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {found.map((v) => <button key={v} type="button" className="btn btn-secondary nums text-sm" onClick={() => done(v)}>{v}</button>)}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-sm" onClick={readFrame}>Read it</button>
            <label className="btn btn-secondary cursor-pointer text-sm">
              Use a photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void readPhoto(e.target.files)} />
            </label>
            <button type="button" className="btn btn-secondary text-sm" onClick={() => { stop(); setOpen(false); setStatus(null); setFound([]); }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
