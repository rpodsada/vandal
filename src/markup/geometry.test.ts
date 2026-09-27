import { describe, expect, it } from "vitest";
import {
  annotationBounds,
  rectFromDrag,
  rectsIntersect,
  rotatedBounds,
  translateAnnotation,
} from "./geometry";
import type { Annotation } from "./model/types";

const style = { color: "#000", width: 2, opacity: 1 };

describe("rectFromDrag", () => {
  it("normalizes any drag direction", () => {
    expect(rectFromDrag({ x: 10, y: 20 }, { x: 4, y: 5 })).toEqual({
      x: 4,
      y: 5,
      width: 6,
      height: 15,
    });
  });

  it("squares to the longer side, keeping direction", () => {
    expect(rectFromDrag({ x: 10, y: 10 }, { x: 4, y: 12 }, true)).toEqual({
      x: 4,
      y: 10,
      width: 6,
      height: 6,
    });
    expect(rectFromDrag({ x: 0, y: 0 }, { x: 0, y: 0 }, true).width).toBe(0);
  });
});

describe("rectsIntersect", () => {
  it("needs overlapping area", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
  });
});

describe("rotatedBounds", () => {
  it("is the rect itself unrotated and swaps sides at 90°", () => {
    const r = { x: 0, y: 0, width: 20, height: 10 };
    expect(rotatedBounds(r, 0)).toBe(r);
    const b = rotatedBounds(r, 90);
    expect(b.x).toBeCloseTo(5);
    expect(b.y).toBeCloseTo(-5);
    expect(b.width).toBeCloseTo(10);
    expect(b.height).toBeCloseTo(20);
  });
});

describe("annotationBounds and translateAnnotation", () => {
  const cases: Annotation[] = [
    {
      id: "r",
      kind: "rect",
      rect: { x: 1, y: 2, width: 3, height: 4 },
      rotation: 0,
      filled: false,
      style,
    },
    { id: "l", kind: "line", from: { x: 5, y: 1 }, to: { x: 1, y: 7 }, style },
    { id: "p", kind: "pen", points: [3, 3, 1, 9, 6, 4], style },
  ];

  it("bounds each kind", () => {
    expect(annotationBounds(cases[0])).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(annotationBounds(cases[1])).toEqual({ x: 1, y: 1, width: 4, height: 6 });
    expect(annotationBounds(cases[2])).toEqual({ x: 1, y: 3, width: 5, height: 6 });
  });

  it("moves bounds by the offset for every kind", () => {
    for (const a of cases) {
      const before = annotationBounds(a);
      const after = annotationBounds(translateAnnotation(a, 10, -2));
      expect(after).toEqual({ ...before, x: before.x + 10, y: before.y - 2 });
    }
  });
});
