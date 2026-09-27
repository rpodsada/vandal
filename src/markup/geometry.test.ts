import { describe, expect, it } from "vitest";
import {
  annotationBounds,
  arrowGeometry,
  arrowHeadSize,
  rectFromDrag,
  rectsIntersect,
  rotatedBounds,
  simplifyPath,
  snapAngle,
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
      fill: "none",
      fillColor: "#000",
      style,
    },
    { id: "l", kind: "line", from: { x: 5, y: 1 }, to: { x: 1, y: 7 }, style },
    { id: "p", kind: "pen", points: [3, 3, 1, 9, 6, 4], style },
    {
      id: "t",
      kind: "text",
      x: 10,
      y: 20,
      width: 100,
      autoWidth: false,
      rotation: 0,
      text: "one\ntwo",
      fontFamily: "Segoe UI",
      fontSize: 15,
      bold: false,
      italic: false,
      color: "#000",
      align: "left",
      background: false,
      backgroundColor: "#ffffff",
    },
  ];

  it("bounds each kind", () => {
    expect(annotationBounds(cases[0])).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(annotationBounds(cases[1])).toEqual({ x: 1, y: 1, width: 4, height: 6 });
    expect(annotationBounds(cases[2])).toEqual({ x: 1, y: 3, width: 5, height: 6 });
    // 15 pt = 20 px, two lines at 1.2.
    expect(annotationBounds(cases[3])).toEqual({ x: 10, y: 20, width: 100, height: 48 });
  });

  it("rotates text about its top-left corner", () => {
    const b = annotationBounds({ ...cases[3], rotation: 90 } as Annotation);
    expect(b.x).toBeCloseTo(-38);
    expect(b.y).toBeCloseTo(20);
    expect(b.width).toBeCloseTo(48);
    expect(b.height).toBeCloseTo(100);
  });

  it("moves bounds by the offset for every kind", () => {
    for (const a of cases) {
      const before = annotationBounds(a);
      const after = annotationBounds(translateAnnotation(a, 10, -2));
      expect(after).toEqual({ ...before, x: before.x + 10, y: before.y - 2 });
    }
  });
});

describe("snapAngle", () => {
  it("snaps to the nearest 45° keeping the distance", () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(p.x).toBeCloseTo(Math.hypot(10, 1));
    expect(p.y).toBeCloseTo(0);
    const d = snapAngle({ x: 0, y: 0 }, { x: 10, y: 9 });
    expect(d.x).toBeCloseTo(d.y);
  });

  it("leaves a zero-length drag alone", () => {
    expect(snapAngle({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });
});

describe("arrowGeometry", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };
  const { length, halfWidth } = arrowHeadSize(4);

  it("stops a filled head's shaft at the head's base", () => {
    const g = arrowGeometry(from, to, "filled", 4);
    expect(g.shaft).toEqual([0, 0, 100 - length, 0]);
    expect(g.heads).toHaveLength(1);
    const [left, tip, right] = g.heads[0];
    expect(tip).toEqual(to);
    expect(left).toEqual({ x: 100 - length, y: halfWidth });
    expect(right).toEqual({ x: 100 - length, y: -halfWidth });
  });

  it("runs an open head's shaft to the tip", () => {
    expect(arrowGeometry(from, to, "open", 4).shaft).toEqual([0, 0, 100, 0]);
  });

  it("has no head for 'none' or a zero-length arrow", () => {
    expect(arrowGeometry(from, to, "none", 4).heads).toEqual([]);
    expect(arrowGeometry(from, from, "filled", 4).heads).toEqual([]);
  });

  it("shrinks the head on short arrows", () => {
    const g = arrowGeometry(from, { x: 10, y: 0 }, "filled", 4);
    expect(g.shaft[2]).toBeCloseTo(2); // head is 80% of the length
  });

  it("puts a mirrored head on the tail of a two-ended arrow", () => {
    const g = arrowGeometry(from, to, "filled", 4, "both");
    expect(g.shaft).toEqual([length, 0, 100 - length, 0]);
    expect(g.heads).toHaveLength(2);
    const [left, tip, right] = g.heads[1];
    expect(tip).toEqual(from);
    expect(left.x).toBeCloseTo(length);
    expect(right.x).toBeCloseTo(length);
    // Open heads keep the full shaft.
    expect(arrowGeometry(from, to, "open", 4, "both").shaft).toEqual([0, 0, 100, 0]);
  });

  it("puts the only head on the start with 'start'", () => {
    const g = arrowGeometry(from, to, "filled", 4, "start");
    expect(g.shaft).toEqual([length, 0, 100, 0]);
    expect(g.heads).toHaveLength(1);
    expect(g.heads[0][1]).toEqual(from);
  });

  it("shrinks both heads to share a short arrow", () => {
    const g = arrowGeometry(from, { x: 10, y: 0 }, "filled", 4, "both");
    expect(g.shaft[0]).toBeCloseTo(4); // each head is 40% of the length
    expect(g.shaft[2]).toBeCloseTo(6);
  });
});

describe("simplifyPath", () => {
  it("drops points on a straight run and keeps corners", () => {
    const path = [0, 0, 1, 0.1, 2, 0, 3, 0, 3, 1, 3, 2];
    expect(simplifyPath(path, 0.5)).toEqual([0, 0, 3, 0, 3, 2]);
  });

  it("keeps detail larger than the tolerance", () => {
    expect(simplifyPath([0, 0, 1, 2, 2, 0], 0.5)).toEqual([0, 0, 1, 2, 2, 0]);
  });

  it("leaves one- and two-point paths alone", () => {
    expect(simplifyPath([4, 4], 1)).toEqual([4, 4]);
    expect(simplifyPath([0, 0, 5, 5], 1)).toEqual([0, 0, 5, 5]);
  });
});
