import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Shortlist" };

export default function ShortlistPage() {
  return (
    <>
      <PageHeader
        title="Shortlist"
        phase="Phase 6"
        description="Reliable models and years for your budget, each with a one-click search."
      />
      <EmptyState title="Reliability picks">
        Recommended Toyota, Honda and similar models by year, built from Consumer Reports and iSeeCars picks plus NHTSA
        complaint counts.
      </EmptyState>
    </>
  );
}
