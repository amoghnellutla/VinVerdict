"use client";

import { useEffect, useState } from "react";
import { readDashAction } from "@/app/actions/ai";
import { Turnstile } from "@/components/Turnstile";
import { LIGHTS, dashMiles, type DashRead } from "@/lib/ai/dash-read";
import type { RuleHit } from "@/lib/scam/rules";
import { VIN_PLACE, vinsInText, type VinPlace } from "@/lib/vin-read";
import { normalizeVin } from "@/lib/vin";
import { pickImages, readEachScreenshot } from "@/lib/ocr";
import { shrink } from "./AiHistoryRead";
import { VinScanner } from "./VinScanner";

type Place = Exclude<VinPlace, "ad">;
const PLACES: { place: Place; how: string }[] = [
  { place: "plate", how: "At the bottom of the windshield, driver's side (look from outside)." },
  { place: "door", how: "The sticker on the driver's door frame (often with a barcode)." },
  { place: "title", how: "On the paper title the seller signs over." },
];

/**
 * "At the car": the checks only possible in person.
 *  - VIN match: the windshield plate, the door sticker and the title, scanned, photographed or
 *    typed, must match each other and the ad (anti-clone). Read on this device.
 *  - Dashboard photo: engine running; the free vision AI reads the odometer and any warning
 *    lights (one AI action; visitors pass the "I'm human" check).
 * Results go into the verdict (Result.tsx).
 */
