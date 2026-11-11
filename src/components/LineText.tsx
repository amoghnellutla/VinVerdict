import { ExternalLink } from "@/components/ExternalLink";
import type { Line } from "@/lib/report/text";

/** A line of text and links (lib/report/text.ts) on the page: outside links open safely, "#" links jump to a section. */
export function LineText({ line }: { line: Line }) {
  return (
    <>
      {line.map((s, i) =>
        typeof s === "string" ? (
          <span key={i}>{s}</span>
        ) : s.href.startsWith("#") ? (
          <a key={i} href={s.href} className="link">{s.label}</a>
        ) : (
          <ExternalLink key={i} href={s.href} className="link">{s.label}</ExternalLink>
        ),
      )}
    </>
  );
}
