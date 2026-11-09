import Link from "next/link";
import { Suspense } from "react";
import { Analyzer } from "@/components/analyzer/Analyzer";
import { currentUser } from "@/lib/auth/session";

export default function CheckListingPage() {
  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl sm:text-[2.5rem]">Is this used car worth it?</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Copy a listing from any site, or just the VIN. VinVerdict checks the car&apos;s history, safety and the seller before
          you spend a dollar.
        </p>
      </div>
      <Suspense fallback={<Analyzer guest />}>
        <ForViewer />
      </Suspense>
    </>
  );
}

/** Owner (two-step login) gets the full app; anyone else gets the demo. */
async function ForViewer() {
  const owner = await currentUser();
  if (owner) return <Analyzer />;
  return (
    <>
      <p className="-mt-6 mb-8 max-w-2xl rounded-md border-l-4 border-l-accent bg-accent-soft px-4 py-3">
        <strong>Demo, no sign-up.</strong> Open an example or check your own listing. Nothing you paste is saved.{" "}
        <Link href="/security" className="link">How it&apos;s secured</Link>
      </p>
      <Analyzer guest />
    </>
  );
}
