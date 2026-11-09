"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOGIN_PATH, MFA_PATH } from "@/lib/auth/validate";
import { GUEST_ROUTES, NAV_ROUTES } from "@/lib/routes";

// Plain text links; the current page is underlined, like most well-made sites.
const base = "whitespace-nowrap py-1 text-[0.95rem] underline-offset-[6px] decoration-2 transition-colors";
const idle = "text-muted hover:text-foreground";
const active = "font-semibold text-foreground underline decoration-accent";

/** Nav links with the current page highlighted. Hidden on the two login pages. */
export function NavLinks({ owner }: { owner: boolean }) {
  const pathname = usePathname();
  if (pathname === LOGIN_PATH || pathname === MFA_PATH) return null;
  return <LinkList owner={owner} isActive={(href) => (href === "/" ? pathname === "/" : pathname.startsWith(href))} />;
}

/** Same links with no highlight: the Suspense fallback while the path or login is unknown. */
export function NavLinksStatic({ owner = false }: { owner?: boolean }) {
  return <LinkList owner={owner} isActive={() => false} />;
}

function LinkList({ owner, isActive }: { owner: boolean; isActive: (href: string) => boolean }) {
  return (
    <ul className="flex gap-5 sm:justify-center">
      {(owner ? NAV_ROUTES : GUEST_ROUTES).map(({ href, label }) => {
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
