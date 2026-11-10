"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import { SCAM_AD, scamAdText } from "@/lib/demo/scam-ad";
import { parseListing } from "@/lib/listing/parse";
import { evaluateScamRules, type RuleHit } from "@/lib/scam/rules";
import { RULE_SOURCE } from "@/lib/sources";
import { fmt } from "@/lib/value/estimate";

/**
 * A made-up marketplace ad with five scam tells and an impossible price.
 * Click what looks wrong: each find shows VinVerdict's real rule for it and
 * the official source. Find them all and the verdict lands.
 */
export function ScamSpotter({ fair, onCheckOwn }: { fair: number | null; onCheckOwn: () => void }) {
  // The real rules, run on the ad (with the real market price for this car).
  const hits = useMemo(() => {
    const text = scamAdText();
    const r = evaluateScamRules({ text, listing: parseListing(text), valuePct: fair ? (fair - SCAM_AD.price) / fair : null });
    return new Map<string, RuleHit>(r.hits.map((h) => [h.id, h]));
  }, [fair]);
  const targets = [...SCAM_AD.parts.filter((p) => p.rule).map((p) => p.rule!), ...(fair ? [SCAM_AD.priceRule] : [])];
  const [found, setFound] = useState<string[]>([]);
  const [miss, setMiss] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const done = found.length === targets.length;

  const find = (id: string) => {
    setLast(id);
    if (!found.includes(id)) setFound((f) => [...f, id]);
  };
  const flag = (id: string) => {
    const h = hits.get(id);
    return h ? { title: h.title, reason: h.reason, source: RULE_SOURCE[id] } : null;
  };
  const shown = last ? flag(last) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      {/* The ad */}
      <div className="relative rounded-xl border border-border bg-surface p-5">
        <p className="flex items-center gap-3">
          <span aria-hidden className="grid size-10 place-items-center rounded-full bg-surface-muted font-bold text-muted">JR</span>
          <span>
            <span className="block font-semibold">{SCAM_AD.seller}</span>
            <span className="block text-sm text-muted">Practice ad, made up for this game</span>
          </span>
        </p>
        <h3 className="mt-4 text-2xl">{SCAM_AD.title}</h3>
        <button
          type="button"
          onClick={() => (fair ? find(SCAM_AD.priceRule) : undefined)}
          className={`nums mt-1 rounded px-1 text-3xl font-extrabold transition-colors ${found.includes(SCAM_AD.priceRule) ? "bg-bad-soft text-bad line-through decoration-2" : "hover:bg-surface-muted"}`}
          aria-label={`Price ${fmt(SCAM_AD.price)}${found.includes(SCAM_AD.priceRule) ? ", flagged" : ""}`}
        >
          {fmt(SCAM_AD.price)}
        </button>
        {/*
          Every phrase is clickable the same way and flows like normal text, so the
          layout doesn't give away which ones are flagged. Innocent ones say "that part's fine".
        */}
        <p className="mt-3 text-[1.05rem] leading-relaxed">
          {SCAM_AD.parts.map((p, i) => {
            const hit = p.rule && found.includes(p.rule);
            const act = () => {
              if (p.rule) return find(p.rule);
              setMiss((m) => m + 1);
              setLast(null);
            };
            return (
              <span
                key={i}
                role="button"
                tabIndex={0}
                onClick={act}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    act();
                  }
                }}
                className={`cursor-pointer rounded px-0.5 transition-colors focus-visible:outline-2 ${hit ? "bg-bad-soft text-bad underline decoration-bad decoration-2 underline-offset-4" : "hover:bg-surface-muted"}`}
              >
                {p.text}
              </span>
            );
          })}
        </p>
        {done && (
          <span aria-hidden className="stamp pointer-events-none absolute top-[5.5rem] right-4 rounded-lg border-4 border-bad px-4 py-1 text-3xl font-extrabold text-bad">
            Walk away
          </span>
        )}
      </div>

      {/* What you found */}
      <div>
        <p className="text-lg font-bold">
          Found {found.length} of {targets.length}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {targets.map((t) => (
            <span key={t} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${found.includes(t) ? "bg-bad" : "bg-surface-muted"}`} />
          ))}
        </div>
        <div aria-live="polite" className="mt-4 min-h-40">
          {shown ? (
            <div key={last} className="pop rounded-lg border-l-4 border-l-bad bg-bad-soft px-4 py-3">
              <p className="font-bold text-bad">{shown.title}</p>
              <p className="mt-1 text-[0.95rem]">{shown.reason}</p>
              {shown.source && (
                <p className="mt-1 text-sm">
                  Source: <ExternalLink href={shown.source.href}>{shown.source.name}</ExternalLink>
                </p>
              )}
            </div>
          ) : done ? null : (
            <p key={miss} className={`text-muted ${miss ? "nudge" : ""}`}>
              {miss ? "That part's fine. Keep looking." : "Click anything in the ad that looks wrong. Some of it is perfectly normal."}
            </p>
          )}
          {done && (
            <p className="pop mt-3">
              That&apos;s all of them. Every one is a check VinVerdict runs on a real ad
              {fair ? `, and the price is ${Math.round(((fair - SCAM_AD.price) / fair) * 100)}% under what a 2019 Civic sells for nearby (${fmt(fair)})` : ""}.{" "}
            </p>
          )}
          {done && (
            <p className="pop mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" onClick={onCheckOwn}>
                Now check your own listing
              </button>
              <button
                type="button"
                className="link text-sm"
                onClick={() => {
                  setFound([]);
                  setLast(null);
                  setMiss(0);
                }}
              >
                Play again
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
