"use client";

import { useState } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import { readBuyerZip } from "@/lib/buyer-zip";
import { STATE_TAX } from "@/lib/costs/stateTax";
import { STATES } from "@/lib/geo/zip";
import type { SellerType } from "@/lib/listing/parse";

// NJ private-sale steps, from NJ MVC "Transferring ownership" (checked 2026-11-09).
const NJ_TRANSFER = "https://www.nj.gov/mvc/vehicles/transowner.htm";

/** "Before you pay": the checks and paperwork for buying day (features H + G). */
export function BuyingDay({ vin, seller }: { vin: string | null; seller: SellerType }) {
  // Client-only (rendered after a check), so reading the saved ZIP is safe.
  const [state] = useState(() => readBuyerZip().state);
  const dealer = seller === "dealer";
  return (
    <section className="border-t border-border pt-8">
      <h2 className="section-title">Before you pay</h2>

      <h3 className="font-semibold">Check the car</h3>
      <ol className="mt-2 list-decimal space-y-2 pl-5">
        <li>
          Theft and insurance total-loss records: <ExternalLink href="https://www.nicb.org/vincheck" className="link">NICB VINCheck</ExternalLink> (free)
          {vin && <> with VIN <code className="font-mono text-[0.95em]">{vin}</code></>}.
        </li>
        <li>
          Open recalls on this exact car: enter the VIN on <ExternalLink href="https://www.nhtsa.gov/recalls" className="link">NHTSA</ExternalLink>.
        </li>
        <li>A pre-purchase inspection by your own mechanic ($100–250). Give them the inspection checklist above.</li>
        <li>
          On the test drive: start it cold, drive at highway speed, look for warning lights, and check the odometer matches the listing and its
          earlier readings.
        </li>
      </ol>

      {dealer ? (
        <>
          <h3 className="mt-6 font-semibold">At the dealer</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>Read the Buyers Guide on the window: it says &quot;As Is&quot; or lists the warranty.</li>
            <li>Ask for the out-the-door price in writing and read the buyer&apos;s order line by line. Say no to add-ons you didn&apos;t ask for.</li>
          </ol>
        </>
      ) : (
        <>
          <h3 className="mt-6 font-semibold">On the day</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>
              Before you drive out, ask for two fresh photos: the odometer, and the VIN sticker on the driver&apos;s door with a paper showing
              today&apos;s date. Someone using stolen listing photos can&apos;t send them, and the VIN must match the listing.
            </li>
            <li>Meet in daylight somewhere public. Many police stations have a safe exchange spot.</li>
            <li>
              See the title in person. The name must match the seller&apos;s photo ID, and the VIN must match the dashboard and the driver&apos;s door
              sticker. No &quot;Salvage&quot;, &quot;Rebuilt&quot; or &quot;Flood&quot; on it. A title issued in the last few weeks needs a good reason.
            </li>
            <li>
              If there&apos;s a loan on the car, finish the deal at the seller&apos;s bank or pay the lender directly, and get the original lien release
              on the lender&apos;s letterhead.
            </li>
            <li>Pay at the handover with a cashier&apos;s check or a bank transfer. Never a deposit before you&apos;ve seen the car, gift cards or crypto.</li>
          </ol>

          <h3 className="mt-6 font-semibold">Paperwork{state === "NJ" ? " in New Jersey" : ""}</h3>
          {state === "NJ" ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>
                The seller signs the back of the title and gives you a bill of sale with your name and address, the date, the odometer reading and
                the price. You sign the buyer&apos;s section.
              </li>
              <li>The seller keeps the license plates. Get insurance before you drive it, and plan how to get it home.</li>
              <li>
                Within 10 working days, go to an MVC agency in person with the signed title, your ID and proof of NJ insurance ($25 penalty after
                that). You pay the 6.625% sales tax and get your plates there.
              </li>
            </ol>
          ) : (
            <p className="mt-2">
              Get the signed title and a bill of sale with the date, price and odometer reading. Check{" "}
              <ExternalLink href={STATE_TAX[state].dmv} className="link">{STATES[state]}&apos;s DMV</ExternalLink> for the deadline to transfer
              it and where to pay the sales tax.
            </p>
          )}
          {state === "NJ" && (
            <p className="mt-2 text-sm text-muted">
              From <ExternalLink href={NJ_TRANSFER} className="link">NJ MVC: transferring ownership</ExternalLink>. Your state comes from the ZIP
              you entered.
            </p>
          )}
        </>
      )}
    </section>
  );
}
