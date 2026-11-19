"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { guideModelFor } from "@/lib/shortlist/mine";
import type { ShortlistModel } from "@/lib/shortlist/shortlist";
import { parseWorkspace, WORKSPACE_KEY, type SavedCar } from "@/lib/workspace/local";
import { CarYearCard } from "./CarYearCard";

// The visitor's list lives in this browser; re-read it when this or another tab changes it.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("vv-workspace", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("vv-workspace", onChange);
  };
}
function snapshot(): string {
  try {
    return localStorage.getItem(WORKSPACE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Year, make and model: from what the visitor confirmed, or (for cars saved before that) read off the title. */
export function ymmOf(c: SavedCar): { year: number | null; make: string | null; model: string | null } {
  if (c.details && (c.details.make || c.details.model)) return { year: c.details.year, make: c.details.make, model: c.details.model };
  const m = /^(\d{4})\s+(\S+)\s+(.+)$/.exec(c.title);
  return m ? { year: Number(m[1]), make: m[2], model: m[3] } : { year: null, make: null, model: null };
}

/**
 * A visitor's Shortlist: one card per car on My list (this device), the same cards the owner gets, with the full
 * guide below. Nothing leaves the device: the guide's data comes from the page, the cars from this browser.
 */
export function DeviceShortlist({ models }: { models: ShortlistModel[] }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const cars = useMemo(() => {
    if (raw === null) return null;
    try {
      return raw ? parseWorkspace(JSON.parse(raw)).cars : [];
    } catch {
      return [];
    }
  }, [raw]);
  if (cars === null) return null;
  if (!cars.length) {
    return (
      <p className="mb-10 max-w-2xl text-muted">
        Save cars to <Link href="/mine" className="link">My list</Link> after checking them, and each one shows up here with how its model year rates and the
        better years to look at.
      </p>
    );
  }
  return (
    <section className="mb-12" aria-label="Your saved cars">
      <h2 className="section-title">Your saved cars</h2>
      <ul className="space-y-5">
        {cars.map((c) => {
          const ymm = ymmOf(c);
          return (
            <CarYearCard
              key={c.id}
              car={{
                id: c.id,
                href: "/mine",
                title: c.title,
                price: c.price,
                miles: c.miles,
                vin: c.vin,
                facts: { ...ymm, mpg: c.details?.mpg ?? null, powertrain: c.details?.powertrain ?? null, title: c.details?.titleStatus, accident: c.details?.accident },
              }}
              model={guideModelFor(models, ymm)}
            />
          );
        })}
      </ul>
    </section>
  );
}
