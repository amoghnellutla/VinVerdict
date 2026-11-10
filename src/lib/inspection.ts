/**
 * Inspection checklist (PLAN.md feature F): what to ask your mechanic to look
 * at, built from three parts:
 *   1. Known issues: a short, hand-checked list of manufacturer warranty
 *      programs and service bulletins (each links to the official document).
 *   2. The car's most common NHTSA complaint areas, turned into concrete checks.
 *   3. Checks every used car needs.
 * Pure, so it is unit-tested and runs in the browser.
 */

export type KnownIssue = {
  id: string;
  make: string;
  /** NHTSA model name (case-insensitive exact match) → model years affected. */
  fits: Record<string, [number, number]>;
  /** Engine size the issue belongs to; skipped when the VIN shows a different one. */
  displacementL?: number;
  title: string;
  check: string;
  source: { label: string; url: string };
};

export const KNOWN_ISSUES: KnownIssue[] = [
  {
    id: "toyota-2az-oil",
    make: "toyota",
    fits: { camry: [2007, 2009], "camry solara": [2007, 2008], solara: [2007, 2008], corolla: [2009, 2011], "corolla matrix": [2009, 2013], matrix: [2009, 2013], rav4: [2006, 2008] },
    displacementL: 2.4,
    title: "Oil burning (2.4 L 2AZ engine)",
    check:
      "Check the dipstick: it should read full. Ask how often they add oil between changes. Toyota ran a warranty program (ZE7) for excess oil use on this engine.",
    source: { label: "Toyota warranty program ZE7", url: "https://static.nhtsa.gov/odi/tsbs/2015/MC-10134468-9999.pdf" },
  },
  {
    id: "toyota-tacoma-frame",
    make: "toyota",
    fits: { tacoma: [2005, 2010] },
    title: "Frame rust",
    check: "Have the frame checked for rust holes, especially in salt states. Ask whether Toyota already replaced the frame.",
    source: { label: "Toyota warranty program ZH6", url: "https://static.nhtsa.gov/odi/tsbs/2017/MC-10119399-9999.pdf" },
  },
  {
    id: "honda-15t-oil-dilution",
    make: "honda",
    fits: { civic: [2016, 2018], "cr-v": [2017, 2018] },
    displacementL: 1.5,
    title: "Fuel in the oil (1.5 L turbo)",
    check:
      "Smell the dipstick for gasoline and check the level isn't above full. Ask for proof Honda's software update was done.",
    source: { label: "Consumer Reports: Honda extends warranty", url: "https://www.consumerreports.org/car-recalls-defects/honda-extends-warranty-on-troubled-turbo-engines" },
  },
  {
    id: "honda-vtc-rattle",
    make: "honda",
    fits: { accord: [2008, 2009] },
    displacementL: 2.4,
    title: "Rattle at cold start (VTC actuator)",
    check:
      "Ask the seller not to start the car before you arrive. A loud rattle for about 2 seconds at a cold start means a worn VTC actuator. (The bulletin covers every 2008 4-cylinder Accord but only early-built 2009s.)",
    source: { label: "Honda service bulletin 09-010", url: "https://static.nhtsa.gov/odi/tsbs/2012/SB-10041669-7570.pdf" },
  },
  {
    id: "honda-cvt-p1890",
    make: "honda",
    fits: { accord: [2015, 2016], "cr-v": [2015, 2016] },
    displacementL: 2.4,
    title: "CVT slipping at highway speed (code P1890)",
    check:
      "On the highway, watch for the RPM surging. Ask for proof Honda's CVT software update (campaign 16-053) was done; it's free, and a Honda dealer can check the VIN.",
    source: { label: "Honda service bulletin 16-053", url: "https://static.nhtsa.gov/odi/tsbs/2016/SB-10086143-2280.pdf" },
  },
];

export type CarForChecklist = {
  year: number | null;
  make: string | null;
  model: string | null;
  displacementL: number | null;
  /** True when the VIN decode says CVT. */
  cvt: boolean;
  /** NHTSA complaint areas, most common first. */
  complaintAreas: string[];
};

export type ChecklistItem = { title: string; check: string; source?: { label: string; url: string } };
export type Checklist = { known: ChecklistItem[]; fromComplaints: ChecklistItem[]; general: ChecklistItem[] };

