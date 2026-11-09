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

/** Demo visitors (no login) see only the public pages. */
export const GUEST_ROUTES = [
  { href: "/", label: "Check a car" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/security", label: "How it's secured" },
] as const;
