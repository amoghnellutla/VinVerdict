"use client";

import { useEffect, useState } from "react";
import { readDashAction } from "@/app/actions/ai";
import { Turnstile } from "@/components/Turnstile";
import { LIGHTS, dashMiles, type DashRead } from "@/lib/ai/dash-read";
import type { RuleHit } from "@/lib/scam/rules";
import { VIN_PLACE, vinsInText, type VinPlace } from "@/lib/vin-read";
import { normalizeVin } from "@/lib/vin";
import { confirmVin } from "@/lib/confirm-vin";
import { pickImages, readVinPhoto } from "@/lib/ocr";
import { shrink } from "./AiHistoryRead";
import { VinScanner, vinProgress } from "./VinScanner";

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
  /** The ad had no VIN: check this car with the one read off it. */
  onCheckWith?: ((vin: string) => void) | null;
}) {
  const { vins, setVin, vinHits, dash, onDash, dashHits, ai, guest, onCheckWith } = props;
  const [choices, setChoices] = useState<Partial<Record<Place, string[]>>>({});
  const read = [...new Set(Object.values(vins).filter((v): v is string => !!v))];
  const [typed, setTyped] = useState<Partial<Record<Place, string>>>({});
  const [reading, setReading] = useState<Place | null>(null);
  const [note, setNote] = useState<Partial<Record<Place, string>>>({});
  // What NHTSA says each VIN is ("2018 Toyota Camry"), so the person can see it's the right car.
  const [names, setNames] = useState<Record<string, string>>({});
  // A VIN NHTSA couldn't be asked about (no answer): the person decides.
  const [unsure, setUnsure] = useState<Partial<Record<Place, string>>>({});
  const say = (place: Place, text: string) => setNote((n) => ({ ...n, [place]: text }));

  /** Use a VIN only once NHTSA knows it; a misread or made-up one is refused with a reason. */
  async function confirmAndSet(place: Place, vin: string) {
    say(place, `Checking ${vin} with NHTSA…`);
    setUnsure((u) => ({ ...u, [place]: undefined }));
    const c = await confirmVin(vin);
    if (c.status === "ok") {
      const name = c.name;
      setNames((x) => ({ ...x, [vin]: name }));
      setVin(place, vin);
      return say(place, "");
    }
    if (c.status === "busy") return say(place, c.message);
    if (c.status === "unreachable") {
      setUnsure((u) => ({ ...u, [place]: vin }));
      return say(place, `${c.message} Read ${vin}: use it only if it matches the car character by character.`);
    }
    say(place, `${vin} isn't a real VIN (NHTSA doesn't recognise it), so it was misread or mistyped. Try again, or check each character.`);
  }

  async function fromPhoto(place: Place, list: FileList | null) {
    const f = pickImages(list).files[0];
    if (!f) return;
    setReading(place);
    try {
      const found = await readVinPhoto(f, (pr) => setNote((n) => ({ ...n, [place]: vinProgress(pr) })), vinsInText);
      setChoices((c) => ({ ...c, [place]: found.length > 1 ? found : [] }));
      if (found.length === 1) await confirmAndSet(place, found[0]);
      else if (found.length > 1) say(place, `Read ${found.length} VINs in that photo. Which one is on the ${VIN_PLACE[place]}?`);
      else say(place, "No VIN found in that picture. Try again: the VIN should fill most of the frame, straight on, without glare. Or type it.");
    } catch {
      setNote((n) => ({ ...n, [place]: "Couldn't read it on this device: type it instead." }));
    } finally {
      setReading(null);
    }
  }

  function applyTyped(place: Place) {
    const raw = (typed[place] ?? "").trim();
    if (!raw) return say(place, "Type the 17 characters of the VIN first.");
    const v = normalizeVin(raw);
    const ok = vinsInText(v)[0];
    if (ok) return void confirmAndSet(place, ok);
    const compact = v.replace(/[^A-Z0-9]/g, "");
    say(place, compact.length !== 17
      ? `That's ${compact.length} characters; a VIN has exactly 17. Check for a missing or extra character.`
      : "That isn't a valid VIN: its check digit (9th character) doesn't match the rest, so a character is wrong. Check each one (0 and O, 1 and I look alike: VINs never use O, I or Q).");
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
                {vins[place] ? <>Read: <strong>{vins[place]}</strong>{names[vins[place]!] ? <span className="text-muted"> ({names[vins[place]!]})</span> : null} <button type="button" className="link ml-2 text-xs" onClick={() => setVin(place, null)}>Clear</button></> : "Not checked yet"}
              </p>
              {note[place] && <p className="text-sm text-warn" role="status">{note[place]}</p>}
              {(choices[place]?.length ?? 0) > 1 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {choices[place]!.map((v) => (
                    <button key={v} type="button" className="btn btn-secondary nums text-sm" onClick={() => { setChoices((c) => ({ ...c, [place]: [] })); void confirmAndSet(place, v); }}>{v}</button>
                  ))}
                </div>
              )}
              {unsure[place] && (
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary nums text-sm" onClick={() => { setVin(place, unsure[place]!); setUnsure((u) => ({ ...u, [place]: undefined })); say(place, ""); }}>Use {unsure[place]}</button>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VinScanner className="btn btn-secondary text-sm" label="Scan" hint={how} onVin={(v, name) => { if (name) setNames((x) => ({ ...x, [v]: name })); setVin(place, v); say(place, ""); }} />
                <label className={`btn btn-secondary cursor-pointer text-sm ${reading ? "pointer-events-none opacity-60" : ""}`}>
                  {reading === place ? "Reading…" : "Photo"}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void fromPhoto(place, e.target.files); e.target.value = ""; }} />
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
        {onCheckWith && read.length === 1 && (
          <div className="mt-3 rounded-md border border-border px-3 py-2">
            <p className="text-sm">This ad had no VIN. Check this car with the one you read: the exact model, recalls, title checks and the price check.</p>
            <button type="button" className="btn btn-primary mt-2 text-sm" onClick={() => onCheckWith(read[0])}>Check with VIN {read[0]}</button>
          </div>
        )}
        {vinHits.map((h) => (
          <p key={h.id} role={h.id === "proof-vin-mismatch" ? "alert" : "status"} className={`mt-3 rounded-md px-3 py-2 ${h.id === "proof-vin-mismatch" ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
            <strong>{h.title}.</strong> {h.reason}
            {h.id === "proof-vin-mismatch" && <span className="mt-1 block text-sm">First rule out a misread: compare each VIN with the car character by character, and if one was read or typed wrong, Clear it and enter it again.</span>}
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
    if (!r.dash.readable) return setMsg("That doesn't look like a dashboard photo, or it's too dark or blurry to read. Try again: engine running, the whole instrument cluster in the frame, straight on, without glare.");
    // Nothing read at all (no odometer, no lights) isn't "all clear": ask for another photo.
    if (r.dash.odometer === null && !r.dash.lights.length) return setMsg("Couldn't read the odometer or any lights in that photo. Try again closer, with the engine running so the display is lit.");
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
