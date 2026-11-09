import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "VinVerdict", template: "%s · VinVerdict" },
  description: "Paste a used-car listing and get a verdict: deal score, scam check, recalls and safety.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">{children}</main>
        <footer className="border-t border-border">
          <p className="mx-auto max-w-5xl px-4 py-6 text-xs text-muted">
            VinVerdict uses free public data (NHTSA, FuelEconomy.gov) and links every result to its source. It does not replace a
            pre-purchase inspection.
          </p>
        </footer>
      </body>
    </html>
  );
}
