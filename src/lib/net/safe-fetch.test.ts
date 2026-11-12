import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => {
    const table: Record<string, string> = { "dealer.example.com": "93.184.216.34", "evil.example.com": "10.0.0.5", "rebind.example.com": "169.254.169.254" };
    return [{ address: table[host] ?? "93.184.216.34", family: 4 }];
  }),
}));

const { allowedUrl, isPrivateAddress, robotsAllows, safeFetchPage } = await import("./safe-fetch");

afterEach(() => vi.unstubAllGlobals());

describe("what VinVerdict's server may open", () => {
  it("refuses private, local and special addresses (IPv4, IPv6, IPv4-mapped)", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });

  it("only https, real hostnames, no credentials or odd ports", () => {
    expect(allowedUrl("https://www.dchwappingerstoyota.com/inventory/x")).not.toBeNull();
    for (const u of ["http://dealer.example.com/", "https://127.0.0.1/", "https://[::1]/", "https://localhost/", "https://printer.local/", "https://user:pw@dealer.example.com/", "https://dealer.example.com:8443/", "javascript:alert(1)", "https://intranet/"]) {
      expect(allowedUrl(u), u).toBeNull();
    }
  });

  it("reads robots.txt for us, else for everyone", () => {
    const robots = "User-agent: *\nDisallow: /admin\n\nUser-agent: VinVerdict\nDisallow: /inventory/\nAllow: /inventory/used\n";
    expect(robotsAllows(robots, "/inventory/new/1")).toBe(false);
    expect(robotsAllows(robots, "/inventory/used/2020-camry")).toBe(true);
    expect(robotsAllows(robots, "/admin")).toBe(true); // our group has no rule for it
    expect(robotsAllows("User-agent: *\nDisallow: /", "/anything")).toBe(false);
    expect(robotsAllows("", "/x")).toBe(true);
  });
});

describe("safeFetchPage", () => {
  const html = (body: string, headers: Record<string, string> = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } });

  it("opens a public dealer page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: URL) => (String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : html("<p>VIN 4T1F11AK9LU310542</p>"))));
    expect(await safeFetchPage("https://dealer.example.com/car")).toMatchObject({ ok: true, html: "<p>VIN 4T1F11AK9LU310542</p>" });
  });

  it("won't go to a host that resolves privately, or follow a redirect there", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: URL) => (String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("", { status: 302, headers: { location: "https://rebind.example.com/latest/meta-data" } }))));
    expect(await safeFetchPage("https://evil.example.com/car")).toEqual({ ok: false, reason: "blocked" });
    expect(await safeFetchPage("https://dealer.example.com/car")).toEqual({ ok: false, reason: "blocked" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 302, headers: { location: "http://dealer.example.com/plain-http" } })));
    expect(await safeFetchPage("https://dealer.example.com/car")).toEqual({ ok: false, reason: "blocked" });
  });

  it("respects robots.txt, and refuses non-HTML and oversize pages", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: URL) => (String(u).endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /", { status: 200 }) : html("x"))));
    expect(await safeFetchPage("https://dealer.example.com/car")).toEqual({ ok: false, reason: "robots" });
    vi.stubGlobal("fetch", vi.fn(async (u: URL) => (String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("{}", { headers: { "content-type": "application/json" } }))));
    expect(await safeFetchPage("https://dealer.example.com/car")).toEqual({ ok: false, reason: "not-html" });
    vi.stubGlobal("fetch", vi.fn(async (u: URL) => (String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : html("x".repeat(1_600_000)))));
    expect(await safeFetchPage("https://dealer.example.com/car")).toEqual({ ok: false, reason: "too-big" });
  });
});
