import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DealStandalone } from "@/components/analyzer/DealStandalone";
import { PageHeader } from "@/components/PageHeader";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Check a dealer's numbers before you sign",
  description: "Attach or paste a car dealer's buyer's order, worksheet or quote. Every line is checked (add-ons, fees, tax, loan payment), with a plan and a message to bring the out-the-door price down. Read on your device.",
};

export default function DealPage() {
  return (
    <>
      <PageHeader
        title="Check the dealer's numbers"
        description="The buyer's order is where extra money gets added: add-ons nobody asked for, a price above the ad, extras packed into the payment. Check every line before you sign."
      />
      <p className="max-w-2xl text-sm text-muted">
        Checking a specific car? <Link href="/" className="link">Check its listing first</Link>: the result has this check too, already compared with the ad.
      </p>
      <div className="mt-6">
        <Suspense fallback={<DealStandalone guest />}>
          <ForViewer />
        </Suspense>
      </div>
    </>
  );
}

/** The owner (logged in) skips the "I'm human" check for the AI double-check; visitors get it. */
async function ForViewer() {
  const owner = await currentUser();
  return <DealStandalone guest={!owner} />;
}
