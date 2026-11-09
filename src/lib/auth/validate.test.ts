import { describe, expect, it } from "vitest";
import { isPublicPath, parseCredentials, parseFactorId, parseTotpCode, safeNext } from "./validate";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/compare")).toBe("/compare");
    expect(safeNext("/car/abc123?tab=price")).toBe("/car/abc123?tab=price");
  });

  it("blocks redirects to other sites and odd input", () => {
    for (const bad of [
      "https://evil.example", "//evil.example", "/\\evil.example", "\\\\evil.example", "javascript:alert(1)",
      "/ok\n", "/a b", "evil.example", "", null, undefined, 42, "/" + "a".repeat(600),
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  it("never sends you back to the login page", () => {
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/login?next=/x")).toBe("/");
  });
});

describe("isPublicPath", () => {
  it("only the login page is public", () => {
    expect(isPublicPath("/login")).toBe(true);
    for (const p of ["/", "/search", "/login/x", "/LOGIN", "/car/1"]) expect(isPublicPath(p)).toBe(false);
  });
});

describe("parseCredentials", () => {
  it("accepts a normal email and password, lower-casing the email", () => {
    expect(parseCredentials(form({ email: " Amogh@Example.com ", password: "pw 1" }))).toEqual({ email: "amogh@example.com", password: "pw 1" });
  });

  it("rejects missing or malformed fields", () => {
    expect(parseCredentials(form({ email: "", password: "x" }))).toHaveProperty("error");
    expect(parseCredentials(form({ email: "a@b.co" }))).toHaveProperty("error");
    expect(parseCredentials(form({ email: "not-an-email", password: "x" }))).toEqual({ error: "That email doesn't look right." });
    expect(parseCredentials(form({ email: "a@b.co", password: "x".repeat(129) }))).toEqual({ error: "Email or password is wrong." });
  });
});

describe("two-step login input", () => {
  it("accepts only 6-digit codes", () => {
    expect(parseTotpCode("123456")).toBe("123456");
    expect(parseTotpCode("123 456")).toBe("123456");
    expect(parseTotpCode("123-456")).toBe("123456");
    for (const bad of ["12345", "1234567", "abcdef", "", null, 123456, "1".repeat(50), "12345６"]) expect(parseTotpCode(bad)).toBeNull();
  });

  it("accepts only UUID factor ids", () => {
    expect(parseFactorId("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    for (const bad of ["", "abc", "3f2504e0-4f89-11d3-9a0c-0305e82c3301' or 1=1", null]) expect(parseFactorId(bad)).toBeNull();
  });

  it("never redirects back to the two-step page", () => {
    expect(safeNext("/mfa")).toBe("/");
    expect(safeNext("/mfa?next=/x")).toBe("/");
  });
});
