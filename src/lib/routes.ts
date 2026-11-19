// Main navigation. Login and Car detail are reached from other pages, so they
// are not in the nav. Labels are short so the row fits on one line.

export type Route = { href: string; label: string; /** Other paths that belong to this item (the "My cars" hub). */ match?: readonly string[] };

/**
 * The owner (two-step login). Everything about the owner's own cars lives in one "My cars" hub (its tabs are
 * OWNER_TABS), so the top row stays short. Search is hidden (its code is kept): the Shortlist's links search
 * outside sites instead.
 */
export const NAV_ROUTES: readonly Route[] = [
  { href: "/", label: "Check a car" },
  { href: "/deal", label: "Deal check" },
  { href: "/checked", label: "My cars", match: ["/checked", "/shortlist", "/compare", "/settings", "/car/"] },
];

/** The tabs of the owner's "My cars" hub. */
export const OWNER_TABS = [
  { href: "/checked", label: "Cars" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/compare", label: "Compare" },
  { href: "/settings", label: "Settings" },
] as const;

export type OwnerTab = (typeof OWNER_TABS)[number]["href"];

/**
 * Demo visitors (no login) see only the public pages; "How it's secured" is in the footer.
 * The car guide (/cars) is linked from the footer, not here: it's a reference of every model's
 * engines and fuel cost, not part of checking a listing.
 */
export const GUEST_ROUTES: readonly Route[] = [
  { href: "/", label: "Check a car" },
  { href: "/mine", label: "My list" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/deal", label: "Deal check" },
  { href: "/why", label: "Why not Google?" },
];

/** Whether a nav item is the current page: "/" only on the home page; others by their path (or the paths they cover). */
export function isActiveRoute(route: Route, pathname: string): boolean {
  if (route.href === "/") return pathname === "/";
  return (route.match ?? [route.href]).some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || pathname.startsWith(`${p}?`));
}
