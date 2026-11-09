import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "./csp";

describe("page CSP", () => {
  it("allows scripts only with this request's nonce in production", () => {
    const csp = buildCsp("abc123==", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    for (const d of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'", "connect-src 'self'", "upgrade-insecure-requests", "frame-src https://challenges.cloudflare.com"]) {
      expect(csp).toContain(d);
    }
  });

  it("makes a fresh, unguessable nonce each time", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(new Set(Array.from({ length: 50 }, newNonce)).size).toBe(50);
  });
});
