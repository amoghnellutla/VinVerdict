import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Opens a public web page for "Check the dealers for me" without letting a page,
 * a redirect or a crafted link reach anything private (SSRF):
 * - https only, standard port, no user:password in the URL;
 * - the hostname must resolve only to public addresses (checked before every hop),
 *   and IP-address hosts, localhost and internal names are refused;
 * - redirects are followed by hand (at most 3), each one checked the same way;
 * - 8-second timeout, HTML only, at most 1.5 MB read, no cookies sent;
 * - robots.txt is honoured for our user agent.
 * What's left (a host that changes its DNS answer between the check and the
 * request) can only reach public addresses on Vercel's network.
 */

export const UA = "VinVerdict/0.1 (+https://vinverdict.vercel.app)";
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;

export type FetchResult = { ok: true; url: string; html: string } | { ok: false; reason: "blocked" | "robots" | "failed" | "not-html" | "too-big" };

/** True for addresses that aren't on the public internet (IPv4 and IPv6, including IPv4-mapped). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateAddress(mapped[1]);
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("2001:db8");
  }
  return true;
}

/** A URL VinVerdict may open: https, a real public hostname, no credentials, default port. */
export function allowedUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  if (isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") || /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return null;
  return u;
}

async function publicHost(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** robots.txt rules for us (our name, else "*"): is `path` allowed? Missing or unreadable robots.txt allows. */
export function robotsAllows(robots: string, path: string, agent = "vinverdict"): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of robots.split(/\r?\n/)) {
    const m = /^\s*([a-z-]+)\s*:\s*(.*?)\s*(?:#.*)?$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(m[2].toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      if (m[2]) cur.rules.push({ allow: key === "allow", path: m[2] });
      lastWasAgent = false;
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && agent.includes(a))) ?? groups.find((g) => g.agents.includes("*"));
  if (!mine) return true;
  const match = mine.rules
    .filter((r) => path.startsWith(r.path.replace(/\*.*$/, "").replace(/\$$/, "")))
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
  return match ? match.allow : true;
}

async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function get(u: URL, signal: AbortSignal): Promise<Response> {
  return fetch(u, { redirect: "manual", signal, cache: "no-store", headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
}

export async function safeFetchPage(raw: string): Promise<FetchResult> {
  let u = allowedUrl(raw);
  if (!u) return { ok: false, reason: "blocked" };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    // robots.txt first (same checks).
    if (!(await publicHost(u.hostname))) return { ok: false, reason: "blocked" };
    const robotsRes = await get(new URL("/robots.txt", u), signal).catch(() => null);
    if (robotsRes?.ok) {
      const robots = (await readCapped(robotsRes)) ?? "";
      if (!robotsAllows(robots, u.pathname + u.search)) return { ok: false, reason: "robots" };
    }
    for (let hop = 0; hop <= 3; hop++) {
      if (!(await publicHost(u.hostname))) return { ok: false, reason: "blocked" };
      const res = await get(u, signal);
      if (res.status >= 300 && res.status < 400) {
        const next = allowedUrl(new URL(res.headers.get("location") ?? "", u).toString());
        if (!next) return { ok: false, reason: "blocked" };
        u = next;
        continue;
      }
      if (!res.ok) return { ok: false, reason: "failed" };
      if (!/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "")) return { ok: false, reason: "not-html" };
      const html = await readCapped(res);
      return html === null ? { ok: false, reason: "too-big" } : { ok: true, url: u.toString(), html };
    }
    return { ok: false, reason: "blocked" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
