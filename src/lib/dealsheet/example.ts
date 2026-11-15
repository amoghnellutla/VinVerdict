/**
 * A made-up buyer's order for "Try it with an example" on /deal, so a visitor without a dealer's paper in hand
 * can see what the check does. Its numbers add up (tax is New Jersey's 6.625% on the price, fees and add-ons) and
 * it carries the usual problems: a price $700 over the ad, three add-ons and $36.94 a month above the loan math.
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
