"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import type { Analysis } from "@/lib/analyze";
import { buildChecklist, checklistText, type ChecklistItem } from "@/lib/inspection";

/** Feature F: what to ask your mechanic to check, with a copy button. */
export function InspectionList({ a }: { a: Analysis }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const carName = a.vehicle ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}` : "this car";
  const list = useMemo(
    () =>
      buildChecklist({
        year: a.vehicle?.year ?? null,
        make: a.vehicle?.make ?? null,
        model: a.vehicle?.model ?? null,
        displacementL: a.decoded?.displacementL ?? null,
        cvt: /cvt|continuously variable/i.test(a.decoded?.transmission ?? "") || /\bcvt\b/i.test(a.text),
        complaintAreas: a.complaints?.topComponents.map((c) => c.component) ?? [],
      }),
    [a],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(checklistText(carName, list));
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Inspection checklist for your mechanic</h2>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {copied === "done" ? "Copied" : "Copy as text"}
        </button>
      </div>
      {copied === "failed" && <p className="mt-2 text-xs text-bad">Couldn&apos;t copy. Select the list and copy it instead.</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <Group title="Known issues for this model" items={list.known} empty="None on our list for this model and year. The complaint areas still apply." />
        <Group title="Most common owner complaints" items={list.fromComplaints} empty="No complaint data for this car." />
        <Group title="Every used car" items={list.general} />
      </div>
    </section>
  );
}

function Group({ title, items, empty }: { title: string; items: ChecklistItem[]; empty?: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {items.map((i) => (
            <li key={i.title} className="text-sm">
              <span className="font-medium">{i.title}.</span> <span className="text-muted">{i.check}</span>
              {i.source && (
                <span className="block text-xs">
                  <ExternalLink href={i.source.url}>{i.source.label}</ExternalLink>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
