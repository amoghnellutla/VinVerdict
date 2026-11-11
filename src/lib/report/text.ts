/**
 * Text with links, written once and shown two ways: as page elements and as
 * Markdown in the downloadable report. Pure.
 */

/** A run of plain text, or a link. `href` starting with "#" points to a section of the result page. */
export type Seg = string | { label: string; href: string };
export type Line = Seg[];

const SAFE = /^https:\/\/[^\s<>"'`]+$/i;

/** Plain text for a Markdown table cell or line: no pipes or line breaks that would break the layout. */
export function esc(s: string): string {
  return s.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/** A Markdown link, only for https addresses. Anything else (including page anchors) stays plain text. */
export function mdLink(label: string, href: string): string {
  if (!SAFE.test(href)) return esc(label);
  const safeLabel = esc(label).replace(/[[\]]/g, "");
  // encodeURIComponent leaves brackets alone, and a ")" would end the Markdown link early.
  const safeHref = href.replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `[${safeLabel}](${safeHref})`;
}

/** One line of segments as Markdown. A page anchor reads "label (see the X section)". */
export function lineToMd(line: Line, sections: Record<string, string> = {}): string {
  return line
    .map((s) => {
      if (typeof s === "string") return s;
      if (s.href.startsWith("#")) return sections[s.href] ? `${s.label} (the "${sections[s.href]}" section)` : s.label;
      return mdLink(s.label, s.href);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A fenced block that the quoted text can't break out of: the fence is one
 * backtick longer than the longest run of backticks inside.
 */
export function fence(text: string, info = "text"): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const f = "`".repeat(Math.max(3, longest + 1));
  return `${f}${info}\n${text.replace(/\r\n?/g, "\n").trimEnd()}\n${f}`;
}
