// Main navigation. Login and Car detail are reached from other pages, so they
// are not in the nav. Labels are short so the row fits on one line.

/** The owner (two-step login) sees everything. */
export const NAV_ROUTES = [
  { href: "/", label: "Check a car" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/search", label: "Search" },
  { href: "/checked", label: "My cars" },
  { href: "/compare", label: "Compare" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * Demo visitors (no login) see only the public pages; "How it's secured" is in the footer.
 * The car guide (/cars) is linked from the footer, not here: it's a reference of every model's
 * engines and fuel cost, not part of checking a listing.
 */
export const GUEST_ROUTES = [
  { href: "/", label: "Check a car" },
  { href: "/mine", label: "My list" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/why", label: "Why not Google?" },
] as const;
