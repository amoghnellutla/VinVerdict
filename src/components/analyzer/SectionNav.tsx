"use client";

import { useEffect, useState } from "react";

/** A sticky row of the result's sections; the one in view is underlined. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const key = items.map((i) => i.id).join(",");

  useEffect(() => {
    const els = key.split(",").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    // The section crossing a line just under the bar is the current one.
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-72px 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]);

  return (
    <nav aria-label="Result sections" className="sticky top-0 z-20 -mx-4 border-b border-border bg-background px-4 print:hidden">
      <ul className="flex gap-5 overflow-x-auto text-sm whitespace-nowrap">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "true" : undefined}
              className={`block border-b-2 py-3 transition-colors ${active === i.id ? "border-accent font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
