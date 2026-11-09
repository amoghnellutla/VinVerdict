import { describe, expect, it } from "vitest";
import {
  classifyTransmission,
  nhtsaModelName,
  parseNhtsaDate,
  parseRatingDetail,
  parseRatingVariants,
  parseRecalls,
  parseVinDecode,
  summarizeComplaints,
  sameBuildCount,
  parseComplaintDate,
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
        TransmissionStyle: "Continuously Variable Transmission (CVT)", FuelTypePrimary: "Gasoline", CurbWeightLB: "3605",
        DisplacementL: "2.4", EngineCylinders: "4", ElectrificationLevel: "",
      },
    ],
  };

  it("parses a clean decode", () => {
    const d = parseVinDecode("1HGCR2F8XHA000123", body);
    expect(d).toMatchObject({
      year: 2017, make: "HONDA", model: "Accord", trim: "EX-L",
      transmissionKind: "automatic", errorCode: "0", clean: true, curbWeightLb: 3605,
      displacementL: 2.4, cylinders: 4, electrification: null,
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
        { component: "ELECTRICAL SYSTEM", count: 2, samples: [] },
        { component: "ENGINE", count: 1, samples: [] },
      ],
      byPrefix: {},
    });
  });

  it("keeps the newest owner reports per area and counts VIN prefixes", () => {
    const long = "THE TRANSMISSION SHUDDERS AT 40 MPH. ".repeat(20);
    const s = summarizeComplaints({
      results: [
        { odiNumber: 1, components: "POWER TRAIN", dateComplaintFiled: "01/15/2024", summary: "Transmission slips when cold, dealer could not fix it.", vin: "4T1C11AK3MU" },
        { odiNumber: 2, components: "POWER TRAIN", dateComplaintFiled: "10/26/2026", summary: long, crash: true, vin: "4t1c11ak9mu" },
        { odiNumber: 3, components: "POWER TRAIN", dateComplaintFiled: "03/02/2025", summary: "Torque converter shudder at highway speed, replaced.", vin: "4T1G11AK6MU" },
        { odiNumber: 4, components: "ENGINE", dateComplaintFiled: "03/02/2025", summary: "short", vin: "" },
      ],
    });
    const pt = s.topComponents[0];
    expect(pt.component).toBe("POWER TRAIN");
    expect(pt.samples?.map((x) => x.odi)).toEqual([2, 3]);
    expect(pt.samples?.[0]).toMatchObject({ filed: "2026-10-26", crash: true, fire: false });
    expect(pt.samples?.[0].text.length).toBeLessThanOrEqual(321);
    expect(pt.samples?.[0].text.endsWith("…")).toBe(true);
    // Too short to be useful as a quote.
    expect(s.topComponents[1].samples).toEqual([]);
    expect(s.byPrefix).toEqual({ "4T1C11AK": 2, "4T1G11AK": 1 });
    expect(sameBuildCount(s, "4T1C11AK3MU436772")).toBe(2);
    expect(sameBuildCount(s, "1HGCV1F30LA000000")).toBe(0);
    expect(sameBuildCount(s, null)).toBeNull();
  });

  it("reads complaint dates as month/day/year", () => {
    expect(parseComplaintDate("09/30/2026")).toBe("2026-09-30");
    expect(parseComplaintDate("2026-09-30")).toBeNull();
  });
});

describe("nhtsaModelName", () => {
  it("joins Lexus model and engine the way NHTSA's safety APIs file them", () => {
    expect(nhtsaModelName("LEXUS", "ES", "350")).toBe("ES350");
    expect(nhtsaModelName("Lexus", "RX", "350 F Sport")).toBe("RX350");
    expect(nhtsaModelName("Lexus", "ES", "300h")).toBe("ES300H");
    expect(nhtsaModelName("Lexus", "ES 350", null)).toBe("ES350");
    expect(nhtsaModelName("Lexus", "ES", null, "2016 Lexus ES 350 Sedan, 90k miles")).toBe("ES350");
    expect(nhtsaModelName("Lexus", "ES", null, "2016 Lexus ES, 90k miles")).toBe("ES");
  });

  it("leaves other makes alone", () => {
    expect(nhtsaModelName("TOYOTA", "Camry", "LE")).toBe("Camry");
    expect(nhtsaModelName("Honda", "CR-V", "EX")).toBe("CR-V");
  });
});
