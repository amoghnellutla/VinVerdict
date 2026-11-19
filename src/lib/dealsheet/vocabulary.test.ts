/**
 * The words real dealer papers use for their lines (buyer's orders, retail installment contracts, lease forms), each
 * with what it is. Order matters in the reader's rules ("finance charge", "contract", a note in brackets), so a change
 * that misfiles one shows up here.
 */

import { describe, expect, it } from "vitest";
import { classify } from "./parse";

const WANT: [string, string][] = [
  ["Cash Price of Motor Vehicle", "price"], ["Cash Price (including any accessories, services and taxes)", "price"], ["Agreed Upon Value of Vehicle", "price"],
  ["Base Price", "price"], ["Retail Price", "price"], ["Sale Price of Vehicle", "price"], ["Vehicle Sales Price", "price"], ["Price of Unit", "price"],
  ["Dealer Discount", "discount"], ["Conquest Cash", "rebate"], ["Military Rebate", "rebate"], ["College Grad Rebate", "rebate"], ["Finance Cash", "rebate"], ["Bonus Cash", "rebate"],
  ["Documentary Service Fee", "docFee"], ["Document Preparation Fee", "docFee"], ["Dealer Conveyance Fee", "docFee"], ["Dealer Service Charge", "docFee"], ["Admin Fee", "docFee"],
  ["State Title Fee", "stateFee"], ["Registration/Plate Fee", "stateFee"], ["License Plate Fee", "stateFee"], ["Plate Transfer Fee", "stateFee"], ["Temporary Tag", "stateFee"],
  ["Title Application Fee", "stateFee"], ["Lien Recording Fee", "stateFee"], ["Lien Fee", "stateFee"], ["Registration Renewal", "stateFee"], ["Tire Disposal Fee", "stateFee"],
  ["Sales Tax", "tax"], ["Use Tax", "tax"], ["County Tax", "tax"], ["City Tax", "tax"], ["Motor Vehicle Sales Tax", "tax"], ["Excise Tax", "tax"], ["Highway Use Tax", "tax"], ["Privilege Tax", "tax"],
  ["Paint Sealant", "addOn"], ["Fabric Guard", "addOn"], ["Leather Protection", "addOn"], ["Ceramic Coating", "addOn"], ["Etch Anti-Theft", "addOn"], ["Theft Deterrent System", "addOn"],
  ["Window Tinting", "addOn"], ["Pinstriping", "addOn"], ["Splash Guards", "addOn"], ["Door Edge Guards", "addOn"], ["Nitrogen Filled Tires", "addOn"], ["Wheel Lock Kit", "addOn"],
  ["Mud Flaps", "addOn"], ["Market Value Adjustment", "addOn"], ["Additional Dealer Markup", "addOn"], ["ADM", "addOn"], ["Appearance Package", "addOn"], ["Protection Package", "addOn"],
  ["Key Replacement Plan", "addOn"], ["Dent Protection", "addOn"], ["Windshield Protection", "addOn"], ["Roadside Assistance Plan", "addOn"], ["Floor Mats", "addOn"], ["Cargo Tray", "addOn"],
  ["Vehicle Service Contract", "loanProduct"], ["Mechanical Breakdown Insurance", "loanProduct"], ["Extended Service Plan", "loanProduct"], ["Extended Warranty", "loanProduct"],
  ["GAP Waiver", "loanProduct"], ["Guaranteed Asset Protection", "loanProduct"], ["Debt Cancellation Agreement", "loanProduct"], ["Credit Life Insurance", "loanProduct"], ["Credit Disability Insurance", "loanProduct"],
  ["Prepaid Maintenance", "loanProduct"], ["Tire & Wheel", "loanProduct"], ["Road Hazard Protection", "loanProduct"], ["Excess Wear and Use", "loanProduct"], ["Excess Wear & Tear Protection", "loanProduct"],
  ["Trade-In Allowance", "tradeIn"], ["Gross Trade Allowance", "tradeIn"], ["Trade Payoff", "payoff"], ["Payoff to Lienholder", "payoff"], ["Lien Payoff", "payoff"], ["Negative Equity", "negativeEquity"],
  ["Cash Down Payment", "downPayment"], ["Deferred Down Payment", "downPayment"], ["Manufacturer's Rebate Applied to Down", "rebate"],
  ["Total Cash Price", "total"], ["Total Sale Price", "loan"], ["Balance Due on Delivery", "balanceDue"], ["Amount Financed", "amountFinanced"], ["Unpaid Balance of Cash Price", "amountFinanced"],
  ["Subtotal", "subtotal"], ["Taxable Subtotal", "subtotal"], ["Total Taxable", "subtotal"],
  ["Destination Charge", "dealerFee"], ["Freight", "dealerFee"], ["Dealer Prep", "dealerFee"], ["Reconditioning", "dealerFee"], ["Delivery Charge", "dealerFee"],
  ["Acquisition Fee", "leaseFee"], ["Disposition Fee", "leaseFee"], ["Capitalized Cost Reduction", "leaseTerm"], ["Residual Value", "leaseTerm"], ["Money Factor", "leaseTerm"],
  ["Kelley Blue Book Value", "reference"], ["NADA Retail", "reference"], ["Dealer Invoice", "reference"], ["MSRP", "price"],
];
const MORE: [string, string][] = [
  // Brand-name dealer add-ons and products.
  ["Zurich Shield", "addOn"], ["Resistall", "addOn"], ["Ziebart Rustproofing", "addOn"], ["TruCoat", "addOn"], ["Tru-Coat Sealant", "addOn"], ["3M Clear Film", "addOn"],
  ["XPEL Paint Protection Film", "addOn"], ["Diamond Fusion Windshield", "addOn"], ["LoJack Recovery System", "addOn"], ["Etch Guard", "addOn"], ["Interior Guard", "addOn"],
  ["Platinum Package", "addOn"], ["Gold Protection Package", "addOn"], ["Value Package", "addOn"], ["Dealer Add-On Package", "addOn"], ["Security Package", "addOn"], ["Convenience Package", "addOn"],
  ["Key Plus", "addOn"], ["Key Fob Protection", "addOn"], ["Tire & Wheel Plus", "loanProduct"], ["Theft Recovery", "addOn"], ["Tracking Device", "addOn"], ["Anti-Theft Device", "addOn"],
  ["Lifetime Oil Changes", "loanProduct"], ["Maintenance Package", "loanProduct"], ["ToyotaCare Plus", "loanProduct"], ["Honda Care", "loanProduct"], ["Powertrain Warranty", "loanProduct"],
  ["Bumper to Bumper Warranty", "loanProduct"], ["Limited Warranty", "loanProduct"], ["Vehicle Protection Plan", "loanProduct"], ["GAP Coverage", "loanProduct"], ["GAP Insurance", "loanProduct"],
  ["Credit Life", "loanProduct"], ["Accident & Health Insurance", "loanProduct"], ["Involuntary Unemployment Insurance", "loanProduct"],
  // Payoffs and negative equity.
  ["Prior Loan Balance", "payoff"], ["Lease Payoff", "payoff"], ["Amount Owed on Trade", "payoff"], ["Trade Lien", "payoff"], ["Balance Owed to Lienholder", "payoff"], ["Payoff Amount", "payoff"],
  ["Net Payoff", "payoff"], ["Negative Equity Rolled Into Loan", "negativeEquity"], ["Trade Equity", "tradeIn"], ["Trade Value", "tradeIn"], ["Trade-In Credit", "tradeIn"],
  // Credits.
  ["Owner Loyalty Rebate", "rebate"], ["Lease Loyalty Cash", "rebate"], ["Factory Incentive", "rebate"], ["Conquest Bonus", "rebate"], ["First Responder Rebate", "rebate"],
  ["Internet Discount", "discount"], ["Price Reduction", "discount"], ["Employee Pricing Discount", "discount"], ["Manager Discount", "discount"], ["Cash Deposit", "downPayment"], ["Earnest Money", "downPayment"],
  ["Customer Down Payment", "downPayment"], ["Cash Due at Delivery", "downPayment"],
  // Fees.
  ["DMV Registration", "stateFee"], ["State Registration Fee", "stateFee"], ["Title Transfer Fee", "stateFee"], ["Plate Fee", "stateFee"], ["License Fee", "stateFee"], ["Inspection Fee", "stateFee"],
  ["Emissions Fee", "dealerFee"], ["Electronic Registration Fee", "stateFee"], ["Online Registration Fee", "stateFee"], ["Courtesy Delivery Fee", "dealerFee"], ["Vehicle Prep Fee", "dealerFee"],
  ["Pre-Delivery Service", "dealerFee"], ["Reconditioning Fee", "dealerFee"], ["Shipping", "other"], ["Handling Fee", "docFee"], ["Documentation Charge", "docFee"], ["Doc Fee (Not a Government Fee)", "docFee"],
  ["Dealer Fee", "docFee"], ["Processing Charge", "docFee"],
  // Totals and others.
  ["Total Out the Door", "total"], ["OTD Price", "total"], ["Grand Total", "total"], ["Balance Due", "balanceDue"], ["Total Due at Signing", "leaseTerm"],
  ["Net Sale Price", "price"], ["Selling Price After Discounts", "price"], ["Adjusted Selling Price", "price"],
];
// Dealer-system abbreviations and Spanish papers.
const ABBR: [string, string][] = [
  ["SLS PRC", "price"], ["SALE PRC", "price"], ["VEH PRICE", "price"], ["CASH PRC", "price"], ["SELL PRICE", "price"],
  ["DOC FEE", "docFee"], ["DOC", "docFee"], ["DOCS", "docFee"], ["ADMIN", "docFee"], ["PROC FEE", "docFee"],
  ["TTL/LIC", "stateFee"], ["TTL", "stateFee"], ["LIC/TTL", "stateFee"], ["REG", "stateFee"], ["TITLE/REG", "stateFee"], ["DMV", "stateFee"], ["TAG/TITLE", "stateFee"],
  ["SLS TAX", "tax"], ["ST TAX", "tax"], ["CTY TAX", "tax"], ["CO TAX", "tax"], ["SALES TX", "tax"],
  ["SVC CONTRACT", "loanProduct"], ["SVC CONT", "loanProduct"], ["VSC", "loanProduct"], ["MBI", "loanProduct"], ["EXT WARR", "loanProduct"], ["GAP INS", "loanProduct"], ["T&W", "loanProduct"], ["CR LIFE", "loanProduct"], ["MAINT PLAN", "loanProduct"],
  ["DLR PREP", "dealerFee"], ["FRT", "dealerFee"], ["DEST", "dealerFee"], ["DEST/FRT", "dealerFee"], ["RECON", "dealerFee"],
  ["ETCH", "addOn"], ["N2", "addOn"], ["TINT", "addOn"], ["PNT PROT", "addOn"], ["APPEAR PKG", "addOn"], ["ADD MKUP", "addOn"], ["MKT ADJ", "addOn"],
  ["RBT", "rebate"], ["MFR RBT", "rebate"], ["REBATE", "rebate"], ["DISC", "discount"], ["DLR DISC", "discount"],
  ["TRD ALLOW", "tradeIn"], ["TRADE ALLOW", "tradeIn"], ["TRD PAYOFF", "payoff"], ["TRADE P/O", "payoff"], ["P/O", "payoff"],
  ["DWN PMT", "downPayment"], ["CASH DN", "downPayment"], ["DEP", "downPayment"],
  ["AMT FIN", "amountFinanced"], ["AMT FINANCED", "amountFinanced"], ["BAL DUE", "balanceDue"], ["TOT", "total"], ["TOTAL DUE", "total"], ["SUBTOT", "subtotal"],
];
const ES: [string, string][] = [
  ["Precio sugerido por el fabricante", "price"], ["Precio de lista", "price"], ["Descuento del concesionario", "discount"], ["Reembolso", "rebate"],
  ["Cargo por documentación", "docFee"], ["Cargo por procesamiento de documentos", "docFee"], ["Impuesto sobre las ventas", "tax"], ["Impuesto del condado", "tax"],
  ["Título", "stateFee"], ["Registro", "stateFee"], ["Placas", "stateFee"], ["Tasas de licencia", "stateFee"],
  ["Contrato de servicio", "loanProduct"], ["Garantía extendida", "loanProduct"], ["Protección GAP", "loanProduct"], ["Seguro de vida de crédito", "loanProduct"],
  ["Grabado del VIN", "addOn"], ["Nitrógeno", "addOn"], ["Polarizado", "addOn"], ["Protección de pintura", "addOn"], ["Ajuste de mercado", "addOn"],
  ["Cargo de destino", "dealerFee"], ["Flete", "dealerFee"], ["Preparación del concesionario", "dealerFee"],
  ["Pago inicial", "downPayment"], ["Enganche", "downPayment"], ["Valor de intercambio", "tradeIn"], ["Saldo del intercambio", "payoff"],
  ["Importe financiado", "amountFinanced"], ["Saldo no pagado", "amountFinanced"], ["Saldo adeudado", "balanceDue"], ["Total", "total"], ["Subtotal", "subtotal"],
];
describe("the words real dealer papers use", () => {
  it.each([...WANT, ...MORE, ...ABBR, ...ES])("%s is %s", (label, kind) => {
    expect(classify(label).kind).toBe(kind);
  });
});
