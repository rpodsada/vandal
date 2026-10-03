import { describe, expect, it } from "vitest";
import { MAX_SIDE, maxHeight, stitchPlan } from "./stitch";

describe("stitchPlan", () => {
  it("lays whole screens end to end", () => {
    expect(stitchPlan([0, 100, 200], 100, MAX_SIDE)).toEqual({
      pieces: [
        { index: 0, sy: 0, dy: 0, h: 100 },
        { index: 1, sy: 0, dy: 100, h: 100 },
        { index: 2, sy: 0, dy: 200, h: 100 },
      ],
      height: 300,
    });
  });

  it("takes only the new rows of an overlapping last screen", () => {
    // A 250-row page: the last screen could only scroll to 150.
    expect(stitchPlan([0, 100, 150], 100, MAX_SIDE)).toEqual({
      pieces: [
        { index: 0, sy: 0, dy: 0, h: 100 },
        { index: 1, sy: 0, dy: 100, h: 100 },
        { index: 2, sy: 50, dy: 200, h: 50 },
      ],
      height: 250,
    });
  });

  it("stops at the limit", () => {
    expect(stitchPlan([0, 100, 200], 100, 230)).toEqual({
      pieces: [
        { index: 0, sy: 0, dy: 0, h: 100 },
        { index: 1, sy: 0, dy: 100, h: 100 },
        { index: 2, sy: 0, dy: 200, h: 30 },
      ],
      height: 230,
    });
  });

  it("skips a shot that adds nothing", () => {
    expect(stitchPlan([0, 0], 100, MAX_SIDE).pieces).toHaveLength(1);
  });
});

describe("maxHeight", () => {
  it("is the side limit for ordinary widths", () => {
    expect(maxHeight(1920)).toBe(65_000);
  });

  it("shrinks for very wide pages to stay within the area limit", () => {
    expect(maxHeight(5120)).toBe(52_428);
  });
});