export function AtTheCar(props: {
  vins: Partial<Record<Place, string | null>>;
  setVin: (place: Place, vin: string | null) => void;
  vinHits: RuleHit[];
  dash: DashRead | null;
  onDash: (d: DashRead | null) => void;
  dashHits: RuleHit[];
  ai: boolean;
  guest: boolean;
}) {
  const { vins, setVin, vinHits, dash, onDash, dashHits, ai, guest } = props;
  const [typed, setTyped] = useState<Partial<Record<Place, string>>>({});
  const [reading, setReading] = useState<Place | null>(null);
  const [note, setNote] = useState<Partial<Record<Place, string>>>({});

  async function fromPhoto(place: Place, list: FileList | null) {
    const f = pickImages(list).files[0];
    if (!f) return;
    setReading(place);
    try {
      const [text] = await readEachScreenshot([f], () => {});
      const found = vinsInText(text ?? "");
      if (found.length) {
        setVin(place, found[0]);
        setNote((n) => ({ ...n, [place]: found.length > 1 ? `Read ${found.length} VINs; using the first. Type it if that's wrong.` : "" }));
      } else setNote((n) => ({ ...n, [place]: "Couldn't read a VIN in that photo: move closer, avoid glare, or type it." }));
    } catch {
      setNote((n) => ({ ...n, [place]: "Couldn't read it on this device: type it instead." }));
    } finally {
      setReading(null);
    }
  }

  function applyTyped(place: Place) {
    const v = normalizeVin(typed[place] ?? "");
    const ok = vinsInText(v)[0];
    if (ok) {
      setVin(place, ok);
      setNote((n) => ({ ...n, [place]: "" }));
    } else setNote((n) => ({ ...n, [place]: "That isn't a valid VIN (17 characters, and its check digit must work). Check each character." }));
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold">VIN match</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          The VIN must be the same on the windshield plate, the door sticker and the title, and match the ad. A different one is the classic sign of a cloned or
          stolen car or a swapped title. Read on this phone; nothing is uploaded.
        </p>
        <ul className="mt-3 space-y-4">
          {PLACES.map(({ place, how }) => (
            <li key={place} className="rounded-lg border border-border p-3">
              <p className="font-semibold">{VIN_PLACE[place][0].toUpperCase() + VIN_PLACE[place].slice(1)}</p>
              <p className="text-sm text-muted">{how}</p>
              <p className="nums mt-1 text-sm" aria-live="polite">
                {vins[place] ? <>Read: <strong>{vins[place]}</strong> <button type="button" className="link ml-2 text-xs" onClick={() => setVin(place, null)}>Clear</button></> : "Not checked yet"}
              </p>
              {note[place] && <p className="text-sm text-warn">{note[place]}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VinScanner className="btn btn-secondary text-sm" label="Scan" hint={how} onVin={(v) => setVin(place, v)} />
                <label className={`btn btn-secondary cursor-pointer text-sm ${reading ? "pointer-events-none opacity-60" : ""}`}>
                  {reading === place ? "Reading…" : "Photo"}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void fromPhoto(place, e.target.files)} />
                </label>
                <span className="flex items-center gap-1">
                  <label className="sr-only" htmlFor={`vin-${place}`}>Type the VIN from the {VIN_PLACE[place]}</label>
                  <input id={`vin-${place}`} className="nums w-[13.5rem] rounded-md border border-border bg-surface px-2 py-1.5 text-sm uppercase placeholder:normal-case" maxLength={20} placeholder="or type it" value={typed[place] ?? ""} onChange={(e) => setTyped((t) => ({ ...t, [place]: e.target.value }))} />
                  <button type="button" className="btn btn-secondary text-sm" onClick={() => applyTyped(place)}>Use</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
        {vinHits.map((h) => (
          <p key={h.id} role={h.id === "proof-vin-mismatch" ? "alert" : "status"} className={`mt-3 rounded-md px-3 py-2 ${h.id === "proof-vin-mismatch" ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
            <strong>{h.title}.</strong> {h.reason}
          </p>
        ))}
      </div>

      <DashCheck dash={dash} onDash={onDash} hits={dashHits} ai={ai} guest={guest} />
    </div>
  );
}

function DashCheck({ dash, onDash, hits, ai, guest }: { dash: DashRead | null; onDash: (d: DashRead | null) => void; hits: RuleHit[]; ai: boolean; guest: boolean }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [by, setBy] = useState<string | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  async function send() {
    if (!photo || busy || (guest && !token)) return;
    setBusy(true);
    setMsg(null);
    const image = await shrink(photo);
    const t = token;
    setToken(null);
    setAttempt((n) => n + 1);
    const r = image ? await readDashAction({ image, token: t }).catch(() => null) : null;
    setBusy(false);
    if (!r) return setMsg(image ? "Couldn't reach VinVerdict. Try again." : "That photo couldn't be prepared: try another.");
    if (r.status === "error") return setMsg(r.message);
    if (!r.dash.readable) return setMsg("The photo was too dark or blurry to read: take it again with the engine running, straight on, without glare.");
    setBy(r.provider);
    onDash(r.dash);
  }

  return (
    <div>
      <h3 className="font-semibold">Dashboard photo</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Start the car and photograph the dashboard straight on. The free AI reads the odometer (compared with the ad and earlier readings) and any warning lights
        that stay on. {guest ? "Uses one of your 5 free AI actions today. " : ""}The photo is sent to the AI and not kept by VinVerdict.
      </p>
      {!ai ? (
        <p className="mt-2 text-sm text-muted">The free AI isn&apos;t switched on here, so the photo can&apos;t be read. Check the lights yourself: start it cold, and every light should go out within a few seconds.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="btn btn-secondary cursor-pointer text-sm">
            {photo ? "Take another" : "Take or pick the photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => {
              const f = pickImages(e.target.files).files[0];
              if (f) { setPhoto(URL.createObjectURL(f)); onDash(null); setMsg(null); }
            }} />
          </label>
          {photo && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob: URL), never a remote image */}
              <img src={photo} alt="Your dashboard photo" className="max-h-56 rounded-md border border-border" />
              {guest && <Turnstile key={attempt} action="ai" onToken={setToken} />}
              <button type="button" className="btn btn-primary" disabled={busy || (guest && !token)} onClick={() => void send()}>
                {busy ? "Reading the dashboard…" : "Read the dashboard"}
              </button>
            </>
          )}
          {msg && <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{msg}</p>}
          {dash && (
            <div className="rounded-lg border border-border p-3" role="status">
              <p>
                Odometer: <strong className="nums">{dashMiles(dash) !== null ? `${dashMiles(dash)!.toLocaleString("en-US")} miles${dash.unit === "km" ? ` (${dash.odometer!.toLocaleString("en-US")} km)` : ""}` : "couldn't read it"}</strong>
              </p>
              <p className="mt-1">Warning lights seen: {dash.lights.length ? dash.lights.map((k) => LIGHTS[k].name).join(", ") : "none"}</p>
              {hits.filter((h) => h.id !== "proof-dash-clear").map((h) => (
                <p key={h.id} className="mt-2 text-sm"><strong>{h.title}.</strong> {h.reason}</p>
              ))}
              {by && <p className="mt-2 text-xs text-muted">Read by {by}. Confirm everything on the car itself.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
