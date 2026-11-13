import { beforeEach, describe, expect, it, vi } from "vitest";

// The dashboard action's own checks, with the outside world mocked: no AI call is ever made here.
const aiJson = vi.fn();
const verifyTurnstile = vi.fn();
const takeGuestAllowance = vi.fn();
const currentUser = vi.fn();
vi.mock("@/lib/ai/client", () => ({ aiJson: (...a: unknown[]) => aiJson(...a) }));
vi.mock("@/lib/guest/turnstile", () => ({ verifyTurnstile: (...a: unknown[]) => verifyTurnstile(...a) }));
vi.mock("@/lib/guest/allowance", () => ({ takeGuestAllowance: (...a: unknown[]) => takeGuestAllowance(...a), allowanceMessage: () => "Today's free AI uses are used up." }));
vi.mock("@/lib/auth/session", () => ({ currentUser: () => currentUser() }));
vi.mock("@/lib/client-ip", () => ({ clientIp: async () => `203.0.113.${Math.floor(Math.random() * 250)}` }));
vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const IMG = `data:image/jpeg;base64,${"A".repeat(400)}`;

describe("readDashAction (dashboard photo)", async () => {
  const { readDashAction } = await import("./ai");
  beforeEach(() => {
    aiJson.mockReset().mockResolvedValue({ ok: true, provider: "gemini", data: { readable: true, odometer: 126410, unit: "mi", lights: [] } });
    verifyTurnstile.mockReset().mockResolvedValue(true);
    takeGuestAllowance.mockReset().mockResolvedValue("ok");
    currentUser.mockReset().mockResolvedValue(null);
  });

  it("refuses anything that isn't a small JPEG/PNG/WebP data URL, before any check or AI call", async () => {
    for (const image of [undefined, 42, "hello", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PGh0bWw+", `data:image/jpeg;base64,${"A".repeat(950_000)}`, "data:image/png;base64,<script>"]) {
      const r = await readDashAction({ image, token: "t" });
      expect(r.status, String(image).slice(0, 30)).toBe("error");
    }
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(aiJson).not.toHaveBeenCalled();
  });

  it("a visitor without a valid 'I'm human' token is refused, and no AI call is made", async () => {
    verifyTurnstile.mockResolvedValue(false);
    const r = await readDashAction({ image: IMG, token: null });
    expect(r).toMatchObject({ status: "error", message: expect.stringContaining("I'm human") });
    expect(aiJson).not.toHaveBeenCalled();
  });

  it("a visitor whose free AI uses are used up is refused", async () => {
    takeGuestAllowance.mockResolvedValue("visitor");
    const r = await readDashAction({ image: IMG, token: "t" });
    expect(r).toMatchObject({ status: "error", message: "Today's free AI uses are used up." });
    expect(aiJson).not.toHaveBeenCalled();
  });

  it("with the check passed, the photo goes to a vision model and the reading comes back", async () => {
    const r = await readDashAction({ image: IMG, token: "t" });
    expect(r).toMatchObject({ status: "ok", provider: "Gemini (Google)", dash: { odometer: 126410 } });
    expect(aiJson.mock.calls[0][0]).toMatchObject({ vision: true });
    expect(takeGuestAllowance).toHaveBeenCalledWith("ai");
  });

  it("the owner uses their own allowance, no token needed", async () => {
    currentUser.mockResolvedValue({ id: "owner" });
    const r = await readDashAction({ image: IMG, token: null });
    expect(r.status).toBe("ok");
    expect(takeGuestAllowance).toHaveBeenCalledWith("ai_owner", "owner");
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("when every free AI is busy, it says so plainly", async () => {
    aiJson.mockResolvedValue({ ok: false, reason: "busy" });
    const r = await readDashAction({ image: IMG, token: "t" });
    expect(r).toMatchObject({ status: "error", message: expect.stringContaining("busy") });
  });
});
