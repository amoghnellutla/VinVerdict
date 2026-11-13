import { decodeVinAction } from "@/app/actions/decode";
import { makeName } from "@/lib/format";

/**
 * Is a VIN read off the car (or typed) a real one? NHTSA's free decoder must know its make and
 * year, and its model or decode it cleanly. "invalid": NHTSA doesn't recognise it, so it's a misread or made up: say so, don't use it.
 * "unreachable": NHTSA didn't answer, so the person decides (the VIN still passed its own checks).
 * "busy": too many lookups this minute: try again in a minute.
 */
export type Confirmed = { status: "ok"; name: string } | { status: "invalid" } | { status: "unreachable"; message: string } | { status: "busy"; message: string };

export async function confirmVin(vin: string): Promise<Confirmed> {
  const r = await decodeVinAction(vin).catch(() => null);
  if (!r) return { status: "unreachable", message: "Couldn't reach NHTSA to confirm it." };
  // Too many lookups this minute: wait (never "use it anyway": an unconfirmed VIN could be a misread).
  if (!r.ok && /too many/i.test(r.message)) return { status: "busy", message: "Too many VIN lookups in a minute. Wait a minute, then try again." };
  if (!r.ok) return /didn't answer/i.test(r.message) ? { status: "unreachable", message: r.message } : { status: "invalid" };
  const d = r.decoded;
  // A made-up VIN that happens to start with a real maker's code still gets a make and year back,
  // but no model and no clean decode (seen: "3AB…" → a bus maker, error 8). A real car gets both.
  if (!d.make || !d.year || (!d.model && !d.clean)) return { status: "invalid" };
  return { status: "ok", name: [d.year, makeName(d.make), d.model].filter(Boolean).join(" ") };
}

/**
 * Several VINs read from one photo (or candidates from a misread): ask NHTSA about each (at most 3)
 * and keep the real ones. One real: use it. Several real: the person picks. None real: invalid.
 * If NHTSA can't be reached for any of them, the person picks from all of them.
 */
export async function resolveVins(vins: string[]): Promise<{ real: { vin: string; name: string }[]; unsure: boolean; busy: string | null }> {
  const real: { vin: string; name: string }[] = [];
  let unsure = false;
  for (const v of vins.slice(0, 3)) {
    const c = await confirmVin(v);
    if (c.status === "ok") real.push({ vin: v, name: c.name });
    else if (c.status === "busy") return { real, unsure, busy: c.message };
    else if (c.status === "unreachable") unsure = true;
  }
  return { real, unsure, busy: null };
}
