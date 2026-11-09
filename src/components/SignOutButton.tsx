"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { LOGIN_PATH, MFA_PATH } from "@/lib/auth/validate";

/** Every page except /login needs a login, so the nav offers Sign out everywhere else. */
export function SignOutButton({ className }: { className?: string }) {
  if ([LOGIN_PATH, MFA_PATH].includes(usePathname())) return null;
  return (
    <form action={signOutAction}>
      <button type="submit" className={`text-sm text-muted hover:text-foreground ${className ?? ""}`}>
        Sign out
      </button>
    </form>
  );
}
