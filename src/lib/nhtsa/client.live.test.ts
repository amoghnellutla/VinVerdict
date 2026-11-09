import { describe, expect, it, vi } from "vitest";

// Live check against the real (free, keyless) NHTSA APIs. Skipped by default
// so `npm test` stays offline; run with:  NHTSA_LIVE=1 npx vitest run client.live
// cacheLife only works inside Next.js, so it's a no-op here.
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const live = process.env.NHTSA_LIVE === "1";

describe.skipIf(!live)("NHTSA client (live)", () => {
  const car = { year: 2017, make: "Honda", model: "Accord" };

  it("decodes a VIN", async () => {
    const { decodeVin } = await import("./client");
    const d = await decodeVin("1HGCR2F8XHA000123");
    expect(d).toMatchObject({ year: 2017, make: "HONDA", model: "Accord", clean: true, transmissionKind: "automatic" });
  });

  it("fetches recalls, ratings and complaints", async () => {
    const { getRecalls, getSafetyRatings, getComplaintSummary } = await import("./client");
    const [recalls, ratings, complaints] = await Promise.all([getRecalls(car), getSafetyRatings(car), getComplaintSummary(car)]);
    expect(recalls.length).toBeGreaterThan(0);
    expect(recalls[0].campaign).toMatch(/^\d{2}V\d{6}$/);
    expect(ratings.some((r) => r.overall === 5)).toBe(true);
    expect(complaints.total).toBeGreaterThan(100);
    expect(complaints.topComponents.length).toBe(5);
  }, 30_000);

  it("rejects bad input before calling NHTSA", async () => {
    const { getRecalls } = await import("./client");
    await expect(getRecalls({ year: 1900, make: "Honda", model: "Accord" })).rejects.toThrow("Invalid year");
  });
});
