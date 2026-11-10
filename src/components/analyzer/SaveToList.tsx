"use client";

import Link from "next/link";
import { useState } from "react";
import { load, save, upsert, type SavedCar } from "@/lib/workspace/local";

/** Saves this check to "My list" on this device (no account). */
export function SaveToList({ build }: { build: () => SavedCar }) {
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");
  if (state === "saved") {
    return (
      <span role="status">
        Saved. <Link href="/mine" className="link">Open My list</Link>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="link"
      onClick={() => setState(save(upsert(load(), build())) ? "saved" : "failed")}
      title="Keep this car on this device to compare it with others later. Nothing is uploaded."
    >
      {state === "failed" ? "Couldn't save (private window?)" : "Save to My list"}
    </button>
  );
}
