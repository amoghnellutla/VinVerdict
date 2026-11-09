/**
 * Car sales tax by state (PLAN.md feature A, extended to all 50 states + DC).
 *
 * Car tax follows where you REGISTER the car, not where it's listed, and many
 * states use a car-specific tax instead of their general sales tax. State rates
 * come from the Florida Dept. of Revenue's official 50-state chart (TIP
 * 26A01-01, as of 2026-02-11); special rules were checked on each state's own
 * site (links below) on 2026-11-08. Re-check yearly.
 *
 * City/county tax is NOT looked up: where it applies, the page asks for your
 * local rate. Pure functions, so the page recalculates as you type.
 */

import type { StateCode } from "@/lib/geo/zip";

export const STATE_TAX_AS_OF = "2026-11-08";
export const FL_CHART = "https://floridarevenue.com/taxes/tips/Documents/TIP_26A01-01.pdf";

export type Seller = "dealer" | "private";

export type TaxInput = {
  /** Price + any dealer doc fee (taxable in most states). */
  taxable: number;
  /** Price alone, for taxes on the car's value (GA). */
  price: number;
  seller: Seller;
  modelYear: number | null;
  /** City/county rate the buyer typed, in percent (e.g. 1.5). */
  localPct: number;
  now: Date;
};

export type TaxLine = { label: string; amount: number; note?: string };
export type TaxResult = { lines: TaxLine[]; notes: string[] };

