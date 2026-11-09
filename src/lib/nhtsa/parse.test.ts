import { describe, expect, it } from "vitest";
import {
  classifyTransmission,
  parseNhtsaDate,
  parseRatingDetail,
  parseRatingVariants,
  parseRecalls,
  parseVinDecode,
  summarizeComplaints,
} from "./parse";

// Fixtures are trimmed copies of real responses saved by tools/probe_nhtsa.py
// on 2026-11-08 for a 2017 Honda Accord EX-L.

describe("classifyTransmission", () => {
  it.each([
    ["Continuously Variable Transmission (CVT)", "automatic"],
    ["Automatic", "automatic"],
    ["6-speed automatic", "automatic"],
    ["Dual-Clutch Transmission (DCT)", "automatic"],
    ["Automated Manual Transmission (AMT)", "automatic"],
    ["Manual/Standard", "manual"],
    ["6-speed manual", "manual"],
    ["stick shift", "manual"],
    ["", "unknown"],
    [null, "unknown"],
  ])("%s → %s", (input, expected) => {
    expect(classifyTransmission(input)).toBe(expected);
  });
});

describe("parseVinDecode", () => {
  const body = {
    Results: [
      {
        ErrorCode: "0",
        ErrorText: "0 - VIN decoded clean. Check Digit (9th position) is correct",
        ModelYear: "2017", Make: "HONDA", Model: "Accord", Trim: "EX-L", Series: "",
        BodyClass: "Sedan/Saloon", DriveType: "4x2",
        TransmissionStyle: "Continuously Variable Transmission (CVT)", FuelTypePrimary: "Gasoline",
      },
    ],
  };

  it("parses a clean decode", () => {
    const d = parseVinDecode("1HGCR2F8XHA000123", body);
    expect(d).toMatchObject({
      year: 2017, make: "HONDA", model: "Accord", trim: "EX-L",
      transmissionKind: "automatic", errorCode: "0", clean: true,
    });
  });

  it("marks a bad check digit as not clean", () => {
    const d = parseVinDecode("X", {
      Results: [{ ...body.Results[0], ErrorCode: "1", ErrorText: "1 - Check Digit (9th position) does not calculate properly" }],
    });
    expect(d.clean).toBe(false);
    expect(d.errorCode).toBe("1");
  });

  it("uses the first of several error codes and blanks empty fields", () => {
    const d = parseVinDecode("X", { Results: [{ ErrorCode: "1,400", ModelYear: "", Make: "", Trim: "", Series: "LX" }] });
    expect(d.errorCode).toBe("1");
    expect(d.year).toBeNull();
    expect(d.make).toBeNull();
    expect(d.trim).toBe("LX");
  });

  it("throws on an empty response", () => {
    expect(() => parseVinDecode("X", {})).toThrow();
  });
});

describe("recalls", () => {
  it("converts DD/MM/YYYY dates", () => {
    expect(parseNhtsaDate("29/01/2019")).toBe("2019-01-29");
    expect(parseNhtsaDate("2019-01-29")).toBeNull();
  });

  it("parses and sorts newest first", () => {
    const recalls = parseRecalls({
      Count: 2,
      results: [
        { NHTSACampaignNumber: "19V060000", Component: "FUEL SYSTEM", ReportReceivedDate: "29/01/2019", parkIt: false, parkOutSide: false },
        { NHTSACampaignNumber: "26V332000", Component: "AIR BAGS", ReportReceivedDate: "12/05/2026", parkIt: true, parkOutSide: false },
      ],
    });
    expect(recalls.map((r) => r.campaign)).toEqual(["26V332000", "19V060000"]);
    expect(recalls[0].parkIt).toBe(true);
  });

  it("handles no results", () => {
    expect(parseRecalls({ Count: 0, results: [] })).toEqual([]);
    expect(parseRecalls(null)).toEqual([]);
  });
});

describe("safety ratings", () => {
  it("parses variants and details, treating 'Not Rated' as null", () => {
    expect(parseRatingVariants({ Results: [{ VehicleDescription: "2017 Honda Accord 4 DR FWD", VehicleId: 11042 }] })).toEqual([
      { vehicleId: 11042, description: "2017 Honda Accord 4 DR FWD" },
    ]);
    const r = parseRatingDetail({
      Results: [{ VehicleId: 11042, VehicleDescription: "2017 Honda Accord 4 DR FWD", OverallRating: "5",
        OverallFrontCrashRating: "4", OverallSideCrashRating: "5", RolloverRating: "Not Rated" }],
    });
    expect(r).toEqual({ vehicleId: 11042, description: "2017 Honda Accord 4 DR FWD", overall: 5, front: 4, side: 5, rollover: null });
    expect(parseRatingDetail({ Results: [] })).toBeNull();
  });
});

describe("summarizeComplaints", () => {
  it("counts components (split on commas), crashes and injuries", () => {
    const s = summarizeComplaints({
      count: 3,
      results: [
        { components: "ELECTRICAL SYSTEM", crash: false, fire: false, numberOfInjuries: 0, numberOfDeaths: 0 },
        { components: "ELECTRICAL SYSTEM,ENGINE", crash: true, fire: false, numberOfInjuries: 2, numberOfDeaths: 0 },
        { components: "UNKNOWN OR OTHER", crash: false, fire: true, numberOfInjuries: 0, numberOfDeaths: 0 },
      ],
    });
    expect(s).toEqual({
      total: 3, crashes: 1, fires: 1, injuries: 2, deaths: 0,
      topComponents: [
        { component: "ELECTRICAL SYSTEM", count: 2 },
        { component: "ENGINE", count: 1 },
      ],
    });
  });
});
