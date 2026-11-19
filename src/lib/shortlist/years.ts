/** The model years the Shortlist data covers (tools/build_shortlist.py YEARS; checked against data.json by a test).
 * Kept apart from the data so client code can say it without loading the data. */
export const SHORTLIST_YEARS = { from: 2010, to: 2025 } as const;
