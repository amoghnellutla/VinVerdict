import { describe, expect, it } from "vitest";
import { makeName } from "./format";

describe("makeName (real case 31: 'Land rover' in the result title)", () => {
  it("writes NHTSA's capitals the way people do", () => {
    expect(makeName("LAND ROVER")).toBe("Land Rover");
    expect(makeName("MERCEDES-BENZ")).toBe("Mercedes-Benz");
    expect(makeName("ROLLS-ROYCE")).toBe("Rolls-Royce");
    expect(makeName("BMW")).toBe("BMW");
    expect(makeName("GMC")).toBe("GMC");
    expect(makeName("KIA")).toBe("Kia");
    expect(makeName("TOYOTA")).toBe("Toyota");
    expect(makeName(null)).toBeNull();
  });
});
