"use client";

import { useState } from "react";
import { LineText } from "@/components/LineText";
import { readBuyerZip } from "@/lib/buyer-zip";
import type { SellerType } from "@/lib/listing/parse";
import { buyingDay } from "@/lib/report/content";

/** "Before you pay": the checks and paperwork for buying day (features H + G). Text from lib/report/content.ts. */
export function BuyingDay({ vin, seller }: { vin: string | null; seller: SellerType }) {
  // Client-only (rendered after a check), so reading the saved ZIP is safe.
  const [state] = useState(() => readBuyerZip().state);
  const groups = buyingDay(vin, seller, state);
  return (
    <section className="border-t border-border pt-8">
      <h2 className="section-title">Before you pay</h2>
      {groups.map((g, i) => (
        <div key={g.title}>
          <h3 className={`${i > 0 ? "mt-6 " : ""}font-semibold`}>{g.title}</h3>
          {g.title === "Paperwork" ? (
            <p className="mt-2"><LineText line={g.steps[0]} /></p>
          ) : (
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {g.steps.map((s, j) => <li key={j}><LineText line={s} /></li>)}
            </ol>
          )}
          {g.note && <p className="mt-2 text-sm text-muted"><LineText line={g.note} /></p>}
        </div>
      ))}
    </section>
  );
}
