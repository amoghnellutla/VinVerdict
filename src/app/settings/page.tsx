import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        phase="Phase 8"
        description="Score weights, expected life miles, default ZIP and the black-only toggle."
      />
      <EmptyState title="Defaults">
        Value % 35 · Price per remaining mile 20 · Reliability 15 · Safety 10 · Preferences 10 · Buyer protection 5 ·
        Freshness 5. Expected life: 200,000 miles.
      </EmptyState>
    </>
  );
}