export type StateTaxRule = {
  /** One line for the page, e.g. "6.25% sales tax". */
  summary: string;
  /** Shown when a city/county (or, for DC, the main) rate must be typed in. */
  local?: { label: string; hint: string };
  compute: (i: TaxInput) => TaxResult;
  /** Official page for the tax. */
  source: string;
  /** Official DMV (or equivalent) site for title and registration fees. */
  dmv: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtPct = (rate: number) => `${+(rate * 100).toFixed(3)}%`;
const age = (i: TaxInput) => (i.modelYear == null ? null : i.now.getFullYear() - i.modelYear);

const LOCAL = { label: "City/county tax (%)", hint: "Your local car tax rate, if any. Check with your county." };

/** A flat state rate, plus an optional local rate on the same base. */
function flat(
  label: string,
  rate: number,
  opts: { local?: boolean; localCap?: number; localLabel?: string; min?: number; max?: number; privateExempt?: string; base?: "taxable" | "price"; notes?: string[] } = {},
) {
  return (i: TaxInput): TaxResult => {
    const notes = [...(opts.notes ?? [])];
    if (opts.privateExempt && i.seller === "private") {
      return { lines: [{ label, amount: 0, note: opts.privateExempt }], notes };
    }
    const base = opts.base === "price" ? i.price : i.taxable;
    let amount = base * rate;
    if (opts.min != null) amount = Math.max(amount, opts.min);
    if (opts.max != null) amount = Math.min(amount, opts.max);
    const lines: TaxLine[] = [{ label: `${label} (${fmtPct(rate)})`, amount: r2(amount) }];
    if (opts.local) lines.push(...localLine(i, opts.localCap, opts.localLabel));
    return { lines, notes };
  };
}

function localLine(i: TaxInput, cap?: number, label = "City/county tax"): TaxLine[] {
  if (!(i.localPct > 0)) return [];
  const base = cap != null ? Math.min(i.taxable, cap) : i.taxable;
  return [
    {
      label: `${label} (${+i.localPct.toFixed(3)}%)`,
      amount: r2((base * i.localPct) / 100),
      note: cap != null ? `On the first $${cap.toLocaleString("en-US")} only` : undefined,
    },
  ];
}

const none = (why: string) => (): TaxResult => ({ lines: [], notes: [why] });

const BOOK_VALUE = "The state may tax the car's book value instead, if that's higher than the price.";

export const STATE_TAX: Record<StateCode, StateTaxRule> = {
  AL: { summary: "2% state + local", local: LOCAL, compute: flat("AL sales tax", 0.02, { local: true }), source: "https://www.revenue.alabama.gov/", dmv: "https://www.revenue.alabama.gov/motor-vehicle/" },
  AK: { summary: "No state sales tax", local: LOCAL, compute: (i) => ({ lines: localLine(i), notes: ["Alaska has no state sales tax; some boroughs and cities do."] }), source: "https://dor.alaska.gov/", dmv: "https://dmv.alaska.gov/" },
  AZ: {
    summary: "5.6% + local (dealer sales)",
    local: LOCAL,
    compute: flat("AZ sales tax", 0.056, { local: true, privateExempt: "Private-party sales aren't taxed in Arizona" }),
    source: "https://azdor.gov/business/transaction-privilege-tax/motor-vehicle-sales",
    dmv: "https://azdot.gov/mvd",
  },
  AR: {
    summary: "6.5% (less on used cars under $10,000) + local",
    local: LOCAL,
    compute: (i) => {
      const rate = i.taxable < 4000 ? 0 : i.taxable < 10000 ? 0.035 : 0.065;
      const note = rate === 0 ? "Used cars under $4,000: no state tax" : rate === 0.035 ? "Used cars $4,000–$9,999: reduced state rate" : undefined;
      return { lines: [{ label: `AR sales tax (${fmtPct(rate)})`, amount: r2(i.taxable * rate), note }, ...localLine(i)], notes: [] };
    },
    source: "https://www.dfa.arkansas.gov/",
    dmv: "https://www.dfa.arkansas.gov/office/motor-vehicle/",
  },
  CA: { summary: "7.25% + district tax", local: { label: "District tax (%)", hint: "Extra district tax for your address, if any (CDTFA rate lookup)." }, compute: flat("CA sales/use tax", 0.0725, { local: true, localLabel: "District tax" }), source: "https://www.cdtfa.ca.gov/", dmv: "https://www.dmv.ca.gov/" },
  CO: { summary: "2.9% + local", local: LOCAL, compute: flat("CO sales tax", 0.029, { local: true }), source: "https://cdor.colorado.gov/", dmv: "https://dmv.colorado.gov/" },
  CT: {
    summary: "6.35% (7.75% over $50,000)",
    compute: (i) => {
      const rate = i.taxable > 50000 ? 0.0775 : 0.0635;
      return { lines: [{ label: `CT sales tax (${fmtPct(rate)})`, amount: r2(i.taxable * rate) }], notes: [] };
    },
    source: "https://portal.ct.gov/drs",
    dmv: "https://portal.ct.gov/dmv",
  },
  DE: { summary: "5.25% document fee (no sales tax)", compute: flat("DE document fee", 0.0525, { notes: ["Charged on the price or the NADA trade-in value, whichever is higher. 5.25% since 2025-10-01."] }), source: "https://dmv.de.gov/", dmv: "https://dmv.de.gov/" },
  DC: {
    summary: "Excise tax, 1–11% of value by weight and MPG",
    local: { label: "DC excise rate (%)", hint: "1% to 11% by curb weight and city MPG: see the DC DMV grid." },
    compute: (i) => ({
      lines: i.localPct > 0 ? [{ label: `DC excise tax (${+i.localPct.toFixed(3)}%)`, amount: r2((i.taxable * i.localPct) / 100) }] : [],
      notes: ["DC charges excise tax on the car's book value, at a rate set by its weight and fuel economy. Enter the rate from the DMV grid."],
    }),
    source: "https://dmv.dc.gov/book/vehicle-fees/vehicle-title",
    dmv: "https://dmv.dc.gov/",
  },
  FL: { summary: "6% + county surtax on the first $5,000", local: { label: "County surtax (%)", hint: "Your county's discretionary surtax (Form DR-15DSS)." }, compute: flat("FL sales tax", 0.06, { local: true, localCap: 5000, localLabel: "County surtax" }), source: "https://floridarevenue.com/", dmv: "https://www.flhsmv.gov/" },
  GA: {
    summary: "7% title ad valorem tax (TAVT) on the car's value",
    compute: flat("GA title ad valorem tax", 0.07, { base: "price", notes: ["Georgia taxes its own fair-market value for the car, not the price you pay. The price is used as an estimate: check the DOR's TAVT calculator."] }),
    source: "https://dor.georgia.gov/motor-vehicles/vehicle-taxes-title-ad-valorem-tax-tavt-and-annual-ad-valorem-tax",
    dmv: "https://dor.georgia.gov/motor-vehicles",
  },
  HI: { summary: "4% GET + county surcharge (dealer sales)", local: { label: "County surcharge (%)", hint: "Your county's GET surcharge, if any." }, compute: flat("HI general excise tax", 0.04, { local: true, localLabel: "County surcharge", privateExempt: "Casual sales by private individuals aren't subject to Hawaii GET" }), source: "https://tax.hawaii.gov/", dmv: "https://hidot.hawaii.gov/" },
  ID: { summary: "6%", compute: flat("ID sales tax", 0.06), source: "https://tax.idaho.gov/", dmv: "https://itd.idaho.gov/dmv/" },
  IL: {
    summary: "6.25% + local (dealer); flat amount by age/price (private)",
    local: LOCAL,
    compute: (i) => {
      if (i.seller === "dealer") return flat("IL sales tax", 0.0625, { local: true })(i);
      // Form RUT-50 (rev. R-04/26): Table A by age if under $15,000, Table B by price otherwise.
      let amount: number;
      if (i.taxable < 15000) {
        const a = Math.max(1, Math.min(11, age(i) ?? 11));
        amount = [465, 365, 290, 240, 190, 165, 155, 140, 125, 115, 100][a - 1];
      } else {
        const b: [number, number][] = [[20000, 850], [25000, 1100], [30000, 1350], [50000, 1600], [100000, 2600], [1_000_000, 5100]];
        amount = b.find(([lim]) => i.taxable < lim)?.[1] ?? 10100;
      }
      return {
        lines: [{ label: "IL private-party use tax (RUT-50)", amount, note: i.taxable < 15000 ? "Set by the car's age" : "Set by the price bracket" }, ...localLine(i)],
        notes: i.modelYear == null && i.taxable < 15000 ? ["Model year unknown: assumed 11+ years old."] : [],
      };
    },
    source: "https://tax.illinois.gov/forms/sales/vehicleusetax/rut-50-instructions.html",
    dmv: "https://www.ilsos.gov/departments/vehicles/home.html",
  },
  IN: { summary: "7%", compute: flat("IN sales tax", 0.07), source: "https://www.in.gov/dor/", dmv: "https://www.in.gov/bmv/" },
  IA: { summary: "5% fee for new registration", compute: flat("IA fee for new registration", 0.05), source: "https://iowadot.gov/mvd", dmv: "https://iowadot.gov/mvd" },
  KS: { summary: "6.5% + local", local: LOCAL, compute: flat("KS sales tax", 0.065, { local: true }), source: "https://www.ksrevenue.gov/", dmv: "https://www.ksrevenue.gov/dovindex.html" },
  KY: { summary: "6% usage tax", compute: flat("KY usage tax", 0.06, { notes: ["Kentucky may use the NADA retail value instead of the price."] }), source: "https://revenue.ky.gov/Property/Motor-Vehicles/Pages/Motor-Vehicle-Usage-Tax.aspx", dmv: "https://drive.ky.gov/" },
  LA: { summary: "5% + local", local: LOCAL, compute: flat("LA sales tax", 0.05, { local: true }), source: "https://revenue.louisiana.gov/", dmv: "https://www.expresslane.org/" },
  ME: { summary: "5.5%", compute: flat("ME sales tax", 0.055), source: "https://www.maine.gov/revenue/", dmv: "https://www.maine.gov/sos/bmv/" },
  MD: {
    summary: "6.5% excise tax",
    compute: (i) => {
      const old = (age(i) ?? 0) >= 7;
      const base = old ? Math.max(i.taxable, 640) : i.taxable;
      return {
        lines: [{ label: "MD excise tax (6.5%)", amount: r2(base * 0.065), note: old && i.taxable < 640 ? "7+ years old: taxed on at least $640" : undefined }],
        notes: ["MVA may tax the book value if the price is $500+ below it."],
      };
    },
    source: "https://mva.maryland.gov/title-registration/fees-payment-options/excise-tax",
    dmv: "https://mva.maryland.gov/",
  },
  MA: { summary: "6.25%", compute: (i) => flat("MA sales/use tax", 0.0625, { notes: i.seller === "private" ? [BOOK_VALUE] : [] })(i), source: "https://www.mass.gov/orgs/massachusetts-department-of-revenue", dmv: "https://www.mass.gov/orgs/massachusetts-registry-of-motor-vehicles" },
  MI: { summary: "6%", compute: (i) => flat("MI sales/use tax", 0.06, { notes: i.seller === "private" ? [BOOK_VALUE] : [] })(i), source: "https://www.michigan.gov/taxes", dmv: "https://www.michigan.gov/sos" },
  MN: {
    summary: "6.875% ($10 for cheap cars 10+ years old)",
    compute: (i) => {
      if ((age(i) ?? 0) >= 10 && i.taxable < 3000) {
        return { lines: [{ label: "MN tax in lieu", amount: 10, note: "10+ model years old and under $3,000" }], notes: [] };
      }
      return flat("MN motor vehicle sales tax", 0.06875)(i);
    },
    source: "https://dps.mn.gov/divisions/dvs/vehicle/vehicle-fees/vehicle-sales-tax",
    dmv: "https://dps.mn.gov/divisions/dvs",
  },
  MS: {
    summary: "5% + local",
    local: LOCAL,
    compute: (i) =>
      i.seller === "private" && (age(i) ?? 0) >= 10
        ? { lines: [{ label: "MS sales tax", amount: 0, note: "Private sale of a car 10+ years old: exempt" }], notes: [] }
        : flat("MS sales tax", 0.05, { local: true })(i),
    source: "https://www.dor.ms.gov/",
    dmv: "https://www.dor.ms.gov/motor-vehicle",
  },
  MO: { summary: "4.225% + local", local: LOCAL, compute: flat("MO sales tax", 0.04225, { local: true }), source: "https://dor.mo.gov/", dmv: "https://dor.mo.gov/motor-vehicle/" },
  MT: { summary: "No sales tax", compute: none("Montana has no sales tax on cars."), source: "https://revenue.mt.gov/", dmv: "https://mvdmt.gov/" },
  NE: { summary: "5.5% + local", local: LOCAL, compute: flat("NE sales tax", 0.055, { local: true }), source: "https://revenue.nebraska.gov/", dmv: "https://dmv.nebraska.gov/" },
  NV: {
    summary: "6.85% + county (dealer sales)",
    local: LOCAL,
    compute: flat("NV sales tax", 0.0685, { local: true, privateExempt: "Nevada doesn't charge sales tax on private-party sales" }),
    source: "https://tax.nv.gov/",
    dmv: "https://dmv.nv.gov/",
  },
  NH: { summary: "No sales tax", compute: none("New Hampshire has no sales tax on cars."), source: "https://www.revenue.nh.gov/", dmv: "https://www.dmv.nh.gov/" },
  NJ: {
    summary: "6.625%",
    compute: (i) => {
      const r = flat("NJ sales tax", 0.06625)(i);
      r.lines[0].note = i.seller === "dealer" ? "Collected by the dealer" : "Private sale: paid at the MVC";
      return r;
    },
    source: "https://www.nj.gov/treasury/taxation/moveqa.shtml",
    dmv: "https://www.nj.gov/mvc/",
  },
  NM: { summary: "4% motor vehicle excise tax", compute: flat("NM excise tax", 0.04), source: "https://www.tax.newmexico.gov/", dmv: "https://www.mvd.newmexico.gov/" },
  NY: { summary: "4% + local (by where you live)", local: LOCAL, compute: flat("NY state sales tax", 0.04, { local: true }), source: "https://dmv.ny.gov/registration/sales-tax-information", dmv: "https://dmv.ny.gov/" },
  NC: { summary: "3% highway use tax", compute: flat("NC highway use tax", 0.03), source: "https://www.ncdor.gov/", dmv: "https://www.ncdot.gov/dmv/" },
  ND: { summary: "5% motor vehicle excise tax", compute: flat("ND excise tax", 0.05), source: "https://www.tax.nd.gov/", dmv: "https://www.dot.nd.gov/" },
  OH: { summary: "5.75% + county", local: LOCAL, compute: flat("OH sales tax", 0.0575, { local: true }), source: "https://tax.ohio.gov/", dmv: "https://bmv.ohio.gov/" },
  OK: {
    summary: "Excise tax ($20 + 3.25%) + 1.25% sales tax",
    compute: (i) => ({
      lines: [
        { label: "OK excise tax", amount: r2(i.taxable <= 1500 ? 20 : 20 + (i.taxable - 1500) * 0.0325), note: "$20 on the first $1,500, then 3.25%" },
        { label: "OK sales tax (1.25%)", amount: r2(i.taxable * 0.0125) },
      ],
      notes: ["Oklahoma's rules for used cars are unclear in public sources: confirm with Service Oklahoma."],
    }),
    source: "https://oklahoma.gov/tax.html",
    dmv: "https://oklahoma.gov/service.html",
  },
  OR: { summary: "No sales tax", compute: none("Oregon has no sales tax on used cars."), source: "https://www.oregon.gov/dor/", dmv: "https://www.oregon.gov/odot/dmv/" },
  PA: { summary: "6% (+1% Allegheny Co., +2% Philadelphia)", local: { label: "Local tax (%)", hint: "1 in Allegheny County, 2 in Philadelphia, 0 elsewhere." }, compute: flat("PA sales tax", 0.06, { local: true, localLabel: "Local tax" }), source: "https://www.pa.gov/agencies/revenue", dmv: "https://www.pa.gov/agencies/dmv" },
  RI: { summary: "7%", compute: flat("RI sales tax", 0.07), source: "https://tax.ri.gov/", dmv: "https://dmv.ri.gov/" },
  SC: { summary: "5%, capped at $500", compute: flat("SC infrastructure maintenance fee", 0.05, { max: 500 }), source: "https://dor.sc.gov/", dmv: "https://www.scdmvonline.com/" },
  SD: { summary: "4% motor vehicle excise tax", compute: flat("SD excise tax", 0.04), source: "https://sdlegislature.gov/Statutes/32-5B-1", dmv: "https://dor.sd.gov/individuals/motor-vehicle/" },
  TN: {
    summary: "7% + local on the first $1,600",
    local: LOCAL,
    compute: (i) => {
      const single = r2(Math.max(0, Math.min(i.taxable, 3200) - 1600) * 0.0275);
      return {
        lines: [
          { label: "TN sales tax (7%)", amount: r2(i.taxable * 0.07) },
          ...(single > 0 ? [{ label: "TN single-article tax (2.75%)", amount: single, note: "On the part between $1,600 and $3,200" }] : []),
          ...localLine(i, 1600),
        ],
        notes: [],
      };
    },
    source: "https://www.tn.gov/revenue/taxes/sales-and-use-tax/single-article-special-tax-rates.html",
    dmv: "https://www.tn.gov/revenue/title-and-registration.html",
  },
  TX: {
    summary: "6.25%",
    compute: (i) =>
      flat("TX motor vehicle sales tax", 0.0625, {
        notes: i.seller === "private" ? ["Private sales: taxed on the price or 80% of the state's standard presumptive value (SPV), whichever is higher."] : [],
      })(i),
    source: "https://comptroller.texas.gov/taxes/motor-vehicle/private-party-spv.php",
    dmv: "https://www.txdmv.gov/",
  },
  UT: { summary: "4.85% + local", local: LOCAL, compute: flat("UT sales tax", 0.0485, { local: true }), source: "https://tax.utah.gov/sales", dmv: "https://dmv.utah.gov/" },
  VT: { summary: "6% purchase and use tax", compute: (i) => flat("VT purchase and use tax", 0.06, { notes: i.seller === "private" ? [BOOK_VALUE] : [] })(i), source: "https://tax.vermont.gov/", dmv: "https://dmv.vermont.gov/" },
  VA: { summary: "4.15%, at least $75", compute: flat("VA sales and use tax", 0.0415, { min: 75 }), source: "https://www.tax.virginia.gov/", dmv: "https://www.dmv.virginia.gov/" },
  WA: {
    summary: "6.5% + 0.5% vehicle tax + local",
    local: LOCAL,
    compute: (i) => {
      const r = flat("WA sales/use tax", 0.065, { local: true })(i);
      r.lines.splice(1, 0, { label: "WA motor vehicle sales/use tax (0.5%)", amount: r2(i.taxable * 0.005), note: "Was 0.3% before 2026" });
      return r;
    },
    source: "https://dor.wa.gov/taxes-rates/other-taxes/motor-vehicle-salesuse-tax",
    dmv: "https://dol.wa.gov/",
  },
  WV: {
    summary: "6% privilege tax",
    compute: (i) =>
      i.taxable < 500
        ? { lines: [{ label: "WV privilege tax", amount: 30, note: "Flat for cars under $500" }], notes: [] }
        : flat("WV privilege tax", 0.06)(i),
    source: "https://revenue.wv.gov/",
    dmv: "https://transportation.wv.gov/DMV/",
  },
  WI: { summary: "5% + county", local: LOCAL, compute: flat("WI sales tax", 0.05, { local: true }), source: "https://www.revenue.wi.gov/", dmv: "https://wisconsindot.gov/" },
  WY: { summary: "4% + local", local: LOCAL, compute: flat("WY sales tax", 0.04, { local: true }), source: "https://revenue.wyo.gov/", dmv: "https://www.dot.state.wy.us/" },
};

export function vehicleTax(state: StateCode, i: TaxInput): TaxResult {
  return STATE_TAX[state].compute(i);
}
