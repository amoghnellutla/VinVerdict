"use client";

import { useState } from "react";
import { readBuyerZip, saveBuyerZip } from "@/lib/buyer-zip";
import { STATES, zipToState } from "@/lib/geo/zip";

/** Home ZIP, saved on this device only. Used by the price check, out-the-door cost and search. */
export function ZipSetting() {
  const [zip, setZip] = useState(() => (typeof window === "undefined" ? "" : readBuyerZip().zip));
  const [saved, setSaved] = useState<string | null>(null);
  const state = zip.length === 5 ? zipToState(zip) : null;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!state) return;
        saveBuyerZip(zip, state);
        setSaved(`Saved: ${zip} (${STATES[state]}).`);
      }}
    >
      <label>
        <span className="text-sm font-semibold">Home ZIP code</span>
        <input
          className="field mt-1 w-36"
          inputMode="numeric"
          autoComplete="postal-code"
          value={zip}
          onChange={(e) => {
            setZip(e.target.value.replace(/\D/g, "").slice(0, 5));
            setSaved(null);
          }}
          placeholder="08540"
          suppressHydrationWarning
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!state}>Save</button>
      <p role="status" className="w-full text-sm text-muted">
        {saved ?? (zip.length === 5 && !state ? "That isn't a US ZIP code we recognize." : "Local prices, car tax and search distance start from here. Stored on this device only.")}
      </p>
    </form>
  );
}
