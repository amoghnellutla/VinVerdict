import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavLinksStatic } from "./NavLinks";

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-foreground">
              VV
            </span>
            <span>
              Vin<span className="text-accent">Verdict</span>
            </span>
          </Link>
          <Link href="/login" className="text-sm text-muted hover:text-foreground sm:hidden">
            Log in
          </Link>
        </div>
        {/* The link row scrolls sideways on its own on small screens; the page itself never does. */}
        <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {/* usePathname needs Suspense on routes with unknown params (e.g. /car/[id]). */}
          <Suspense fallback={<NavLinksStatic />}>
            <NavLinks />
          </Suspense>
        </nav>
        <Link href="/login" className="hidden text-sm text-muted hover:text-foreground sm:block">
          Log in
        </Link>
      </div>
    </header>
  );
}
