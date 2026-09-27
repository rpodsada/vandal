import { describe, expect, it } from "vitest";
import { displaySize, FIT_MARGIN, fitZoom } from "./view";

const viewport = (w: number, h: number) => ({
  width: w + 2 * FIT_MARGIN,
  height: h + 2 * FIT_MARGIN,
});

describe("fitZoom", () => {
  it("never enlarges past 100%", () => {
    expect(fitZoom({ width: 100, height: 50 }, viewport(1000, 800), 1)).toBe(1);
  });

  it("shrinks to the tighter axis", () => {
    expect(fitZoom({ width: 2000, height: 500 }, viewport(1000, 800), 1)).toBe(0.5);
    expect(fitZoom({ width: 500, height: 1600 }, viewport(1000, 800), 1)).toBe(0.5);
  });

  it("counts image pixels as device pixels", () => {
    // 1500 device px at 150% is 1000 CSS px: fits exactly.
    expect(fitZoom({ width: 1500, height: 300 }, viewport(1000, 800), 1.5)).toBe(1);
    expect(fitZoom({ width: 3000, height: 300 }, viewport(1000, 800), 1.5)).toBe(0.5);
  });

  it("survives degenerate input", () => {
    expect(fitZoom({ width: 0, height: 10 }, viewport(100, 100), 1)).toBe(1);
    expect(fitZoom({ width: 10, height: 10 }, viewport(100, 100), 0)).toBe(1);
    expect(fitZoom({ width: 100, height: 100 }, { width: 0, height: 0 }, 1)).toBeGreaterThan(0);
  });
});

describe("displaySize", () => {
  it("converts device px to CSS px at a zoom", () => {
    expect(displaySize({ width: 1500, height: 900 }, 0.5, 1.5)).toEqual({
      width: 500,
      height: 300,
    });
  });
});
