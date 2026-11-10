import Link from "next/link";
import { Suspense } from "react";
import { Analyzer } from "@/components/analyzer/Analyzer";
import { currentUser } from "@/lib/auth/session";
import { playData } from "@/lib/demo/play";

// The page's Server Actions (check, price & history lookup) may take up to ~25 s when listing sites are slow.
export const maxDuration = 30;

export default function CheckListingPage() {
  return (
    <Suspense fallback={<Analyzer guest intro={<GuestIntro />} outro={<Points />} play={playData()} />}>
      <ForViewer />
    </Suspense>
  );
}

// What a search engine or chatbot can't give you (the full comparison is on /why).
const POINTS = [
  { title: "Looks up this exact car.", text: "NHTSA decodes the VIN and checks it against the ad, and every past listing of it is pulled with its price and miles." },
  { title: "Shows where every fact came from.", text: "Each recall, owner complaint, price and warning links to the public record or listing behind it." },
  { title: "Reads the ad for scams.", text: "More than 30 checks on the seller's own words, each tied to FBI, FTC or NICB guidance." },
];

function Headline() {
  return (
    <>
      <h1 className="rise text-[2.6rem] leading-[1.02] sm:text-[4.25rem]">Is this used car worth it?</h1>
      <p className="rise d1 mt-4 max-w-xl text-xl text-muted">
        Paste the listing, a few screenshots or just the VIN. You get a verdict, a fair price and the public records behind both.
      </p>
    </>
  );
}

/** The demo's opening: the question, then three ways to play with it (components/play). */
function GuestIntro() {
  return (
    <div className="mb-8 print:hidden">
      <Headline />
      <p className="rise d2 mt-4 text-sm text-muted">
        Demo, no sign-up. Nothing you paste is saved. <Link href="/security" className="link">How it&apos;s secured</Link>
      </p>
    </div>
  );
}

function Points() {
  return (
    <section className="mt-14 border-t border-border pt-8 print:hidden">
      <ul className="grid gap-6 sm:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title}>
            <p className="font-bold">{p.title}</p>
            <p className="mt-1 text-[0.95rem] text-muted">{p.text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm">
        <Link href="/why" className="link">How this compares with Google and AI chatbots</Link>
      </p>
    </section>
  );
}

function OwnerIntro() {
  return (
    <div className="mb-8 print:hidden">
      <Headline />
    </div>
  );
}

/** Owner (two-step login) gets the full app; anyone else gets the demo. */
async function ForViewer() {
  const owner = await currentUser();
  if (owner) return <Analyzer intro={<OwnerIntro />} play={playData()} />;
  return <Analyzer guest intro={<GuestIntro />} outro={<Points />} play={playData()} />;
}
