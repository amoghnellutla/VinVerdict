import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Car detail" };

// With Cache Components, a param with no generateStaticParams is runtime data,
// so it is read inside Suspense and the rest of the page stays prerendered.
export default function CarDetailPage({ params }: PageProps<"/car/[id]">) {
  return (
    <>
      <PageHeader
        title="Car detail"
        phase="Phase 5"
        description="Photos, score breakdown, comps, recalls, crash stars, known issues, seller checklist, buyer protection and the source link."
      />
      <EmptyState title="Car">
        <Suspense fallback={<span>Loading…</span>}>
          {params.then(({ id }) => (
            <span>
              Details for car <code className="font-mono text-foreground">{id}</code> will appear here.
            </span>
          ))}
        </Suspense>
      </EmptyState>
    </>
  );
}
