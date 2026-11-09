"use client";

import { useActionState, useState, useTransition } from "react";
import { cancelMfaAction, startEnrollAction, verifyMfaAction, type EnrollState, type VerifyState } from "@/app/actions/mfa";

const initial: VerifyState = { error: null };

/** Code form, plus the one-time QR setup when no authenticator is linked yet. */
export function MfaForm({ factorId, next }: { factorId: string | null; next: string | null }) {
  const [enroll, setEnroll] = useState<EnrollState>({ status: "idle" });
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState(verifyMfaAction, initial);
  const id = factorId ?? (enroll.status === "ready" ? enroll.factorId : null);

  return (
    <div className="card space-y-5">
      {!factorId && (
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            Install an authenticator app on your phone if you don&apos;t have one (Google Authenticator, Microsoft Authenticator, 1Password or
            similar).
          </li>
          <li>
            {enroll.status === "ready" ? (
              <>
                Scan this code with the app:
                {/* Supabase's QR is an SVG data URI; an <img> never runs scripts inside it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enroll.qr} alt="QR code to add VinVerdict to your authenticator app" width={200} height={200} className="mt-2 rounded bg-white p-2" />
                <span className="mt-2 block text-sm text-muted">
                  Can&apos;t scan? Type this key into the app instead:{" "}
                  <code className="font-mono break-all text-foreground">{enroll.secret}</code>
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={starting}
                  onClick={() => startTransition(async () => setEnroll(await startEnrollAction()))}
                >
                  {starting ? "Preparing…" : "Show my QR code"}
                </button>
                {enroll.status === "error" && <span role="alert" className="mt-2 block text-sm text-bad">{enroll.message}</span>}
              </>
            )}
          </li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
      )}

      {id && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="factorId" value={id} />
          {next && <input type="hidden" name="next" value={next} />}
          <label htmlFor="code" className="font-semibold">6-digit code</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 \-]*"
            maxLength={9}
            required
            autoFocus
            className="field nums text-2xl tracking-[0.3em]"
          />
          {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
          <button type="submit" disabled={pending} className="btn btn-primary w-full">
            {pending ? "Checking…" : factorId ? "Continue" : "Finish setup"}
          </button>
        </form>
      )}

      <form action={cancelMfaAction} className="border-t border-border pt-4 text-sm text-muted">
        Not you, or no phone at hand? <button type="submit" className="link">Log out</button>
      </form>
    </div>
  );
}
