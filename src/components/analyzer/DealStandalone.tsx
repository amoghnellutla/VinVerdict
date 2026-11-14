"use client";

import { useState } from "react";
import { DealSheet } from "./DealSheet";

const money = (v: string) => v.replace(/[^\d]/g, "").slice(0, 7);

/** The deal checker on its own page: the ad's price and fee are typed in (optional), so the paper can be compared with them. */
export function DealStandalone({ guest }: { guest: boolean }) {
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const p = price ? Number(price) : null;
  const f = fee ? Number(fee) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <label>
          The price in the ad (optional)
          <input className="field mt-1 w-40" inputMode="numeric" value={price} onChange={(e) => setPrice(money(e.target.value))} placeholder="$" />
        </label>
        <label>
          Dealer fee the ad showed (optional)
          <input className="field mt-1 w-40" inputMode="numeric" value={fee} onChange={(e) => setFee(money(e.target.value))} placeholder="$" />
        </label>
      </div>
      <DealSheet ad={p ? { price: p, docFee: f, sellerType: "dealer" } : null} standalone guest={guest} ai={process.env.NEXT_PUBLIC_AI_MODE === "1"} />
    </div>
  );
}
