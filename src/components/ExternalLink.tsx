import type { AnchorHTMLAttributes } from "react";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> & { href: string };

/**
 * The only way VinVerdict links to another site (PLAN.md §9).
 * Opens a new tab with rel="noopener noreferrer", so the other site can't
 * control this tab or see which page you came from. Allows http(s) URLs
 * only, so a pasted "javascript:" link can never run.
 */
export function ExternalLink({ href, children, className, ...rest }: Props) {
  const safe = /^https?:\/\//i.test(href);
  if (!safe) return <span className={className}>{children}</span>;
  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-accent underline-offset-2 hover:underline"}
    >
      {children}
    </a>
  );
}
