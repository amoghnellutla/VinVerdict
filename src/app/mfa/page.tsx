import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { currentLogin } from "@/lib/auth/session";
import { LOGIN_PATH } from "@/lib/auth/validate";
import { createSupabase } from "@/lib/supabase/server";
import { MfaForm } from "./MfaForm";

export const metadata: Metadata = { title: "Two-step login" };

/** Second login step: an authenticator code (set up on first login). */
export default function MfaPage({ searchParams }: PageProps<"/mfa">) {
  return (
    <div className="mx-auto max-w-md">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        {searchParams.then((sp) => <Step next={typeof sp.next === "string" ? sp.next : null} />)}
      </Suspense>
    </div>
  );
}

async function Step({ next }: { next: string | null }) {
  const login = await currentLogin();
  if (!login) redirect(LOGIN_PATH);
  const supabase = await createSupabase();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    console.error("listFactors failed", error.status ?? "", error.code ?? "");
    return <p role="alert" className="text-bad">Couldn&apos;t reach the login service. Reload the page in a moment.</p>;
  }
  const factor = data.totp[0] ?? null;
  return (
    <>
      <PageHeader
        title={factor ? "Enter your code" : "Set up two-step login"}
        description={
          factor
            ? "Open your authenticator app and enter the 6-digit code for VinVerdict."
            : "Once, on your first login: link an authenticator app, so a stolen password alone can't get in."
        }
      />
      {/* next is checked again on the server (safeNext) before redirecting */}
      <MfaForm factorId={factor?.id ?? null} next={next} />
    </>
  );
}
