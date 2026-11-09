import { describe, expect, it, vi } from "vitest";
import { isDemoPath } from "@/lib/auth/validate";
import { hashVisitor } from "./allowance";
import { acceptSiteverify } from "./turnstile";

describe("visitor hash", () => {
  it("is a 64-hex HMAC that never contains the IP, and needs a real salt", () => {
    const salt = "s".repeat(40);
    const h = hashVisitor("203.0.113.7", salt)!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashVisitor("203.0.113.7", salt));
    expect(h).not.toBe(hashVisitor("203.0.113.8", salt));
    expect(hashVisitor("203.0.113.7", "short")).toBeNull();
    expect(hashVisitor("203.0.113.7", undefined)).toBeNull();
  });
});

describe("Turnstile answer", () => {
  const ok = { success: true, action: "price", hostname: "vinverdict.vercel.app" };
  it("accepts only a success for this action on this site", () => {
    expect(acceptSiteverify(ok, "price", "vinverdict.vercel.app")).toBe(true);
    expect(acceptSiteverify({ ...ok, success: false }, "price", "vinverdict.vercel.app")).toBe(false);
    expect(acceptSiteverify({ ...ok, action: "login" }, "price", "vinverdict.vercel.app")).toBe(false);
    expect(acceptSiteverify({ ...ok, hostname: "evil.example" }, "price", "vinverdict.vercel.app")).toBe(false);
    expect(acceptSiteverify({ ...ok, success: "true" }, "price", "vinverdict.vercel.app")).toBe(false);
    expect(acceptSiteverify(ok, "price", null)).toBe(false);
  });
});

describe("demo pages", () => {
  it("opens only the demo pages", () => {
    for (const p of ["/", "/shortlist", "/security", "/share", "/why"]) expect(isDemoPath(p)).toBe(true);
    for (const p of ["/checked", "/compare", "/search", "/settings", "/car/1", "/mfa", "/shortlist/x"]) expect(isDemoPath(p)).toBe(false);
  });
});

// --- Server Actions, visitor path (all outside services mocked) ---
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9", host: "vinverdict.vercel.app" }) }));
vi.mock("@/lib/auth/session", () => ({ currentUser: vi.fn(async () => null), currentLogin: vi.fn(async () => null) }));
vi.mock("@/lib/guest/turnstile", async (orig) => ({ ...(await orig<object>()), verifyTurnstile: vi.fn(async () => false) }));
vi.mock("@/lib/guest/allowance", async (orig) => ({ ...(await orig<object>()), takeGuestAllowance: vi.fn(async () => "ok") }));
vi.mock("@/lib/cars/store", () => ({ saveCar: vi.fn(), saveValue: vi.fn(), findPhoneMatches: vi.fn(async () => []) }));
vi.mock("@/lib/analyze", async () => {
  const { parseListing } = await import("@/lib/listing/parse");
  return { analyzeListing: vi.fn(async (t: string) => ({ text: t, listing: parseListing(t), vinCheck: null, decoded: null, vehicle: null, recalls: null, ratings: null, complaints: null, fuel: null, notices: [] })) };
});
vi.mock("@/lib/live/client", () => ({ lookupLiveListing: vi.fn(async () => ({ listing: null, tried: ["Auto.dev"], configured: true, failed: [] })) }));
vi.mock("@/lib/history/client", () => ({ fetchVinHistory: vi.fn(async () => []) }));
vi.mock("@/lib/value/client", () => ({ fetchPriceSources: vi.fn(async () => ({ predicted: null, sold: null, active: null, zip: "08540", failed: [], calls: 2, marketDays: null })) }));
vi.mock("@/lib/usage", () => ({ recordUsage: vi.fn(), quotaBlock: vi.fn(async () => null) }));

describe("visitor Server Actions", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };

  it("checks a pasted listing for a visitor but never saves it", async () => {
    const { analyzeAction } = await import("@/app/actions/analyze");
    const { saveCar } = await import("@/lib/cars/store");
    const r = await analyzeAction({ status: "idle" }, form({ listing: "2017 Honda Accord, 100k miles, $9,000, selling my car" }));
    expect(r).toMatchObject({ status: "done", guest: true, carId: null, phoneMatches: [] });
    expect(saveCar).not.toHaveBeenCalled();
  });

  it("stops a visitor over the daily limit", async () => {
    const { analyzeAction } = await import("@/app/actions/analyze");
    const { takeGuestAllowance } = await import("@/lib/guest/allowance");
    vi.mocked(takeGuestAllowance).mockResolvedValueOnce("visitor");
    const r = await analyzeAction({ status: "idle" }, form({ listing: "2016 Toyota Camry, 90k miles, $10,000" }));
    expect(r).toMatchObject({ status: "error" });
  });

  it("refuses a visitor's live price check without the human check, before touching the counter or any paid API", async () => {
    const { priceCheckAction } = await import("@/app/actions/price");
    const { takeGuestAllowance } = await import("@/lib/guest/allowance");
    const { fetchPriceSources } = await import("@/lib/value/client");
    vi.mocked(takeGuestAllowance).mockClear();
    const r = await priceCheckAction({ status: "idle" }, form({ zip: "08540", year: "2017", make: "Honda", model: "Accord", carId: "5" }));
    expect(r).toMatchObject({ status: "error" });
    expect(takeGuestAllowance).not.toHaveBeenCalled();
    expect(fetchPriceSources).not.toHaveBeenCalled();
  });

  it("runs the lean check for a human visitor and never saves, even if the form names a car", async () => {
    const { priceCheckAction } = await import("@/app/actions/price");
    const { verifyTurnstile } = await import("@/lib/guest/turnstile");
    const { fetchPriceSources } = await import("@/lib/value/client");
    const { lookupLiveListing } = await import("@/lib/live/client");
    const { saveValue } = await import("@/lib/cars/store");
    const { recordUsage } = await import("@/lib/usage");
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(true);
    const r = await priceCheckAction({ status: "idle" }, form({ zip: "08540", vin: "1HGCR2F8XHA000123", year: "2017", make: "Honda", model: "Accord", carId: "5", "cf-turnstile-response": "token-abc-123" }));
    expect(r).toMatchObject({ status: "done" });
    expect(lookupLiveListing).toHaveBeenCalledWith("1HGCR2F8XHA000123", { autoDevOnly: true });
    expect(vi.mocked(fetchPriceSources).mock.calls[0][1]).toEqual({ skipPriceModel: true });
    expect(saveValue).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("refuses a human visitor once the shared budget is used up", async () => {
    const { priceCheckAction } = await import("@/app/actions/price");
    const { verifyTurnstile } = await import("@/lib/guest/turnstile");
    const { takeGuestAllowance } = await import("@/lib/guest/allowance");
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(true);
    vi.mocked(takeGuestAllowance).mockResolvedValueOnce("global");
    const r = await priceCheckAction({ status: "idle" }, form({ zip: "08540", year: "2017", make: "Honda", model: "Accord", "cf-turnstile-response": "token-abc-123" }));
    expect(r).toMatchObject({ status: "error", message: expect.stringContaining("used up") });
  });
});
