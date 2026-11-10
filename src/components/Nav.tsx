import Link from "next/link";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth/session";
import { NavLinks, NavLinksStatic } from "./NavLinks";
import { SignOutButton } from "./SignOutButton";

export function Nav() {
  return (
    <header className="border-b border-border bg-background">
      <Suspense fallback={<Bar links={<NavLinksStatic />} account={null} />}>
        <ForViewer />
      </Suspense>
    </header>
  );
}

/** The owner gets every page and Sign out; demo visitors get the public pages and "Owner login". */
async function ForViewer() {
  const owner = Boolean(await currentUser());
  const account = owner ? (
    <SignOutButton />
  ) : (
    <Link href="/login" className="inline-block py-1.5 text-sm text-muted hover:text-foreground">
      Owner login
    </Link>
  );
  return (
    <Bar
      // usePathname needs Suspense on routes with unknown params (e.g. /car/[id]).
      links={<Suspense fallback={<NavLinksStatic owner={owner} />}><NavLinks owner={owner} /></Suspense>}
      account={account}
    />
  );
}

function Bar({ links, account }: { links: React.ReactNode; account: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-baseline sm:justify-between">
      <div className="flex items-baseline justify-between gap-4">
        <Link href="/" className="font-serif text-xl font-bold tracking-tight text-foreground no-underline">
          VinVerdict
        </Link>
        <div className="sm:hidden">{account}</div>
      </div>
      {/* The link row scrolls sideways on its own on small screens; the page itself never does. */}
      <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:flex-1 sm:px-0">
        {links}
      </nav>
      <div className="hidden sm:block">{account}</div>
    </div>
  );
}
