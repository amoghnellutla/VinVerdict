import Link from "next/link";
import { Suspense } from "react";
import { Analyzer } from "@/components/analyzer/Analyzer";
import { HeroSample } from "@/components/HeroSample";
import { currentUser } from "@/lib/auth/session";

export default function CheckListingPage() {
  return (
    <Suspense fallback={<Analyzer guest intro={<GuestIntro />} />}>
      <ForViewer />
    </Suspense>
  );
}

// What a search engine or chatbot can't give you (the full comparison is on /why).
const POINTS = [
  { n: "01", title: "Looks up this exact car", text: "NHTSA decodes the VIN and checks it against the ad. Every past listing of it is pulled, with prices and miles." },
  { n: "02", title: "Shows where every fact came from", text: "Each recall, owner complaint, price and warning links to the public record or listing behind it." },
  { n: "03", title: "Reads the ad for scams", text: "More than 30 checks on the seller's own words, each tied to FBI, FTC or NICB guidance." },
];

function Headline() {
  return (
    <>
      <h1 className="rise d1 text-[2.6rem] leading-[1.05] tracking-tight sm:text-6xl">Is this used car worth it?</h1>
      <p className="rise d2 mt-5 max-w-xl text-xl text-muted">
        Paste a listing, a few screenshots or just the VIN. VinVerdict checks the car&apos;s history, safety, price and seller, and shows
        where every fact came from.
      </p>
    </>
  );
}

/** The demo's opening: the pitch on the left, a real sample check floating on the right. */
function GuestIntro() {
  return (
    <div className="print:hidden">
      <section className="mb-14 grid items-center gap-10 xl:-mx-28 xl:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="rise text-sm font-semibold tracking-wide text-accent">FREE USED-CAR CHECK · US LISTINGS</p>
          <div className="mt-3">
            <Headline />
          </div>
          <p className="rise d3 mt-6 text-sm text-muted">
            Demo, no sign-up. Nothing you paste is saved. <Link href="/security" className="link">How it&apos;s secured</Link>
          </p>
        </div>
        <div className="mx-auto w-full max-w-md xl:max-w-none">
          <HeroSample />
        </div>
      </section>
      <ul className="mb-14 grid gap-8 border-y border-border py-8 sm:grid-cols-3">
        {POINTS.map((p, i) => (
          <li key={p.title} className={`rise d${i + 3}`}>
            <span className="nums font-serif text-sm text-accent">{p.n}</span>
            <h2 className="mt-1 text-xl">{p.title}</h2>
            <p className="mt-2 text-[0.95rem] text-muted">{p.text}</p>
          </li>
        ))}
        <li className="text-sm sm:col-span-3">
          <Link href="/why" className="link">How this compares with Google and AI chatbots</Link>
        </li>
      </ul>
    </div>
  );
}

function OwnerIntro() {
  return (
    <div className="mb-10 print:hidden">
      <Headline />
    </div>
  );
}

/** Owner (two-step login) gets the full app; anyone else gets the demo. */
async function ForViewer() {
  const owner = await currentUser();
  if (owner) return <Analyzer intro={<OwnerIntro />} />;
  return <Analyzer guest intro={<GuestIntro />} />;
}
