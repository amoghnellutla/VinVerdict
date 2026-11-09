"use client";

import { useState } from "react";

/** Copies plain text and says so for a moment. */
export function CopyButton({ text, label = "Copy", className = "btn btn-secondary" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "done" ? "Copied" : state === "failed" ? "Select and copy it instead" : label}
    </button>
  );
}
