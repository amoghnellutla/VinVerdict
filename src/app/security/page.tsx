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
    what: "A live price check spends free-plan data lookups, so demo visitors pass a Cloudflare Turnstile check first, get one live check a day, and share a small daily budget. The limits are kept in the database, so they hold across every server.",
    stops: "Bots and scripts using up the free data plan.",
  },
  {
    title: "Links can't act for you",
    what: "A link or the phone's share menu can only fill in the box. Nothing is checked or saved until you press the button.",
    stops: "Other websites triggering actions on your behalf.",
  },
  {
    title: "Privacy",
    what: "Demo checks aren't stored. For the daily limits, visitors are counted by a salted one-way hash of their IP address, which is deleted after 2 days. Screenshots are read on your own device and never uploaded.",
    stops: "Collecting what visitors paste or who they are.",
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
