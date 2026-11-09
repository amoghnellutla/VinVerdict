// Main navigation, in the order of PLAN.md §11. Login and Car detail are
// reached from other pages, so they are not in the nav. Labels are short so
// the row fits on one line.
export const NAV_ROUTES = [
  { href: "/", label: "Check a car" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/search", label: "Search" },
  { href: "/checked", label: "My cars" },
  { href: "/compare", label: "Compare" },
  { href: "/settings", label: "Settings" },
] as const;
