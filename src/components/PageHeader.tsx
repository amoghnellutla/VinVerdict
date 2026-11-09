import type { ReactNode } from "react";

type Props = {
  title: string;
  description: ReactNode;
  /** Set on pages that aren't built yet. Shown as a plain "Coming soon" line, never as a build phase. */
  phase?: string;
};

export function PageHeader({ title, description, phase }: Props) {
  return (
    <div className="mb-10">
      {phase && <p className="mb-2 text-sm font-semibold text-accent">Coming soon</p>}
      <h1 className="text-3xl sm:text-[2.5rem]">{title}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">{description}</p>
    </div>
  );
}
