import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

/** Placeholder panel for a page section that a later phase fills in. */
export function EmptyState({ title, children }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-6 sm:p-8">
      <h2 className="font-medium">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}
