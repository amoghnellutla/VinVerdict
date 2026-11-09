"use client";

import { useActionState } from "react";
import { deleteCarAction, recheckPriceAction, type CarActionState } from "@/app/actions/cars";

const idle: CarActionState = { status: "idle" };

/** "Check for a price drop" and "Remove" on a saved car's page. */
export function CarActions({ id, hasVin }: { id: number; hasVin: boolean }) {
  const [recheck, recheckAction, rechecking] = useActionState(recheckPriceAction, idle);
  const [del, delAction, deleting] = useActionState(deleteCarAction, idle);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {hasVin && (
          <form action={recheckAction}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" disabled={rechecking} className="btn btn-secondary">
              {rechecking ? "Checking…" : "Check for a price drop"}
            </button>
          </form>
        )}
        <form
          action={delAction}
          onSubmit={(e) => {
            if (!window.confirm("Remove this car and its price history?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={deleting} className="btn btn-secondary text-bad">
            {deleting ? "Removing…" : "Remove"}
          </button>
        </form>
      </div>
      {recheck.status !== "idle" && (
        <p role="status" className={recheck.status === "error" ? "text-bad" : "font-semibold"}>
          {recheck.message}
        </p>
      )}
      {del.status === "error" && <p role="alert" className="text-bad">{del.message}</p>}
    </div>
  );
}
