"use client";

import { useEffect, useId, useRef, useState } from "react";
import { pickImages, readVinPhoto, type VinReadProgress } from "@/lib/ocr";
import { confirmVin } from "@/lib/confirm-vin";
import { barcodeVin, vinsInText } from "@/lib/vin-read";

/**
 * "Scan the VIN": the phone's rear camera reads the VIN off the car, on the device.
 *  - Where the browser has a barcode reader (Chrome on Android), the door sticker's VIN barcode
 *    is read live: point and it's done.
 *  - Everywhere (iPhone Safari too): "Read it from the camera" grabs the frame, or "Use a photo"
 *    picks one; the text is read on the device (lib/ocr) and the VIN found in it (lib/vin-read).
 * A VIN must pass its own checks (lib/vin-read: check digit, year code, serial digits) and then
 * NHTSA's decoder must know it (lib/confirm-vin) before anything uses it: a misread of a random
 * object is told "that isn't a real VIN, try again", never checked. The photo is read on the
 * device; only the VIN goes to NHTSA. The camera stops as soon as the panel closes.
 */

/** The status line while a VIN photo is read. */
export function vinProgress(p: VinReadProgress): string {
  return p.stage === "loading" ? "Getting the reader ready (the first time it downloads about 7 MB)…"
    : p.stage === "angle" ? "Not found straight on: trying again at a slight angle…"
      : `Reading the VIN on this device… ${p.pct}%`;
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
const WANT = ["code_39", "code_128", "data_matrix", "qr_code", "pdf417"];
/** Only one camera at a time: a phone can't run two, so opening a scanner closes any other. */
const OPEN_EVENT = "vinverdict:scanner-open";

export function VinScanner({ onVin, label = "Scan the VIN", hint = "Point at the barcode on the driver's door sticker, or the VIN plate at the bottom of the windshield.", className = "btn btn-secondary" }: {
  /** A VIN NHTSA knows (with its year, make and model), or one the person chose to use when NHTSA couldn't be reached. */
  onVin: (vin: string, name: string | null) => void;
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
  // Shown state of the camera (the ref is for the frame loop; this re-renders the buttons).
  const [camOn, setCamOn] = useState(false);
  const [starting, setStarting] = useState(false);
  // A VIN NHTSA couldn't confirm (no answer): the person decides.
  const [unsure, setUnsure] = useState<string | null>(null);
  const checking = useRef(false);
  const rejected = useRef(new Set<string>());

  function stop() {
    live.current = false;
    setCamOn(false);
    setStarting(false);
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  // Another scanner opened: close this one (and free the camera).
  useEffect(() => {
    const other = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) return;
      stop();
      setOpen(false);
      setStatus(null);
      setFound([]);
    };
    // The page went to the background (the phone's camera app, another tab): free the camera.
    const hidden = () => {
      if (document.visibilityState === "hidden" && live.current) {
        stop();
        setStatus("The camera stopped while the page was in the background. Press \"Start the camera\" to use it again.");
      }
    };
    window.addEventListener(OPEN_EVENT, other);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener(OPEN_EVENT, other);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [id]);

  useEffect(() => stop, []);

  function done(vin: string, name: string | null) {
    stop();
    setOpen(false);
    setStatus(null);
    setFound([]);
    setUnsure(null);
    rejected.current.clear();
    onVin(vin, name);
  }

  /** Confirm a VIN with NHTSA before using it; a misread is told so and the scan goes on. */
  async function accept(vin: string) {
    if (checking.current) return;
    checking.current = true;
    setFound([]);
    setUnsure(null);
    setStatus(`Read ${vin}. Checking it with NHTSA…`);
    const c = await confirmVin(vin);
    checking.current = false;
    if (c.status === "ok") return done(vin, c.name);
    if (c.status === "busy") return setStatus(c.message);
    if (c.status === "unreachable") {
      setUnsure(vin);
      return setStatus(`${c.message} The camera read ${vin}: use it only if it matches the VIN on the car.`);
    }
    rejected.current.add(vin);
    setStatus(`${vin} isn't a real VIN (NHTSA doesn't recognise it), so it was misread. Try again: closer, straight on, no glare. Or type it.`);
  }

  async function start() {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    stop();
    setOpen(true);
    setFound([]);
    setStarting(true);
    setStatus("Starting the camera…");
    if (!navigator.mediaDevices?.getUserMedia) {
      setStarting(false);
      return setStatus("This browser can't use the camera here: use a photo instead.");
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch (e) {
      setStarting(false);
      const name = e instanceof Error ? e.name : "";
      return setStatus(
        name === "NotAllowedError" ? "No camera access. Allow the camera for this site in the browser's settings, or use a photo instead."
          : name === "NotReadableError" ? "The camera is in use by another app. Close it and press \"Start the camera\", or use a photo instead."
            : name === "NotFoundError" || name === "OverconstrainedError" ? "No camera found on this device: use a photo instead."
              : "Couldn't start the camera: use a photo instead.",
      );
    }
    const v = video.current;
    if (!v) return stop();
    v.srcObject = stream.current;
    await v.play().catch(() => {});
    live.current = true;
    setCamOn(true);
    setStarting(false);
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor) return setStatus("Hold it steady on the VIN, then press \"Read it\".");
    const supported = (await Ctor.getSupportedFormats?.().catch(() => [] as string[])) ?? [];
    const formats = WANT.filter((f) => !supported.length || supported.includes(f));
    const detector = new Ctor({ formats });
    setStatus("Looking for the VIN barcode… (or press \"Read it\" for the printed VIN)");
    timer.current = window.setInterval(async () => {
      if (!live.current || checking.current || !video.current || video.current.readyState < 2) return;
      try {
        const codes = await detector.detect(video.current);
        let seenRejected = false;
        for (const b of codes) {
          const vin = barcodeVin(b.rawValue);
          if (vin && !rejected.current.has(vin)) return void accept(vin);
          if (vin) seenRejected = true;
        }
        // The same made-up VIN still in view keeps its "isn't a real VIN" message on screen.
        if (codes.length && !seenRejected) setStatus("That barcode isn't a VIN. Point at the VIN barcode on the driver's door sticker.");
      } catch {
        // A frame that can't be read: try the next one.
      }
    }, 300);
  }

  async function readText(file: File) {
    setStatus("Reading the VIN on this device…");
    try {
      const vins = await readVinPhoto(file, (p) => setStatus(vinProgress(p)), vinsInText);
      if (vins.length === 1) return void accept(vins[0]);
      if (vins.length > 1) {
        setFound(vins);
        return setStatus("Found more than one VIN. Which is on this car?");
      }
      setStatus("No VIN found in that picture. Try again: the VIN should fill most of the frame, straight on, without glare. Or type it.");
    } catch {
      setStatus("Couldn't read that on this device. Type the VIN in instead.");
    }
  }

  async function readFrame() {
    const v = video.current;
    if (!live.current || !v || v.readyState < 2 || !v.videoWidth) {
      return setStatus(live.current ? "The camera is still starting: wait a second, then press \"Read it\" again." : "The camera isn't on: press \"Start the camera\", or use a photo.");
    }
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
              {found.map((v) => <button key={v} type="button" className="btn btn-secondary nums text-sm" onClick={() => void accept(v)}>{v}</button>)}
            </div>
          )}
          {unsure && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary nums text-sm" onClick={() => done(unsure, null)}>Use {unsure}</button>
              <button type="button" className="btn btn-secondary text-sm" onClick={() => { setUnsure(null); setStatus(camOn ? "Hold it steady on the VIN, then press \"Read it\"." : null); }}>Try again</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {camOn || starting ? (
              <button type="button" className="btn btn-primary text-sm" onClick={readFrame}>Read it</button>
            ) : (
              <button type="button" className="btn btn-primary text-sm" onClick={start}>Start the camera</button>
            )}
            {/* The live camera is freed first: the phone's camera app can't open while this page holds it. */}
            <label className="btn btn-secondary cursor-pointer text-sm" onClick={() => stop()}>
              Use a photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void readPhoto(e.target.files); e.target.value = ""; }} />
            </label>
            <button type="button" className="btn btn-secondary text-sm" onClick={() => { stop(); setOpen(false); setStatus(null); setFound([]); }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
