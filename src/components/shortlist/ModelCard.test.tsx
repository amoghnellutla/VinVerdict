import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OwnerHub } from "@/components/cars/OwnerHub";
import { shortlist } from "@/lib/shortlist/shortlist";
import { ModelCard } from "./ModelCard";

const rav4 = shortlist(new Date("2026-11-19")).find((m) => m.model === "RAV4")!;

describe("the owner's Shortlist card", () => {
  it("lists the owner's cars, rings their years and says what the guide says about each", () => {
    const year = rav4.years.find((y) => !y.sparse)!.year;
    const html = renderToStaticMarkup(<ModelCard m={rav4} mine={[{ id: 7, title: `${year} Toyota RAV4 XLE`, price: 21298, year, make: "Toyota", model: "RAV4" }]} />);
    expect(html).toContain('href="/car/7"');
    expect(html).toContain(`${year} Toyota RAV4 XLE`);
    expect(html).toContain("(yours)");
    expect(html).toMatch(new RegExp(`${year}: (fewer|about as many|many more) owner reports`));
    expect(html).toContain("ring-accent");
  });

  it("a visitor's card has no owner's cars or rings", () => {
    const html = renderToStaticMarkup(<ModelCard m={rav4} />);
    expect(html).not.toContain("(yours)");
    expect(html).not.toContain("ring-accent");
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
