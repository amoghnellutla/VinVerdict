import { LineText } from "@/components/LineText";
import { dealerCheck } from "@/lib/report/content";

/** "Is this dealer real?" Text from lib/report/content.ts (the downloadable report says the same). */
export function DealerCheck({ name }: { name: string | null }) {
  const { intro, steps } = dealerCheck(name);
  return (
    <div className="mt-8 border-t border-border pt-6">
      <h3 className="font-semibold">Is this dealer real?</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted"><LineText line={intro} /></p>
      <ol className="mt-3 max-w-2xl list-decimal space-y-1.5 pl-5">
        {steps.map((s, i) => <li key={i}><LineText line={s} /></li>)}
      </ol>
    </div>
  );
}
