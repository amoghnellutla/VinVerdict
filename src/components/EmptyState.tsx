import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

/** Placeholder for a section that isn't built yet. */
export function EmptyState({ title, children }: Props) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6">
      <h2 className="text-lg">{title}</h2>
      <div className="mt-2 text-muted">{children}</div>
    </div>
  );
}
