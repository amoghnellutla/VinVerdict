import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/ExternalLink";
import { PageHeader } from "@/components/PageHeader";
import type { Metrics, Scorecard } from "@/lib/scam/eval/evaluate";
import card from "@/lib/scam/eval/scorecard.json";
import holdout from "@/lib/scam/eval/holdout.json";
import messages from "@/lib/scam/eval/messages.json";

export const metadata: Metadata = { title: "How accurate is it?" };

const REPO = "https://github.com/amoghnellutla/VinVerdict";
const s = card as Scorecard;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ROWS: { name: string; note: string; m: Metrics }[] = [
  { name: "VinVerdict, held-out ads", note: `${s.heldOut.cases} ads never used to tune the rules: the fairest number`, m: s.heldOut },
  { name: "VinVerdict, tuning ads", note: `${s.vinverdict.cases} ads the rules were developed on`, m: s.vinverdict },
  { name: "A keyword filter", note: "Flags any ad mentioning a payment app, shipping, a deposit, a wire or the seller being away", m: s.baseline },
];

const REPLY_ROWS: { name: string; note: string; m: Metrics }[] = [
  { name: "VinVerdict, seller replies", note: `${s.messages.cases} replies, written before the first measurement`, m: s.messages },
  { name: "A keyword filter", note: "The same scary-word filter, on the same replies", m: s.messagesBaseline },
];

const LEARNED_ROWS: { name: string; note: string; m: Metrics }[] = [
  { name: "Trained model, held-out ads", note: `The same ${s.learned.heldOut.cases} held-out ads as above`, m: s.learned.heldOut },
  { name: "Trained model, tuning ads", note: "Each ad scored by a model trained on all the others (leave-one-out)", m: s.learned.crossValidated },
  { name: "Trained model, seller replies", note: "Trained on ads only, scored on the replies", m: s.learned.replies },
];

