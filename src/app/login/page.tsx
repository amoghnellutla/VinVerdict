import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Log in" };

const input =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title="Log in" phase="Phase 2b" description="Email and password, handled by Supabase." />
      {/* UI preview only: no action until Supabase login is wired up. */}
      <form className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" disabled className={input} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            disabled
            className={input}
          />
        </div>
        <button
          type="button"
          disabled
          className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground opacity-50"
        >
          Log in
        </button>
      </form>
    </div>
  );
}
