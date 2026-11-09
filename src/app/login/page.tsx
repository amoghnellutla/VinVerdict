import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LoginForm, LoginFormWithNext } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title="Log in" description="VinVerdict is private for now." />
      <Suspense fallback={<LoginForm next={null} />}>
        <LoginFormWithNext />
      </Suspense>
    </div>
  );
}
