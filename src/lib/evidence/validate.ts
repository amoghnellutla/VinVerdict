import type { SavedProof } from "./combine";

const STATUSES = ["good", "bad", "warn", "info"] as const;

/** Check a proof payload sent by the page (server side): a short list of short labels, nothing else. */
export function parseSavedProof(raw: unknown): SavedProof | null {
  if (typeof raw !== "string" || raw.length > 12_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length > 12) return null;
  const out: SavedProof = [];
  for (const item of data) {
    const it = item as { source?: unknown; findings?: unknown };
    if (typeof it?.source !== "string" || it.source.length > 40 || !Array.isArray(it.findings) || it.findings.length > 12) return null;
    const findings: SavedProof[number]["findings"] = [];
    for (const f of it.findings as { label?: unknown; status?: unknown }[]) {
      if (typeof f?.label !== "string" || f.label.length > 160 || !STATUSES.includes(f.status as (typeof STATUSES)[number])) return null;
      findings.push({ label: f.label, status: f.status as (typeof STATUSES)[number] });
    }
    out.push({ source: it.source, findings });
  }
  return out;
}

