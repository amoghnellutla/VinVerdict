import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <>
      <PageHeader title="Compare" phase="Phase 8" description="Put 2–3 saved cars side by side." />
      <EmptyState title="Nothing to compare yet">
        Pick cars from Checked cars to compare their score, price, miles and checks.
      </EmptyState>
    </>
  );
}
