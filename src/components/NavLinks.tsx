"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ROUTES } from "@/lib/routes";

const base = "whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors";
const idle = "text-muted hover:bg-surface-muted hover:text-foreground";
const active = "bg-accent-soft font-medium text-accent";

/** Nav links with the current page highlighted. */
export function NavLinks() {
  const pathname = usePathname();
  return <LinkList isActive={(href) => (href === "/" ? pathname === "/" : pathname.startsWith(href))} />;
}

/** Same links with no highlight: the Suspense fallback while the path is unknown. */
export function NavLinksStatic() {
  return <LinkList isActive={() => false} />;
}

function LinkList({ isActive }: { isActive: (href: string) => boolean }) {
  return (
    <ul className="flex gap-1">
      {NAV_ROUTES.map(({ href, label }) => {
        const on = isActive(href);
        return (
          <li key={href}>
            <Link href={href} aria-current={on ? "page" : undefined} className={`${base} ${on ? active : idle}`}>
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
