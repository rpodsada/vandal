import { describe, expect, it } from "vitest";
import { areaLabel, contains } from "./scrollPick";

const rect = { x: -100, y: 20, width: 984, height: 1171 };

describe("contains", () => {
  it("includes the top-left edge and excludes the bottom-right one", () => {
    expect(contains(rect, { x: -100, y: 20 })).toBe(true);
    expect(contains(rect, { x: 883, y: 1190 })).toBe(true);
    expect(contains(rect, { x: 884, y: 100 })).toBe(false);
    expect(contains(rect, { x: 0, y: 1191 })).toBe(false);
  });
});

describe("areaLabel", () => {
  it("gives the size and how tall the page is", () => {
    expect(areaLabel({ rect, screens: 4.03 })).toBe("984 × 1171 · about 4 screens tall");
  });

  it("never says under 2 screens for something that scrolls", () => {
    expect(areaLabel({ rect, screens: 1.3 })).toBe("984 × 1171 · about 2 screens tall");
  });

  it("just says it scrolls when the length is unknown (Firefox)", () => {
    expect(areaLabel({ rect, screens: null })).toBe("984 × 1171 · scrolls");
  });
});
