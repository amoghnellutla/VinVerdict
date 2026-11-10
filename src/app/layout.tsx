import type { Metadata, Viewport } from "next";
import { Overpass, Overpass_Mono } from "next/font/google";
import { connection } from "next/server";
import Link from "next/link";
import { ExternalLink } from "@/components/ExternalLink";
import { BackgroundFx } from "@/components/BackgroundFx";
import { Nav } from "@/components/Nav";
import "./globals.css";

// Self-hosted at build time by next/font: no requests to Google from the browser.
// Overpass is the open version of Highway Gothic, the lettering on US road signs:
// one family for everything. Overpass Mono only for VINs (fixed-width, like a VIN plate).
const body = Overpass({ variable: "--font-body", subsets: ["latin"] });
const mono = Overpass_Mono({ variable: "--font-vin", subsets: ["latin"], weight: ["400", "600", "700"] });

const DESCRIPTION =
  "A free second opinion before you buy a used car: paste a listing or VIN and see scam warning signs, a fair price, recalls and what to check next. Every fact linked to its source.";

export const metadata: Metadata = {
  metadataBase: new URL("https://vinverdict.vercel.app"),
  title: { default: "VinVerdict: check a used-car listing before you pay", template: "%s · VinVerdict" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "VinVerdict", title: "VinVerdict: check a used-car listing before you pay", description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: "VinVerdict: check a used-car listing before you pay", description: DESCRIPTION },
};

// Browser chrome matches the black page.
export const viewport: Viewport = {
  themeColor: "#000000",
};

// Every page renders per request, so each gets the fresh CSP nonce from the
// proxy. A prebuilt static shell can't carry a nonce, and its scripts would
// be blocked. Fine for a private app: every page is personal anyway.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="en" className={`${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <BackgroundFx />
        <a href="#main" className="sr-only rounded-md bg-surface px-3 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
          Skip to content
        </a>
        <Nav />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 outline-none sm:py-14">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-3xl space-y-2 px-4 py-8 text-sm text-muted">
            <p>
              Data: NHTSA (VIN decode, recalls, crash tests, complaints), FuelEconomy.gov, and listing data from MarketCheck and Auto.dev.
              Every result links to its source. VinVerdict doesn&apos;t replace a pre-purchase inspection by a mechanic you trust.
            </p>
            <p>
              Privacy: visitors&apos; checks aren&apos;t stored, and screenshots are read on your device.{" "}
              <Link href="/security" className="link">How it&apos;s secured</Link> ·{" "}
              <Link href="/accuracy" className="link">How accurate it is</Link> ·{" "}
              <Link href="/scam-signs" className="link">Scam signs</Link>
            </p>
            <p>
              Got a wrong answer, or an idea?{" "}
              <ExternalLink href="https://github.com/amoghnellutla/VinVerdict/issues/new/choose" className="link">Tell us on GitHub</ExternalLink>{" "}
              (every wrong answer becomes a test case). The{" "}
              <ExternalLink href="https://github.com/amoghnellutla/VinVerdict" className="link">source code</ExternalLink> is public.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
