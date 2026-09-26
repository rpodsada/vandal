import { describe, expect, it } from "vitest";
import { cssToPhysical, physicalToCss } from "./geometry";

const monitor = (x: number, y: number, width: number, height: number, scaleFactor: number) => ({
  physicalBounds: { x, y, width, height },
  scaleFactor,
});

describe("cssToPhysical", () => {
  it("handles negative origins", () => {
    const left = monitor(-1920, 400, 1920, 1080, 1);
    expect(cssToPhysical(left, { x: 100, y: 10 })).toEqual({ x: -1820, y: 410 });
  });

  it("scales per monitor", () => {
    expect(cssToPhysical(monitor(0, 0, 3840, 2160, 1.5), { x: 100, y: 10 })).toEqual({
      x: 150,
      y: 15,
    });
    expect(cssToPhysical(monitor(3840, -700, 2560, 1440, 1.25), { x: 100, y: 10 })).toEqual({
      x: 3965,
      y: -688,
    });
  });

  it("floors fractional CSS coordinates", () => {
    expect(cssToPhysical(monitor(0, 0, 3840, 2160, 1.5), { x: 0.5, y: 0.7 })).toEqual({
      x: 0,
      y: 1,
    });
  });

  it("round-trips every sampled pixel at common scales", () => {
    for (const s of [1, 1.25, 1.5, 1.75, 2, 2.25, 3]) {
      const m = monitor(-2561, -1001, 2560, 1440, s);
      for (let x = -2561; x < -1; x += 7) {
        const p = { x, y: -1001 + (x & 0xff) };
        expect(cssToPhysical(m, physicalToCss(m, p))).toEqual(p);
      }
    }
  });
});
