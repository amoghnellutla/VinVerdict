import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Search" };

/**
 * In-app search is hidden (Amogh, 2026-11-19): the owner's Shortlist, with ready-made searches of outside sites for
 * the models they've checked, replaces it. The code is kept (components/search/SearchForm, app/actions/search,
 * lib/search) so it can come back by restoring this page and its nav link; an old link to /search lands on the
 * Shortlist.
 */
export default function SearchPage() {
  redirect("/shortlist");
}
