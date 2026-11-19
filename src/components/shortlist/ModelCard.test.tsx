import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OwnerHub } from "@/components/cars/OwnerHub";
import { shortlist } from "@/lib/shortlist/shortlist";
import { CarYearCard, latestRun } from "./CarYearCard";
import { ModelCard } from "./ModelCard";

const models = shortlist(new Date("2026-11-19"));
const rav4 = models.find((m) => m.model === "RAV4")!;
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

describe("the owner's Shortlist: one card per saved car", () => {
  const year = rav4.years.find((y) => !y.sparse)!;
  const car = { id: 7, href: "/car/7", title: `${year.year} Toyota RAV4 XLE`, price: 21298, miles: 31450, vin: "2T3P1RFV3MW000000", facts: { year: year.year, make: "Toyota", model: "RAV4", title: "clean", accident: "none", mpg: { comb: 30, city: 27, hwy: 35 }, powertrain: "gas" as const } };

  it("shows the car's facts, its record, and how its model year rates", () => {
    const t = text(renderToStaticMarkup(<CarYearCard car={car} model={rav4} />));
    expect(t).toContain(`${year.year} Toyota RAV4 XLE`);
    expect(t).toContain("$21,298 · 31,450 mi · 30 mpg (27 city / 35 hwy) · Gas (not hybrid)");
    expect(t).toContain("Clean title, no accidents reported");
    expect(t).toMatch(new RegExp(`${year.year}: (fewer|many more|about as many) owner complaints`));
    // Nothing else from the guide: no legend, no year-by-year chart.
    expect(t).not.toContain("Fewer owner reports");
    expect(t).not.toContain("Hover a year");
  });

  it("lists better years of the same model, never the car's own year, with one search for the latest run", () => {
    const html = renderToStaticMarkup(<CarYearCard car={car} model={rav4} />);
    const better = rav4.best.filter((b) => b !== year.year);
    if (better.length) {
      expect(text(html)).toContain(`Better years of the RAV4: ${[...better].sort((a, b) => b - a).slice(0, 5).join(", ")}`);
      expect(html).toContain("autotempest.com");
    }
    expect(latestRun([2017, 2020, 2021, 2022])).toEqual({ from: 2020, to: 2022 });
    expect(latestRun([2019])).toEqual({ from: 2019, to: 2019 });
    expect(latestRun([])).toBeNull();
  });

  it("a model the guide doesn't cover says so, without inventing a trend", () => {
    const t = text(renderToStaticMarkup(<CarYearCard car={{ ...car, title: "2018 Kia Soul", facts: { year: 2018, make: "Kia", model: "Soul" } }} model={null} />));
    expect(t).toContain("isn't in VinVerdict's guide");
    expect(t).not.toContain("Better years");
    expect(t).toContain("Title not known, accidents not known");
  });
});

describe("the visitors' guide card", () => {
  it("still shows every year of the model", () => {
    const html = renderToStaticMarkup(<ModelCard m={rav4} />);
    for (const y of rav4.years) expect(html).toContain(`>${y.year}`);
  });
});

describe("the My cars hub header", () => {
  it("shows the four tabs with the current one marked", () => {
    const html = renderToStaticMarkup(<OwnerHub active="/shortlist" description="x" />);
    for (const [href, label] of [["/checked", "Cars"], ["/shortlist", "Shortlist"], ["/compare", "Compare"], ["/settings", "Settings"]]) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(label);
    }
    expect(html).toMatch(/href="\/shortlist" aria-current="page"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain("/search");
  });
});
