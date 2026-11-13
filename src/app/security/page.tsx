import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "How it's secured" };

// Plain-English tour of the security layers (docs/ARCHITECTURE.md has the technical version).
const LAYERS: { title: string; what: string; stops: string }[] = [
  {
    title: "HTTPS and the host's firewall",
    what: "Every page is served over HTTPS only (browsers are told never to use plain http), behind Vercel's firewall.",
    stops: "Eavesdropping on the connection, and floods of traffic.",
  },
  {
    title: "A strict script policy",
    what: "Each page carries a new random code, and the browser runs only scripts that carry it. Nothing on the page is ever turned into HTML: pasted listings are read as plain text.",
    stops: "Injected scripts (cross-site scripting), even if someone sneaks text onto a page.",
  },
  {
    title: "Owner pages behind a two-step login",
    what: "Saved cars, comparisons and search need the owner's password and a code from an authenticator app. There's no sign-up, and one gate checks every page while every server action checks again on its own.",
    stops: "Stolen or guessed passwords: a password alone opens nothing.",
  },
  {
    title: "The database checks too",
    what: "Every saved row belongs to one account, and the database itself refuses any session that hasn't passed the two-step login, even if someone calls it directly.",
    stops: "Someone skipping the website and talking to the database.",
  },
  {
    title: "No secrets in the browser",
    what: "API keys live only on the server. The browser never talks to the database or the listing-data services.",
    stops: "Keys being copied out of the page and misused.",
  },
  {
    title: "\"I'm human\" check and daily limits for the demo",
    what: "A live price check spends free-plan data lookups, so demo visitors pass a Cloudflare Turnstile check first, get two live lookups a day, and share a small daily budget. The limits are kept in the database, so they hold across every server.",
    stops: "Bots and scripts using up the free data plan.",
  },
  {
    title: "Links can't act for you",
    what: "A link or the phone's share menu can only fill in the box. Nothing is checked or saved until you press the button.",
    stops: "Other websites triggering actions on your behalf.",
  },
  {
    title: "Privacy",
    what: "Visitors' checks aren't stored. For the daily limits, visitors are counted by a salted one-way hash of their IP address, which is deleted after 2 days. Screenshots and camera pictures are read on your own device and never uploaded unless you tap a free-AI button (below). When you scan a VIN, only the VIN goes out, to NHTSA's free decoder, to confirm it's real. The camera is allowed for this site only (no other site or embedded page can use it), and only runs while the scanner is open.",
    stops: "Collecting what visitors paste or who they are.",
  },
  {
    title: "AI mode: free AI services, on your tap only",
    what: "Asking about a car, reading a history report closely, reading a dashboard photo or checking dealer pages sends what's needed (phone numbers and emails removed) to a free AI service: GLM by Z.ai first, then Google's Gemini or Groq when it's busy. Free plans may keep what's sent, and each button says so. The keys stay on the server; each action needs the \"I'm human\" check for visitors and counts against a daily limit (5 per visitor). AI answers are checked before you see them: a number or link that isn't in the source is rejected, and only report events whose words are in your copy change anything. Dealer pages are opened by the server only from this car's own listing links, over https, never to private addresses, and respecting the site's robots.txt.",
    stops: "Made-up facts from an AI, instructions hidden in an ad, and the server being used to reach private networks.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        title="How it's secured"
        description="VinVerdict is a personal project built with security in mind at every step. Here's what protects it, in plain words."
      />
      <ol className="divide-y divide-border border-y border-border">
        {LAYERS.map((l, i) => (
          <li key={l.title} className="grid gap-1 py-5 sm:grid-cols-[2rem_1fr]">
            <span className="nums font-serif text-xl text-muted">{i + 1}</span>
            <div>
              <h2 className="text-xl">{l.title}</h2>
              <p className="mt-1">{l.what}</p>
              <p className="mt-1 text-sm text-muted">
                <strong className="text-foreground">Stops:</strong> {l.stops}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-muted">
        No system is unbreakable; the goal is layers, so getting past one isn&apos;t enough. Found a problem? Please tell the owner instead of
        testing it on the live site.
      </p>
    </>
  );
}
