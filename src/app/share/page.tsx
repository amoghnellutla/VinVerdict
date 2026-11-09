import type { Metadata } from "next";
import { ShareHandoff } from "./ShareHandoff";

export const metadata: Metadata = { title: "Checking…" };

/** Android "Share → VinVerdict" lands here (see app/manifest.ts). */
export default function SharePage() {
  return (
    <>
      <p className="text-lg">Opening the checker…</p>
      <ShareHandoff />
    </>
  );
}
