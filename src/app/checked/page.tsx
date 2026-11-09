import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Checked cars" };

export default function CheckedCarsPage() {
  return (
    <>
      <PageHeader
        title="Checked cars"
        phase="Phase 8"
        description="Every car you've analyzed or saved, with its price-drop history."
      />
      <EmptyState title="No cars yet">Cars you check on the home page will be saved here, each with its source link.</EmptyState>
    </>
  );
}
