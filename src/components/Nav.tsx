import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavLinksStatic } from "./NavLinks";
import { SignOutButton } from "./SignOutButton";

export function Nav() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-baseline justify-between gap-4">
          <Link href="/" className="font-serif text-xl font-bold tracking-tight text-foreground no-underline">
            VinVerdict
          </Link>
          <div className="sm:hidden">
            <Suspense fallback={null}>
              <SignOutButton />
            </Suspense>
          </div>
        </div>
        {/* The link row scrolls sideways on its own on small screens; the page itself never does. */}
        <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:flex-1 sm:px-0">
          {/* usePathname needs Suspense on routes with unknown params (e.g. /car/[id]). */}
          <Suspense fallback={<NavLinksStatic />}>
            <NavLinks />
          </Suspense>
        </nav>
        <div className="hidden sm:block">
          <Suspense fallback={null}>
            <SignOutButton />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
