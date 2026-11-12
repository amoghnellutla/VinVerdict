import { describe, expect, it, vi } from "vitest";

// Never spend money (Amogh, 2026-11-12): the paid-API quota stop must fail closed.
const db = { from: vi.fn(), rpc: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createSupabase: vi.fn(async () => db) }));

const { quotaBlock } = await import("./usage");

const usageRows = (rows: { provider: string; calls: number }[] | null, error: unknown = null) => {
  db.from.mockReturnValue({ select: () => ({ eq: async () => ({ data: rows, error }) }) });
};

describe("quotaBlock: the hard stop before any paid lookup", () => {
  it("refuses when the meter can't be read (never risks a paid call)", async () => {
    usageRows(null, { message: "relation does not exist" });
    expect(await quotaBlock({ marketcheck: 1 })).toMatch(/skipped \(VinVerdict never risks a paid call\)/);
  });

  it("refuses before the free limit (5% kept in reserve), and allows well inside it", async () => {
    db.rpc.mockResolvedValue({ data: 0, error: null });
    usageRows([{ provider: "marketcheck", calls: 472 }, { provider: "autodev", calls: 10 }]);
    expect(await quotaBlock({ marketcheck: 4 })).toMatch(/free MarketCheck lookups are used up/);
    usageRows([{ provider: "marketcheck", calls: 100 }, { provider: "autodev", calls: 10 }]);
    expect(await quotaBlock({ marketcheck: 4, autodev: 2 })).toBeNull();
  });
});
