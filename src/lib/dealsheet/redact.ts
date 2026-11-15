/**
 * A dealer's paperwork carries the buyer's own details. These come out first, before the paper is shown,
 * copied, saved in a report or sent to the free AI: anything labelled with a name, address, licence, Social
 * Security number, date of birth, employer, bank account or insurance policy, plus any SSN, phone number, email
 * or street address anywhere.
 *
 * Forms print in columns ("Stock # 1234      Buyer: Pat Example"), so each column of a line (split at a wide
 * gap, a tab or "|") is looked at on its own, and only the personal column goes. A label standing alone
 * ("BUYER", "Sold To:") takes the line under it, when that line isn't money.
 */

import { redact as redactContacts } from "@/lib/report/redact";

const WHO = String.raw`(?:buyer|co-?buyer|purchaser|co-?purchaser|customer|owner|applicant|borrower|co-?borrower|co-?signer|cosigner|guarantor|spouse)(?:\(s\)|'s|s)?`;
const LABEL = new RegExp(
  String.raw`^(?:` +
    [
      `${WHO}(?:\\s+(?:full\\s+)?(?:name|address|signature|info(?:rmation)?))?(?:\\s+(?:and|&)\\s+(?:address|name))?`,
      String.raw`(?:full\s+|legal\s+)?name(?:\s+(?:and|&)\s+address)?(?:\s+of\s+${WHO})?`,
      String.raw`(?:home|street|mailing|residence|residential|billing|e-?mail)?\s*address`,
      String.raw`sold\s+to|bill\s+to|ship\s+to|deliver\s+to`,
      String.raw`city\s*(?:,|\/)\s*state(?:\s*(?:,|\/)\s*zip)?|zip(?:\s*code)?|county\s+of\s+residence`,
      String.raw`(?:home|cell|mobile|work|business|daytime|evening)?\s*(?:phone|telephone|tel\.?)(?:\s+(?:no\.?|number|#))?`,
      String.raw`e-?mail`,
      String.raw`driver'?s?\s+licen[cs]e(?:\s+(?:no\.?|number|state))?|d\.?l\.?\s*(?:no\.?|number|#|state)?|licen[cs]e\s+(?:no\.?|number)`,
      String.raw`ssn|itin|social\s+security(?:\s+(?:no\.?|number))?|tax\s+id(?:\s+(?:no\.?|number))?`,
      String.raw`date\s+of\s+birth|d\.?o\.?b\.?|birth\s*date`,
      String.raw`employer(?:\s+(?:name|address|phone))?|occupation`,
      String.raw`(?:bank\s+)?account\s+(?:no\.?|number|#)|acct\.?\s*(?:no\.?|number|#)?|routing\s+(?:no\.?|number|#)?|aba\s+(?:no\.?|number|#)?`,
      String.raw`(?:insurance\s+)?policy\s+(?:no\.?|number|#)|insurance\s+agent`,
      String.raw`signature|signed`,
    ].join("|") +
    String.raw`)\s*(?::|#|no\.?:?)\s*`,
  "i",
);
// A heading with nothing after it ("BUYER", "Sold To:", "Co-Buyer Information").
const HEADING = new RegExp(String.raw`^(?:${WHO}(?:\s+(?:name|information|info|name\s+(?:and|&)\s+address))?|sold\s+to|bill\s+to|name\s+(?:and|&)\s+address)\s*:?$`, "i");
const STREET = /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|pkwy|parkway|hwy|highway|cir|circle|ter|terrace|trl|trail)\b\.?(?:,?\s+(?:apt|unit|suite|ste|#)\.?\s*[\w-]+)?/gi;
const CITY_STATE_ZIP = /\b[A-Za-z][A-Za-z .'-]{1,30},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const isMoney = (s: string) => /\$\s?\d|\d,\d{3}\.\d{2}|\d\.\d{2}\b/.test(s);
const REMOVED = "[personal details removed]";

export function redactDealSheet(text: string): { text: string; removed: number } {
  let n = 0;
  let takeNext = false;
  const out = text.split("\n").map((line) => {
    // The line under a lone "BUYER" heading is the buyer (unless it's money).
    if (takeNext) {
      takeNext = false;
      if (line.trim() && !isMoney(line)) return (n++, REMOVED);
    }
    // Columns: split at a tab, "|" or a gap of 3+ spaces, keeping the separators.
    const parts = line.split(/(\t+|\s*\|\s*|\s{3,})/);
    let changed = false;
    for (let i = 0; i < parts.length; i += 2) {
      const col = parts[i].trim();
      if (!col) continue;
      const m = LABEL.exec(col);
      if (m) {
        const value = col.slice(m[0].length).trim();
        // "Customer Cash: $2,000" isn't personal, and LABEL needs ":" or "#" right after the words, so it won't match.
        if (value && isMoney(value) && !/\d{3}-\d{2}-\d{4}/.test(value)) continue;
        parts[i] = REMOVED;
        n++;
        changed = true;
        // A label with its value in the next column ("Buyer:      Pat Example").
        if (!value && i + 2 < parts.length && parts[i + 2].trim() && !isMoney(parts[i + 2])) parts[i + 2] = "";
        else if (!value && i + 2 >= parts.length) takeNext = true;
        continue;
      }
      if (HEADING.test(col) && i + 2 >= parts.length) takeNext = true;
    }
    return changed ? parts.join("").replace(/\s+$/, "") : line;
  });
  const joined = out
    .join("\n")
    .replace(SSN, () => (n++, "[removed]"))
    .replace(STREET, () => (n++, "[address removed]"))
    .replace(CITY_STATE_ZIP, () => (n++, "[address removed]"));
  const contacts = redactContacts(joined);
  return { text: contacts.text, removed: n + contacts.removed };
}
