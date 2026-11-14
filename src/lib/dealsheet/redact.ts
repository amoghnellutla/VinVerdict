/**
 * A dealer's paperwork carries the buyer's own details. These come out first, before the paper is shown,
 * copied, saved in a report or sent to the free AI: lines labelled with a name, address, licence, Social
 * Security number, date of birth or employer, plus any SSN, phone number or email anywhere.
 */

import { redact as redactContacts } from "@/lib/report/redact";

// "Buyer: …", "Co-Buyer Name: …", "Address: …", "Driver's License #: …", "DOB: …". The label must be followed by
// ":" or "#", so money lines that start the same way ("Customer Cash: $2,000", "City Tax $120") are kept.
const PERSONAL_LINE = /^\s*(?:(?:buyer|co-?buyer|purchaser|co-?purchaser|customer|owner|applicant|borrower|co-?borrower)(?:'s)?(?:\s+(?:full\s+)?(?:name|address|signature))?|(?:full\s+)?name|(?:home|street|mailing|residence)?\s*address|city\s*(?:,|\/)\s*state(?:\s*(?:,|\/)\s*zip)?|(?:home|cell|mobile|work|business)\s+phone|phone|e-?mail|driver'?s?\s+licen[cs]e(?:\s+(?:no\.?|number))?|d\.?l\.?\s*(?:no\.?|number|#)?|licen[cs]e\s+(?:no\.?|number)|ssn|social\s+security(?:\s+(?:no\.?|number))?|date\s+of\s+birth|d\.?o\.?b\.?|birth\s*date|employer|signature)\s*[:#][^\n]*$/gim;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

export function redactDealSheet(text: string): { text: string; removed: number } {
  let n = 0;
  const lines = text.replace(PERSONAL_LINE, () => (n++, "[personal details removed]")).replace(SSN, () => (n++, "[removed]"));
  const contacts = redactContacts(lines);
  return { text: contacts.text, removed: n + contacts.removed };
}
