import { describe, expect, it } from "vitest";
import { checkDealSheet } from "./check";
import { EXAMPLES } from "./example";
import { negotiationPlan } from "./negotiate";
import { parseDealSheet } from "./parse";

const run = (paper: string, condition: "new" | "used", ad: { price: number; docFee: number | null } | null) => {
  const sheet = parseDealSheet(paper);
  const c = checkDealSheet({ sheet, ad: ad ? { ...ad, sellerType: "dealer" } : null, state: "NJ", modelYear: 2026, condition });
  return { sheet, c, plan: negotiationPlan({ sheet, check: c, ad: ad ? { ...ad, sellerType: "dealer" } : null, state: "NJ", modelYear: 2026 }) };
};
const row = (c: ReturnType<typeof run>["c"], label: string) => c.rows.find((r) => r.line.label.toLowerCase().includes(label.toLowerCase()))!;

describe("new or used: the rules that differ", () => {
  const paper = "Vehicle Price $32,900.00\nDestination Charge $1,395.00\nTotal Price $34,295.00";

  it("a destination charge is real on a new car (compare with the sticker) and padding on a used one (remove)", () => {
    const n = run(paper, "new", { price: 34295, docFee: null }).c;
    expect(row(n, "Destination").verdict).toBe("check");
    expect(row(n, "Destination").source?.href).toContain("15/1232");
    expect(n.hiddenTotal).toBe(0);
    const u = run(paper, "used", { price: 32900, docFee: null }).c;
    expect(row(u, "Destination").verdict).toBe("remove");
    expect(u.hiddenTotal).toBe(1395);
  });

  it("a new car's price is compared with the sticker including the destination charge", () => {
    const n = run(paper, "new", { price: 34295, docFee: null }).c;
    expect(row(n, "Vehicle Price").verdict).toBe("right");
    expect(row(n, "Vehicle Price").note).toContain("with the $1,395 destination charge");
    const over = run(paper.replace("32,900.00", "33,900.00").replace("34,295.00", "35,295.00"), "new", { price: 34295, docFee: null }).c;
    expect(row(over, "Vehicle Price").verdict).toBe("wrong");
    expect(row(over, "Vehicle Price").note).toContain("$1,000 more than the sticker or advertised price");
  });

  it("MSRP with a discount already taken off a selling price is not counted twice", () => {
    const p = "MSRP $32,900.00\nDealer Discount $1,500.00\nSelling Price $31,400.00\nDestination Charge $1,395.00\nTotal Price $32,795.00";
    const { sheet, c } = run(p, "new", { price: 32795, docFee: null });
    expect(sheet.lines.find((l) => l.label === "MSRP")?.kind).toBe("reference");
    expect(row(c, "Selling Price").verdict).toBe("right");
    expect(c.confirmed).toBe(true);
  });

  it("a certification fee on a used car is asked about, not refused", () => {
    const c = run("Vehicle Price $24,500.00\nCPO Certification Fee $595.00\nTotal Price $25,095.00", "used", { price: 24500, docFee: null }).c;
    expect(row(c, "Certification").verdict).toBe("check");
  });

  it("the plan for a used car reads the Buyers Guide; for a new car, the window sticker and rebates", () => {
    const used = run(EXAMPLES.used.paper, "used", EXAMPLES.used.ad).plan;
    expect(used.steps.join(" ")).toContain("Buyers Guide");
    const n = run(EXAMPLES.new.paper, "new", EXAMPLES.new.ad);
    expect(n.plan.steps.join(" ")).toContain("window sticker");
    expect(n.plan.steps.join(" ")).not.toContain("Buyers Guide");
  });

  it("the new-car example: sticker matched, market adjustment and nitrogen to refuse, tax right", () => {
    const { c, plan } = run(EXAMPLES.new.paper, "new", EXAMPLES.new.ad);
    expect(c.confirmed).toBe(true);
    expect(row(c, "Vehicle Price").verdict).toBe("right");
    expect(row(c, "Market Adjustment").verdict).toBe("remove");
    expect(row(c, "Nitrogen").verdict).toBe("remove");
    expect(row(c, "Destination").verdict).toBe("check");
    expect(row(c, "Sales Tax").verdict).toBe("right");
    expect(c.hiddenTotal).toBe(2699);
    expect(plan.target).toBe(37622.35);
  });
});