/** One scorecard: a stacked list on phones, a table on wider screens. */
function ScoreTable({ rows, unit }: { rows: { name: string; note: string; m: Metrics }[]; unit: string }) {
  return (
    <>
      <ul className="mt-5 divide-y divide-border border-y border-border sm:hidden">
        {rows.map((r) => (
          <li key={r.name} className="py-3">
            <p className="font-semibold">{r.name}</p>
            <p className="text-sm text-muted">{r.note}</p>
            <p className="nums mt-1">
              Caught {r.m.tp} of {r.m.scams} scams · false alarms on {r.m.fp} of {r.m.legit} honest {unit} · {r.m.tp + r.m.fp ? pct(r.m.precision) : "–"} of
              warnings right
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-5 hidden sm:block">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border-strong text-sm text-muted">
              <th className="py-2 pr-4 font-medium">Checked by</th>
              <th className="py-2 pr-4 font-medium">Scams caught</th>
              <th className="py-2 pr-4 font-medium">False alarms</th>
              <th className="py-2 font-medium">Warnings that were right</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => <Row key={r.name} {...r} unit={unit} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({ name, note, m, unit }: { name: string; note: string; m: Metrics; unit: string }) {
  return (
    <tr className="align-top">
      <th scope="row" className="py-3 pr-4 text-left font-semibold">
        {name}
        <span className="block text-sm font-normal text-muted">{note}</span>
      </th>
      <td className="nums py-3 pr-4">{m.tp + m.fn ? `${pct(m.recall)}` : "–"}<span className="block text-sm text-muted">{m.tp} of {m.scams} scams</span></td>
      <td className="nums py-3 pr-4">{m.fp + m.tn ? pct(m.falseAlarmRate) : "–"}<span className="block text-sm text-muted">{m.fp} of {m.legit} honest {unit}</span></td>
      <td className="nums py-3">{m.tp + m.fp ? pct(m.precision) : "–"}<span className="block text-sm text-muted">of its warnings</span></td>
    </tr>
  );
}

export default function AccuracyPage() {
  return (
    <>
      <PageHeader
        title="How accurate is it?"
        description="Measured, not claimed. Here's how often the scam warnings are right, how often they're false alarms, and what hasn't been tested yet."
      />

      <section>
        <h2 className="section-title">Scam warnings, measured ({s.generated})</h2>
        <p className="max-w-2xl">
          Each ad below is labelled by hand: does it show a known fake-listing or payment-scam pattern (from FBI, FTC and NICB guidance), or is it an honest ad
          that happens to use the same words (&quot;no deposits&quot;, &quot;I don&apos;t take Zelle&quot;, &quot;stationed at the base, come see it&quot;)? A warning
          counts when VinVerdict&apos;s answer is <strong>Stop: serious warning</strong> because of the listing or the payment.
        </p>
        <ScoreTable rows={ROWS} unit="ads" />
        {s.misses.length > 0 && (
          <p className="mt-3 text-sm text-muted">Still wrong: {s.misses.map((m) => `${m.id} (${m.kind})`).join(", ")}.</p>
        )}
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="section-title">Seller replies, measured</h2>
        <p className="max-w-2xl">
          Many scams only show after the first message. These are replies to the same honest-looking ad: some ask for a deposit, a wire or gift cards, or tell
          the away-and-shipping story; the rest are honest replies using the same words (&quot;no deposit needed&quot;, &quot;I don&apos;t take Zelle&quot;,
          &quot;my husband is deployed, come by&quot;). First run: {messages.firstRun.replace(/^[\d-]+: /, "")}
        </p>
        <ScoreTable rows={REPLY_ROWS} unit="replies" />
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="section-title">Could a trained model do better?</h2>
        <p className="max-w-2xl">
          VinVerdict&apos;s warnings come from written rules, so each one can name its source. To check whether learning from the data would do better, a
          simple model (naive Bayes over words and word pairs) is retrained on the {s.learned.trainedOn} tuning ads on every change and scored the same way. It
          doesn&apos;t change any answer VinVerdict gives.
        </p>
        <ScoreTable rows={LEARNED_ROWS} unit="examples" />
        <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            The words it leans on most are &quot;{s.learned.topFeatures.slice(0, 4).join("\", \"")}&quot;: phrasing, not scam patterns. Most ads were written by
            one person, so it&apos;s likely learning that person&apos;s style. Real listings are needed before its numbers mean much.
          </li>
          <li>
            Its first two versions flagged almost every honest ad: the scam examples are short ads while many honest ones are whole dealer pages, so it learned
            &quot;short means scam&quot;. The version shown was chosen after seeing that, so its held-out number is less clean than the rules&apos;.
          </li>
          <li>
            It would only be used in the app if it beats the rules on real held-out listings, and then only to add a warning, never to clear a car.{" "}
            <ExternalLink href={`${REPO}/tree/main/dataset`} className="link">The labelled dataset</ExternalLink> is public.
          </li>
        </ul>
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="section-title">Read these numbers carefully</h2>
        <ul className="max-w-2xl list-disc space-y-2 pl-5">
          <li>
            <strong>Most test ads are written from published scam patterns, not collected from real scams yet.</strong> Real ones are being added, and they&apos;re
            reported separately ({s.byOrigin.real.cases} so far). Expect real-world numbers to be lower than these.
          </li>
          <li>
            <strong>The rules were improved using the tuning ads,</strong> so their score flatters. The held-out ads were written afterwards and kept apart. When one
            of them exposed a gap, it moved to the tuning set and a new held-out ad replaced it. First held-out run: {holdout.firstRun.replace(/^[\d-]+: /, "").replace(/ \(moved to cases\.json after the fix\)/, "; that ad then joined the tuning set")}
          </li>
          <li>
            <strong>The held-out ads also catch regressions.</strong> Adding Apple Pay and Chime as payment apps made one held-out scam (a &quot;holding payment&quot;
            through Apple Pay Cash) slip to a weaker warning; it was fixed, moved to the tuning set and replaced. Rewording probes (&quot;w/ Zelle 1st&quot;,
            &quot;can&apos;t meet in person&quot;, &quot;Google Play cards&quot;) found nine more gaps, now fixed and kept as tuning ads, next to honest look-alikes such
            as &quot;can&apos;t meet until Saturday&quot;.
          </li>
          <li>
            <strong>Getting better was measurable.</strong> Before context-aware rules (the same week), the tuning ads scored 100% caught but <strong>20% false
            alarms</strong> (9 of 46 honest ads told to stop), against 41% for the keyword filter.
          </li>
          <li>
            <strong>It only sees the words.</strong> A scam ad written to sound normal, with stolen photos and a fair price, can pass. That&apos;s why every result
            also says what&apos;s still unknown and what to check in person.
          </li>
        </ul>
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="section-title">Other checks that run on every change</h2>
        <ul className="max-w-2xl list-disc space-y-2 pl-5">
          <li>Listings in their real page layouts (Facebook, Craigslist, Autotrader, Cars.com, CarGurus, CarMax, Carvana, dealer sites): price, miles, title, accidents and seller type must be read exactly.</li>
          <li>Every known model-year problem cites the maker&apos;s bulletin it was checked against, and a test fails if a bulletin number or year range changes.</li>
          <li>
            All of it is public and runs on every change: the <ExternalLink href={`${REPO}/tree/main/src/lib/scam/eval`} className="link">labelled ads</ExternalLink> and the{" "}
            <ExternalLink href={`${REPO}/actions`} className="link">test runs</ExternalLink>.
          </li>
        </ul>
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="section-title">Help make it more accurate</h2>
        <p className="max-w-2xl">
          The most useful thing is an ad VinVerdict got wrong: a scam it missed, or an honest ad it warned about.{" "}
          <ExternalLink href={`${REPO}/issues/new?template=wrong-answer.yml`} className="link">Send it here</ExternalLink> (remove phone numbers and names first). It
          becomes a test case, so the same mistake can&apos;t come back.
        </p>
        <p className="mt-6">
          <Link href="/" className="btn btn-primary">Check a listing</Link>
        </p>
      </section>
    </>
  );
}
