/**
 * Made-up papers for "Try it with an example" on /deal, one for a used car and one for a new car, so a visitor
 * without a dealer's paper in hand can see what the check does. Their numbers add up (tax is New Jersey's 6.625%
 * on the price, fees and add-ons).
 *  - Used: a price $700 over the ad, three add-ons and $36.94 a month above the loan math.
 *  - New: the price plus destination matches the $34,295 window sticker; a $2,500 "market adjustment" and
 *    nitrogen are add-ons to refuse.
 */

export const EXAMPLE_AD = { price: 21298, docFee: 799 } as const;
export const EXAMPLE_STATE = "NJ" as const;

export const EXAMPLE_PAPER = `Example Motors - Buyer's Order (a made-up example)
2021 Toyota RAV4 XLE
Vehicle Price $21,998.00
Documentation Fee $799.00
VIN Etching $399.00
Nitrogen Tire Fill $199.00
Paint & Fabric Protection $1,295.00
Title & Registration $310.00
NJ Sales Tax 6.625% $1,635.71
Total Price $26,635.71
Cash Down $3,000.00
Balance Due $23,635.71
Amount Financed $23,635.71
Annual Percentage Rate 7.90%
Term 72 months
Monthly Payment $450.20
Total of Payments $32,414.40`;

/** The new car's window sticker total (MSRP $32,900 + $1,395 destination), as the "advertised price". */
export const EXAMPLE_NEW_AD = { price: 34295, docFee: null } as const;

export const EXAMPLE_NEW_PAPER = `Example Motors - New Vehicle Buyer's Order (a made-up example)
New 2026 Toyota RAV4 XLE
Vehicle Price (MSRP) $32,900.00
Destination Charge $1,395.00
Market Adjustment $2,500.00
Nitrogen Tire Fill $199.00
Documentation Fee $699.00
Title & Registration $310.00
NJ Sales Tax 6.625% $2,497.16
Total Price $40,500.16`;

export const EXAMPLES = {
  used: { paper: EXAMPLE_PAPER, ad: EXAMPLE_AD, state: EXAMPLE_STATE },
  new: { paper: EXAMPLE_NEW_PAPER, ad: EXAMPLE_NEW_AD, state: EXAMPLE_STATE },
} as const;
