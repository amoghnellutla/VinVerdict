import { describe, expect, it } from "vitest";
import { STATES, zipToState } from "./zip";

describe("zipToState", () => {
  it.each([
    ["07030", "NJ"], // Hoboken
    ["08540", "NJ"], // Princeton
    ["10001", "NY"],
    ["00501", "NY"], // Holtsville
    ["02108", "MA"],
    ["05501", "MA"], // Andover, inside VT's range
    ["05401", "VT"],
    ["19104", "PA"],
    ["19801", "DE"],
    ["20001", "DC"],
    ["20166", "VA"], // Dulles
    ["21201", "MD"],
    ["30301", "GA"],
    ["39901", "GA"],
    ["33101", "FL"],
    ["60601", "IL"],
    ["73301", "TX"], // Austin IRS, inside OK's range
    ["73102", "OK"],
    ["75201", "TX"],
    ["79901", "TX"], // El Paso
    ["88510", "TX"],
    ["87501", "NM"],
    ["89101", "NV"],
    ["90210", "CA"],
    ["96813", "HI"],
    ["97201", "OR"],
    ["98101", "WA"],
    ["99501", "AK"],
    ["07030-1234", "NJ"],
    [" 07030 ", "NJ"],
  ])("%s → %s", (zip, st) => expect(zipToState(zip)).toBe(st));

  it("rejects territories, military, unassigned and junk", () => {
    for (const z of ["00901", "00801", "34001", "09001", "96201", "96910", "71301x", "7030", "abcde", "", "071234"]) {
      expect(zipToState(z), z).toBeNull();
    }
  });

  it("knows 50 states + DC", () => {
    expect(Object.keys(STATES)).toHaveLength(51);
  });
});
