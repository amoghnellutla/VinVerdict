import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { MyList } from "./MyList";

export const metadata: Metadata = { title: "My list" };

export default function MinePage() {
  return (
    <>
      <PageHeader
        title="My list"
        description="The cars you're considering, saved on this device. Compare them side by side, keep notes on what each seller said, and check them again."
      />
      <MyList />
    </>
  );
}