const lc = (s: string | null) => (s ?? "").trim().toLowerCase();

export function knownIssuesFor(car: CarForChecklist): KnownIssue[] {
  const make = lc(car.make);
  const model = lc(car.model);
  if (!make || !model || !car.year) return [];
  const year = car.year;
  return KNOWN_ISSUES.filter(
    (k) =>
      k.make === make &&
      Object.hasOwn(k.fits, model) &&
      year >= k.fits[model][0] &&
      year <= k.fits[model][1] &&
      // Unknown engine: keep it (better to check than to miss). Known and different: skip.
      (k.displacementL == null || car.displacementL == null || Math.abs(car.displacementL - k.displacementL) < 0.15),
  );
}

/** NHTSA complaint area → what the mechanic should check. First match wins. */
const AREA_CHECKS: [RegExp, string][] = [
  [/power ?train|transmission/, "Smooth shifts, no slipping, shudder or delayed engagement; scan for transmission codes."],
  [/engine/, "Cold start, idle, leaks, smoke, warning lights; scan for stored codes."],
  [/fuel/, "Smell for fuel, check for leaks, hesitation or stalling on the test drive."],
  [/electrical/, "Battery and charging, every light, window, lock, screen and warning lamp."],
  [/brake/, "Pad and rotor wear, pedal feel, pulling or noise; ABS light stays off."],
  [/steering/, "Play, noise, pulling, power-assist working at low speed."],
  [/suspension|wheel/, "Clunks over bumps, worn bushings, bent wheels, uneven tire wear."],
  [/air ?bag/, "The airbag light goes off after start-up; check for open airbag recalls."],
  [/structure|body/, "Rust, uneven panel gaps or repaint that hints at accident repair."],
  [/collision|lane|back ?over|speed control|stability/, "No warning messages, sensors and camera clean and working."],
  [/visibility|wiper|light/, "All lights, wipers and windows work; no fogged or cracked lenses."],
  [/seat|belt|latch|lock/, "Every belt latches and retracts, doors and hood latch properly."],
  [/tire/, "Tread depth, even wear, and the date code (replace if over about 6 years old)."],
];

export function complaintChecks(areas: string[], max = 4): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const seen = new Set<string>();
  for (const area of areas) {
    const hit = AREA_CHECKS.find(([re]) => re.test(area.toLowerCase()));
    if (!hit || seen.has(hit[1])) continue;
    seen.add(hit[1]);
    out.push({ title: area.charAt(0) + area.slice(1).toLowerCase(), check: hit[1] });
    if (out.length >= max) break;
  }
  return out;
}

const GENERAL: ChecklistItem[] = [
  { title: "Cold start", check: "See the car started cold (hood cool). Listen for rattles, look for smoke." },
  { title: "Code scan", check: "Plug in an OBD-II scanner: stored or recently cleared codes are a red flag." },
  { title: "Test drive", check: "City and highway: straight braking, no vibration, smooth shifts, A/C and heat work." },
  { title: "Underneath", check: "Leaks, rust on the frame and brake lines, damaged exhaust." },
  { title: "VIN match", check: "The VIN on the dashboard, door-jamb sticker and title all match." },
  { title: "Records", check: "Service records: oil changes on time, and timing-belt or transmission service if due." },
];

const CVT_CHECK: ChecklistItem = {
  title: "CVT transmission",
  check: "Ask for CVT fluid-change records. On the test drive, feel for shudder when pulling away gently.",
};

export function buildChecklist(car: CarForChecklist): Checklist {
  return {
    known: knownIssuesFor(car).map(({ title, check, source }) => ({ title, check, source })),
    fromComplaints: complaintChecks(car.complaintAreas),
    general: car.cvt ? [...GENERAL, CVT_CHECK] : GENERAL,
  };
}

/** Plain text for copying to a mechanic. */
export function checklistText(carName: string, c: Checklist): string {
  const sec = (h: string, items: ChecklistItem[]) => (items.length ? [`${h}:`, ...items.map((i) => `- ${i.title}: ${i.check}`), ""] : []);
  return [
    `Pre-purchase inspection: ${carName}`,
    "",
    ...sec("Known issues for this model", c.known),
    ...sec("Most common owner complaints (NHTSA)", c.fromComplaints),
    ...sec("Every used car", c.general),
  ]
    .join("\n")
    .trim();
}
