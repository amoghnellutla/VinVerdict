/**
 * The words real dealer papers use for their lines (buyer's orders, retail installment contracts, lease forms), each
 * with what it is. Order matters in the reader's rules ("finance charge", "contract", a note in brackets), so a change
 * that misfiles one shows up here.
 */

import { describe, expect, it } from "vitest";
import { classify } from "./parse";
import { LABELED_NAMES } from "./vocabulary";

describe("the words real dealer papers use", () => {
  it.each(LABELED_NAMES)("%s is %s", (label, kind) => {
    expect(classify(label).kind).toBe(kind);
  });
});
