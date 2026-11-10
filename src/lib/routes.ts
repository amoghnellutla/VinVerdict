// Main navigation. Login and Car detail are reached from other pages, so they
// are not in the nav. Labels are short so the row fits on one line.

/** The owner (two-step login) sees everything. */
export const NAV_ROUTES = [
  { href: "/", label: "Check a car" },
  { href: "/cars", label: "Car guide" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/search", label: "Search" },
  { href: "/checked", label: "My cars" },
  { href: "/compare", label: "Compare" },
  { href: "/settings", label: "Settings" },
] as const;

/** Demo visitors (no login) see only the public pages. Five fit on one line; "How it's secured" is in the footer. */
export const GUEST_ROUTES = [
  { href: "/", label: "Check a car" },
  { href: "/cars", label: "Car guide" },
  { href: "/mine", label: "My list" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/why", label: "Why not Google?" },
] as const;
