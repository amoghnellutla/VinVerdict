/**
 * A PDF stores text as positioned pieces, not lines. This puts them back into the lines a person sees: pieces at
 * the same height (within a few points) form a line, read left to right, and a wide gap between pieces becomes
 * a few spaces (so "Doc Fee" and "$799.00" in two columns stay one line: "Doc Fee    $799.00"). Pure, so it's
 * tested without a browser.
 */

export type PdfPiece = { str: string; x: number; y: number; width: number; height: number };

export function linesFromPieces(pieces: PdfPiece[]): string[] {
  const items = pieces.filter((p) => p.str.trim());
  if (!items.length) return [];
  // Top of the page first (PDF y grows upwards).
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfPiece[][] = [];
  for (const p of sorted) {
    const tol = Math.max(2, (p.height || 10) * 0.45);
    const row = rows.find((r) => Math.abs(r[0].y - p.y) <= tol);
    if (row) row.push(p);
    else rows.push([p]);
  }
  return rows
    .sort((a, b) => b[0].y - a[0].y)
    .map((row) => {
      row.sort((a, b) => a.x - b.x);
      let out = "";
      let end = -Infinity;
      for (const p of row) {
        const gap = p.x - end;
        const size = p.height || 10;
        out += out ? (gap > size * 1.5 ? "    " : gap > size * 0.15 ? " " : "") : "";
        out += p.str;
        end = p.x + p.width;
      }
      return out.replace(/\s+$/, "");
    });
}
