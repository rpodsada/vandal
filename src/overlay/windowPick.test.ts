import { describe, expect, it } from "vitest";
import { visiblePart, windowAt } from "./windowPick";

const front = { x: 100, y: 100, width: 400, height: 300 };
const back = { x: 0, y: 0, width: 1000, height: 800 };
const left = { x: -1800, y: 50, width: 800, height: 600 };

describe("windowAt", () => {
  it("finds the topmost window under the point", () => {
    expect(windowAt([front, back], { x: 150, y: 150 })).toBe(0);
    expect(windowAt([front, back], { x: 50, y: 50 })).toBe(1);
  });

  it("is half-open and handles negative coordinates", () => {
    expect(windowAt([front], { x: 500, y: 150 })).toBeNull();
    expect(windowAt([front], { x: 499, y: 399 })).toBe(0);
    expect(windowAt([front, left], { x: -1000, y: 100 })).toBeNull();
    expect(windowAt([front, left], { x: -1001, y: 100 })).toBe(1);
  });

  it("finds nothing over the bare desktop", () => {
    expect(windowAt([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("visiblePart", () => {
  const primary = { x: 0, y: 0, width: 2560, height: 1440 };
  const secondary = { x: -1920, y: 0, width: 1920, height: 1080 };

  it("is local to the monitor", () => {
    expect(visiblePart(front, primary)).toEqual(front);
    expect(visiblePart(left, secondary)).toEqual({ x: 120, y: 50, width: 800, height: 600 });
  });

  it("splits a window spanning two monitors", () => {
    const spanning = { x: -200, y: 10, width: 500, height: 100 };
    expect(visiblePart(spanning, secondary)).toEqual({ x: 1720, y: 10, width: 200, height: 100 });
    expect(visiblePart(spanning, primary)).toEqual({ x: 0, y: 10, width: 300, height: 100 });
  });

  it("is null off the monitor", () => {
    expect(visiblePart(left, primary)).toBeNull();
  });
});
