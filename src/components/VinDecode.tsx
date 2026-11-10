import type { CSSProperties } from "react";
import type { DecodedVin } from "@/lib/nhtsa/parse";
import { checkVin } from "@/lib/vin";

type Part = { chars: string; label: string; detail: string };

const cap = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The six parts of a 17-character VIN, labelled from NHTSA's decode (nothing guessed). */
export function vinParts(vin: string, d: DecodedVin | null): Part[] {
  const ok = checkVin(vin).ok;
  const engine = [d?.displacementL ? `${d.displacementL} L` : null, d?.cylinders ? `${d.cylinders}-cylinder` : null].filter(Boolean).join(" ");
  return [
    { chars: vin.slice(0, 3), label: "Maker", detail: d?.make ? cap(d.make) : "World maker code" },
    { chars: vin.slice(3, 8), label: "Model and engine", detail: [d?.model, d?.trim].filter(Boolean).join(" ") + (engine ? `, ${engine}` : "") || "Model, body and engine" },
    { chars: vin.slice(8, 9), label: "Check digit", detail: ok ? "Valid" : "Doesn't add up" },
    { chars: vin.slice(9, 10), label: "Year", detail: d?.year ? String(d.year) : "Model year" },
    { chars: vin.slice(10, 11), label: "Plant", detail: "Factory code" },
    { chars: vin.slice(11), label: "Serial", detail: "This one car" },
  ];
}

/**
 * A VIN set like the stamped plate on a dashboard, each part labelled with
 * what it means. `animate` types it in once (the home page's one moment);
 * reduced motion shows it still.
 */
export function VinDecode({ vin, decoded, animate = false, size = "lg" }: { vin: string; decoded: DecodedVin | null; animate?: boolean; size?: "lg" | "sm" }) {
  const parts = vinParts(vin, decoded);
  let i = 0;
  const big = size === "lg";
  // Columns sized by character count (labels need a little room under one-character parts on wider screens).
  const cols = parts.map((p) => `${p.chars.length}fr`).join(" ");
  const colsWide = parts.map((p) => `${Math.max(p.chars.length, 2.4)}fr`).join(" ");
  return (
    // The characters are sized from this box's own width (container units), so the VIN always fits.
    <figure aria-label={`VIN ${vin}`} className="@container">
      <div
        className={`grid grid-cols-[var(--cols)] sm:grid-cols-[var(--cols-wide)] ${big ? "gap-x-3 gap-y-2 sm:gap-x-5" : "gap-x-2 gap-y-1"}`}
        style={{ "--cols": cols, "--cols-wide": colsWide } as CSSProperties}
      >
        {parts.map((p, pi) => (
          <div key={pi} className="min-w-0">
            <p
              aria-hidden
              className={`font-mono leading-none font-semibold tracking-[0.06em] whitespace-nowrap ${
                big
                  ? "text-[length:min(4.5rem,calc((100cqi-3.75rem)/11.6))] sm:text-[length:min(4.5rem,calc((100cqi-6.25rem)*0.066))]"
                  : "text-[length:min(1.6rem,calc((100cqi-2.5rem)/11.6))] sm:text-[length:min(1.6rem,calc((100cqi-2.5rem)*0.066))]"
              }`}
            >
              {p.chars.split("").map((c) => {
                const n = i++;
                return (
                  <span key={n} className={animate ? "vin-char inline-block" : "inline-block"} style={animate ? { animationDelay: `${120 + n * 38}ms` } : undefined}>
                    {c}
                  </span>
                );
              })}
            </p>
            <span
              aria-hidden
              className={`${animate ? "vin-rule" : ""} mt-2 block h-[3px] rounded-full ${pi === 2 ? (checkVin(vin).ok ? "bg-good" : "bg-bad") : "bg-accent"}`}
              style={animate ? { animationDelay: `${820 + pi * 90}ms` } : undefined}
            />
            {/* Labels sit under their part on wider screens; on phones they're listed below. */}
            <p className={`${animate ? "vin-note" : ""} mt-2 hidden leading-tight sm:block`} style={animate ? { animationDelay: `${980 + pi * 90}ms` } : undefined}>
              <span className={`block font-semibold ${big ? "text-sm" : "text-xs"}`}>{p.label}</span>
              <span className={`block text-muted ${big ? "text-sm" : "text-xs"}`}>{p.detail}</span>
            </p>
          </div>
        ))}
      </div>
      <dl className={`${animate ? "vin-note" : ""} mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:hidden`} style={animate ? { animationDelay: "980ms" } : undefined}>
        {parts.map((p, pi) => (
          <div key={pi}>
            <dt className="font-semibold">
              <span className="font-mono">{p.chars}</span> {p.label.toLowerCase()}
            </dt>
            <dd className="text-muted">{p.detail}</dd>
          </div>
        ))}
      </dl>
      <figcaption className="sr-only">
        {parts.map((p) => `${p.label}: ${p.chars}, ${p.detail}`).join("; ")}
      </figcaption>
    </figure>
  );
}
