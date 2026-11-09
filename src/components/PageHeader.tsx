import type { ReactNode } from "react";

type Props = {
  title: string;
  description: ReactNode;
  /** Build phase that brings this page to life, e.g. "Phase 3". */
  phase?: string;
};

export function PageHeader({ title, description, phase }: Props) {
  return (
    <div className="mb-8">
      {phase && (
        <p className="mb-2 inline-block rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
          Coming in {phase}
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{description}</p>
    </div>
  );
}
