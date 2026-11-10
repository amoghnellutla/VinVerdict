/**
 * The labelled dataset in one file (dataset/vinverdict-labelled.jsonl): every
 * ad, pasted page and seller reply VinVerdict is measured on, one JSON object
 * per line, so it can be loaded by any tool (pandas, a notebook, another
 * model). Built from the sources below; a test fails if the committed file is
 * out of date, so the dataset and the measurements can't drift apart.
 *
 *   src/lib/scam/eval/cases.json      tuning ads (the rules were improved on these)
 *   src/lib/scam/eval/holdout.json    held-out ads (never used to tune anything)
 *   src/lib/scam/eval/messages.json   seller replies to one honest-looking ad
 *   src/lib/listing/corpus/cases/     full pasted pages with the exact field answers
 */

export type DatasetRow = {
  id: string;
  /** tuning: used to improve the rules and to train the model. held-out: only ever scored. reply: seller messages. fields-only: no scam label (a VIN or link). */
  set: "tuning" | "held-out" | "reply" | "fields-only";
  /** real: from an actual listing (personal details removed). synthetic: written from published scam patterns. */
  origin: "real" | "synthetic";
  /** Does it show a known scam pattern a buyer should stop at? null when not labelled. */
  label: "scam" | "honest" | null;
  /** Which guidance the scam label rests on (ic3, ftc, nicb, …), when given. */
  basis?: string;
  /** ad: a listing's text. page: a whole pasted page. reply: a seller's message. */
  kind: "ad" | "page" | "reply";
  /** The exact answers the listing reader must give (from listing corpus cases). */
  fields?: Record<string, unknown>;
  /** For a reply: the ad it answers. */
  context?: string;
  text: string;
};

type Labelled = { id: string; origin: "real" | "synthetic"; scam: boolean; basis?: string; text: string };
export type CorpusRow = { id: string; origin: "real" | "synthetic"; scam?: boolean; fields: Record<string, unknown>; text: string };

const label = (scam: boolean | undefined): DatasetRow["label"] => (scam === undefined ? null : scam ? "scam" : "honest");
/** Line endings don't change meaning; keep the file the same on every OS. */
const clean = (t: string) => t.replace(/\r\n?/g, "\n").trimEnd();

export function buildDataset(input: { tuning: Labelled[]; heldOut: Labelled[]; replies: { ad: string; cases: { id: string; scam: boolean; text: string }[] }; corpus: CorpusRow[] }): DatasetRow[] {
  return [
    ...input.tuning.map((c): DatasetRow => ({ id: c.id, set: "tuning", origin: c.origin, label: label(c.scam), ...(c.basis ? { basis: c.basis } : {}), kind: "ad", text: clean(c.text) })),
    ...input.corpus.map((c): DatasetRow => ({
      id: `corpus/${c.id}`, set: c.scam === undefined ? "fields-only" : "tuning", origin: c.origin, label: label(c.scam), kind: "page", fields: c.fields, text: clean(c.text),
    })),
    ...input.heldOut.map((c): DatasetRow => ({ id: c.id, set: "held-out", origin: c.origin, label: label(c.scam), ...(c.basis ? { basis: c.basis } : {}), kind: "ad", text: clean(c.text) })),
    ...input.replies.cases.map((c): DatasetRow => ({ id: c.id, set: "reply", origin: "synthetic", label: label(c.scam), kind: "reply", context: clean(input.replies.ad), text: clean(c.text) })),
  ];
}

export const toJsonl = (rows: DatasetRow[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
