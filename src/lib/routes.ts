// Main navigation, in the order of PLAN.md §11. Login and Car detail are
// reached from other pages, so they are not in the nav.
export const NAV_ROUTES = [
  { href: "/", label: "Check a listing" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/search", label: "Search" },
  { href: "/checked", label: "Checked cars" },
  { href: "/compare", label: "Compare" },
  { href: "/settings", label: "Settings" },
] as const;
