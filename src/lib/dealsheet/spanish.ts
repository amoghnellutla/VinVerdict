/**
 * Dealer papers in Spanish. California law requires the contract in Spanish when the deal was negotiated mainly
 * in Spanish, and many dealers hand out Spanish buyer's orders. The reader's rules are written in English, so a
 * Spanish label or loan box is put into the English words the rules know before it's classified. Only for
 * reading: what's shown is always the paper's own words. Numbers, "$" and line breaks are never touched.
 */

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Longest phrases first; each replaced as whole words, case-insensitively, on accent-free text.
const PHRASES: [string, string][] = [
  // The federal Truth-in-Lending box, as Spanish contracts print it.
  ["tasa de porcentaje anual", "annual percentage rate"],
  ["cargo por financiamiento", "finance charge"],
  ["cargo financiero", "finance charge"],
  ["importe financiado", "amount financed"],
  ["monto financiado", "amount financed"],
  ["cantidad financiada", "amount financed"],
  ["total de los pagos", "total of payments"],
  ["total de pagos", "total of payments"],
  ["precio total de venta", "total sale price"],
  ["numero de pagos", "number of payments"],
  ["importe de cada pago", "amount of payments"],
  ["importe de los pagos", "amount of payments"],
  ["monto de los pagos", "amount of payments"],
  ["pago final", "final payment"],
  ["pagos mensuales", "monthly payments"],
  ["pago mensual", "monthly payment"],
  ["saldo no pagado", "unpaid balance"],
  ["pagado a funcionarios publicos", "paid to public officials"],
  ["otros cargos", "other charges"],
  // The car's price and credits.
  ["precio de contado del vehiculo", "cash price of vehicle"],
  ["precio de contado", "cash price"],
  ["precio en efectivo", "cash price"],
  ["precio de venta", "selling price"],
  ["precio del vehiculo", "vehicle price"],
  ["precio de lista", "list price"],
  ["precio sugerido por el fabricante", "msrp"],
  ["descuento del concesionario", "dealer discount"],
  ["reembolso del fabricante", "manufacturer rebate"],
  ["reembolso", "rebate"],
  ["rebaja", "rebate"],
  ["descuento", "discount"],
  ["pago inicial", "down payment"],
  ["pago de entrada", "down payment"],
  ["enganche", "down payment"],
  ["vehiculo de intercambio", "trade-in"],
  ["valor de intercambio", "trade-in allowance"],
  ["credito por intercambio", "trade-in allowance"],
  ["saldo del intercambio", "trade-in payoff"],
  ["liquidacion del intercambio", "trade-in payoff"],
  ["saldo adeudado", "balance due"],
  ["saldo a pagar", "balance due"],
  ["cantidad adeudada", "amount due"],
  // Fees and tax.
  ["cargo por procesamiento de documentos", "document processing charge"],
  ["cargo por documentacion", "documentation fee"],
  ["cargo de documentos", "doc fee"],
  ["tarifa de documentacion", "documentation fee"],
  ["cargo por presentacion electronica", "electronic filing fee"],
  ["presentacion electronica", "electronic filing"],
  ["impuesto sobre las ventas", "sales tax"],
  ["impuesto sobre ventas", "sales tax"],
  ["impuesto de ventas", "sales tax"],
  ["impuesto de venta", "sales tax"],
  ["impuesto", "tax"],
  ["tasas de licencia", "license fees"],
  ["derechos de licencia", "license fees"],
  ["cuotas de registro", "registration fees"],
  ["registro", "registration"],
  ["matricula", "registration"],
  ["titulo", "title"],
  ["placas", "plates"],
  ["cargo de destino", "destination charge"],
  ["destino", "destination"],
  ["flete", "freight"],
  ["preparacion del concesionario", "dealer prep"],
  ["preparacion", "prep"],
  ["emisiones", "emissions"],
  // Add-ons and products.
  ["contrato de servicio", "service contract"],
  ["garantia extendida", "extended warranty"],
  ["proteccion gap", "gap protection"],
  ["seguro gap", "gap protection"],
  ["seguro de vida de credito", "credit life insurance"],
  ["seguro de incapacidad", "disability insurance"],
  ["grabado del vin", "vin etching"],
  ["grabado de vin", "vin etching"],
  ["grabado", "etching"],
  ["nitrogeno", "nitrogen"],
  ["proteccion de pintura", "paint protection"],
  ["proteccion de tela", "fabric protection"],
  ["polarizado", "window tint"],
  ["tinte de ventanas", "window tint"],
  ["ajuste de mercado", "market adjustment"],
  ["accesorios", "accessories"],
  ["llantas y rines", "tire & wheel"],
  // Leases.
  ["contrato de arrendamiento", "lease agreement"],
  ["arrendamiento", "lease"],
  ["costo capitalizado bruto", "gross capitalized cost"],
  ["costo capitalizado ajustado", "adjusted capitalized cost"],
  ["reduccion del costo capitalizado", "capitalized cost reduction"],
  ["costo capitalizado", "capitalized cost"],
  ["valor residual", "residual value"],
  ["cargo de renta", "rent charge"],
  ["depreciacion", "depreciation"],
  ["factor de dinero", "money factor"],
  ["al firmar", "at signing"],
  // Words that are enough on their own.
  ["vehiculo nuevo", "new vehicle"],
  ["auto nuevo", "new car"],
  ["usado", "used"],
  ["plazo", "term"],
  ["meses", "months"],
  ["pagos de", "payments of"],
  ["declinado", "declined"],
  ["rechazado", "declined"],
  ["no incluido", "not included"],
  ["ninguno", "none"],
];
// Words within a line only ("[ \t]+"), so the line count never changes.
const RE = new RegExp(`\\b(?:${PHRASES.map(([es]) => es.replace(/ /g, "[ \\t]+")).join("|")})\\b`, "gi");
const LOOKUP = new Map(PHRASES.map(([es, en]) => [es, en]));
/** The text with Spanish dealer-paper words in the English the reader knows (unchanged when there are none). */
export function toEnglish(text: string): string {
  const plain = strip(text);
  RE.lastIndex = 0;
  if (!RE.test(plain)) return text;
  return plain.replace(RE, (m) => LOOKUP.get(m.toLowerCase().replace(/[ \t]+/g, " ")) ?? m);
}
