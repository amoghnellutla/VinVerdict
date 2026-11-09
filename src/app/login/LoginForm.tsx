"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signInAction, type SignInState } from "@/app/actions/auth";

const input = "field mt-1";

const initial: SignInState = { error: null };

/** Reads ?next= from the URL (needs a Suspense boundary on a static page). */
export function LoginFormWithNext() {
  return <LoginForm next={useSearchParams().get("next")} />;
}

/** The server checks `next` again (safeNext), so a crafted link can't redirect off-site. */
export function LoginForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="card space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="email" className="font-semibold">
          Email
        </label>
        <input
          key={state.email ?? ""}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.email}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="password" className="font-semibold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className={input}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
