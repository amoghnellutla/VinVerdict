import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { connection } from "next/server";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

// Self-hosted at build time by next/font: no requests to Google from the browser.
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin"] });
const heading = Source_Serif_4({ variable: "--font-heading", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "VinVerdict", template: "%s · VinVerdict" },
  description: "Paste a used-car listing and see if it's a fair price, a good car and a safe deal.",
};

// Every page renders per request, so each gets the fresh CSP nonce from the
// proxy. A prebuilt static shell can't carry a nonce, and its scripts would
// be blocked. Fine for a private app: every page is personal anyway.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-3xl space-y-2 px-4 py-8 text-sm text-muted">
            <p>
              Data: NHTSA (VIN decode, recalls, crash tests, complaints), FuelEconomy.gov, and listing data from MarketCheck and Auto.dev.
              Every result links to its source. VinVerdict doesn&apos;t replace a pre-purchase inspection by a mechanic you trust.
            </p>
            <p>
              Privacy: demo checks aren&apos;t stored, and screenshots are read on your device.{" "}
              <Link href="/security" className="link">How it&apos;s secured</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
