import { describe, expect, it } from "vitest";
import { orientation } from "./orient";

/** Rust's `decode::orient`: the source pixel that lands at (x, y). */
function rustSource(o: number, w: number, h: number, x: number, y: number): [number, number] {
  switch (o) {
    case 2:
      return [w - 1 - x, y];
    case 3:
      return [w - 1 - x, h - 1 - y];
    case 4:
      return [x, h - 1 - y];
    case 5:
      return [y, x];
    case 6:
      return [y, h - 1 - x];
    case 7:
      return [w - 1 - y, h - 1 - x];
    case 8:
      return [w - 1 - y, x];
    default:
      return [x, y];
  }
}

describe("orientation", () => {
  const [w, h] = [3, 2];

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("orientation %i puts every pixel where Rust does", (o) => {
    const {
      width,
      height,
      transform: [a, b, c, d, e, f],
    } = orientation(o, w, h);
    expect([width, height]).toEqual(o >= 5 ? [h, w] : [w, h]);
    for (let sy = 0; sy < h; sy++) {
      for (let sx = 0; sx < w; sx++) {
        // Where the canvas transform puts this source pixel's centre.
        const cx = sx + 0.5;
        const cy = sy + 0.5;
        const x = Math.floor(a * cx + c * cy + e);
        const y = Math.floor(b * cx + d * cy + f);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(rustSource(o, w, h, x, y)).toEqual([sx, sy]);
      }
    }
  });

  it("leaves unknown orientations alone", () => {
    expect(orientation(0, w, h)).toEqual({ width: w, height: h, transform: [1, 0, 0, 1, 0, 0] });
    expect(orientation(9, w, h).transform).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
