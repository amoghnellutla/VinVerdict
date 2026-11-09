"use client";

import { CopyButton } from "@/components/CopyButton";
import { sellerMessage, type MessageInput } from "@/lib/seller-message";

/** A ready-to-send message with the questions this car still needs answered. */
export function SellerMessage(props: MessageInput) {
  const text = sellerMessage(props);
  return (
    <div className="mt-6">
      <h3 className="font-semibold">Message to send first</h3>
      <p className="mt-1 text-sm text-muted">Built from what this check found. It updates as you record answers above.</p>
      <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-surface px-4 py-3 font-sans text-[0.95rem]">{text}</pre>
      <div className="mt-2">
        <CopyButton text={text} label="Copy message" />
      </div>
    </div>
  );
}
