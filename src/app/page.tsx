import Link from "next/link";
import { Suspense } from "react";
import { Analyzer } from "@/components/analyzer/Analyzer";
import { currentUser } from "@/lib/auth/session";

export default function CheckListingPage() {
  return (
    <>
      <div className="mb-10 print:hidden">
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

// What a search engine or chatbot can't give you (the full comparison is on /why).
const POINTS = [
  { title: "Looks up this exact car", text: "NHTSA decodes the VIN and it's checked against the ad. Every past listing of it is pulled, with prices and miles." },
  { title: "Shows where every fact came from", text: "Each recall, owner complaint, price and warning links to the public record or listing behind it." },
  { title: "Reads the ad for scams", text: "More than 30 checks on the seller's own words, each tied to FBI, FTC or NICB guidance." },
];

/** Owner (two-step login) gets the full app; anyone else gets the demo. */
async function ForViewer() {
  const owner = await currentUser();
  if (owner) return <Analyzer />;
  return (
    <>
      <p className="-mt-6 mb-8 max-w-2xl rounded-md border-l-4 border-l-accent bg-accent-soft px-4 py-3 print:hidden">
        <strong>Demo, no sign-up.</strong> Open an example or check your own listing. Nothing you paste is saved.{" "}
        <Link href="/security" className="link">How it&apos;s secured</Link>
      </p>
      <ul className="mb-10 grid gap-5 border-y border-border py-5 sm:grid-cols-3 print:hidden">
        {POINTS.map((p) => (
          <li key={p.title}>
            <h2 className="text-lg">{p.title}</h2>
            <p className="mt-1 text-sm text-muted">{p.text}</p>
          </li>
        ))}
        <li className="text-sm sm:col-span-3">
          <Link href="/why" className="link">How this compares with Google and AI chatbots</Link>
        </li>
      </ul>
      <Analyzer guest />
    </>
  );
}
