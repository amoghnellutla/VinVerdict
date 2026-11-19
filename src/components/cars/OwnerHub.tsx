import Link from "next/link";
import type { ReactNode } from "react";
import { OWNER_TABS, type OwnerTab } from "@/lib/routes";

/**
 * The header of the owner's "My cars" hub: one title for the whole area, what this tab is for, and the tabs
 * (Cars, Shortlist, Compare, Settings). Plain links, so every tab has its own address and works without JavaScript.
 */
export function OwnerHub({ active, description }: { active: OwnerTab; description: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl sm:text-[2.5rem]">My cars</h1>
      <nav aria-label="My cars" className="mt-5 border-b border-border">
        <ul className="-mb-px flex gap-6 overflow-x-auto">
          {OWNER_TABS.map((t) => {
            const on = t.href === active;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={`inline-block whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[0.95rem] transition-colors ${on ? "border-accent font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="mt-4 max-w-2xl text-lg text-muted">{description}</p>
    </div>
  );
}
