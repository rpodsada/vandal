import { describe, expect, it } from "vitest";
import {
  bendFromPoint,
  bendPoint,
  bentCurve,
  cubicPoint,
  cubicPoints,
  measure,
  reverseBend,
  subCubic,
} from "./bend";
import { annotationBounds, translateAnnotation } from "./geometry";
import type { LineAnnotation } from "./model/types";

const from = { x: 0, y: 0 };
const to = { x: 100, y: 0 };

describe("bend handle", () => {
  it("round-trips a point through the bend", () => {
    const p = { x: 30, y: -20 };
    const bend = bendFromPoint(from, to, p, false)!;
    expect(bend.t).toBeCloseTo(0.3);
    expect(bend.d).toBeCloseTo(-20);
    const q = bendPoint(from, to, bend);
    expect(q.x).toBeCloseTo(30);
    expect(q.y).toBeCloseTo(-20);
  });

  it("sits in the middle when straight", () => {
    expect(bendPoint(from, to, undefined)).toEqual({ x: 50, y: 0 });
  });

  it("snaps straight near the chord", () => {
    expect(bendFromPoint(from, to, { x: 40, y: 3 }, false, 4)).toBeUndefined();
    expect(bendFromPoint(from, to, { x: 40, y: 5 }, false, 4)).toBeDefined();
  });

  it("keeps a symmetric arc with Shift", () => {
    expect(bendFromPoint(from, to, { x: 20, y: 30 }, true)).toEqual({ t: 0.5, d: 30 });
  });

  it("keeps the handle away from the ends", () => {
    expect(bendFromPoint(from, to, { x: -50, y: 30 }, false)!.t).toBe(0.15);
  });

  it("follows the ends: the arc keeps its shape", () => {
    const bend = { t: 0.5, d: 20 };
    // Twice as long and turned 90°: the handle is 20 px to the right of travel.
    const p = bendPoint({ x: 0, y: 0 }, { x: 0, y: 200 }, bend);
    expect(p.x).toBeCloseTo(-20);
    expect(p.y).toBeCloseTo(100);
  });

  it("reverses with the chord", () => {
    const bend = { t: 0.3, d: 12 };
    const p = bendPoint(from, to, bend);
    const q = bendPoint(to, from, reverseBend(bend));
    expect(q.x).toBeCloseTo(p.x);
    expect(q.y).toBeCloseTo(p.y);
  });
});

describe("bentCurve", () => {
  /** The point farthest from the chord (y = 0 here). */
  const peak = (pts: { x: number; y: number }[]) =>
    pts.reduce((best, p) => (Math.abs(p.y) > Math.abs(best.y) ? p : best));

  it("matches the circular arc with the handle in the middle", () => {
    // Half circle: centre (50, 0), radius 50.
    const curve = bentCurve(from, to, { t: 0.5, d: 50 })!;
    for (const p of cubicPoints(curve)) expect(Math.hypot(p.x - 50, p.y)).toBeCloseTo(50, -0.5);
    const mid = cubicPoint(curve, 0.5);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(50);
  });

  it("passes through the handle at its peak when slid toward an end", () => {
    const curve = bentCurve(from, to, { t: 0.75, d: 30 })!;
    const mid = cubicPoint(curve, 0.5);
    expect(mid.x).toBeCloseTo(75);
    expect(mid.y).toBeCloseTo(30);
    const p = peak(cubicPoints(curve, 400));
    expect(p.x).toBeCloseTo(75, 0);
    expect(p.y).toBeCloseTo(30, 1);
  });

  it("starts and ends at the segment's ends", () => {
    const curve = bentCurve(from, to, { t: 0.3, d: -40 })!;
    expect(cubicPoint(curve, 0)).toEqual(from);
    expect(cubicPoint(curve, 1)).toEqual(to);
  });

  it("is null when straight", () => {
    expect(bentCurve(from, to, undefined)).toBeNull();
    expect(bentCurve(from, to, { t: 0.5, d: 0.1 })).toBeNull();
  });

  it("measures length, and finds points by it", () => {
    const curve = bentCurve(from, to, { t: 0.5, d: 50 })!;
    const m = measure(curve);
    // A cubic half circle is about 1% longer than the true arc.
    expect(Math.abs(m.length / (50 * Math.PI) - 1)).toBeLessThan(0.02);
    expect(m.paramAt(m.length / 2)).toBeCloseTo(0.5, 2);
    expect(m.paramAt(-1)).toBe(0);
    expect(m.paramAt(m.length + 1)).toBe(1);
  });

  it("splits into the part between two parameters", () => {
    const curve = bentCurve(from, to, { t: 0.4, d: 30 })!;
    const part = subCubic(curve, 0.2, 0.7);
    const a = cubicPoint(curve, 0.2);
    const b = cubicPoint(curve, 0.7);
    expect(part[0].x).toBeCloseTo(a.x);
    expect(part[0].y).toBeCloseTo(a.y);
    expect(part[3].x).toBeCloseTo(b.x);
    expect(part[3].y).toBeCloseTo(b.y);
  });
});

describe("bent segments", () => {
  const line: LineAnnotation = {
    id: "l",
    kind: "line",
    from,
    to,
    bend: { t: 0.5, d: 50 },
    style: { color: "#000", width: 2, opacity: 1 },
  };

  it("bound the whole arc", () => {
    const b = annotationBounds(line);
    expect(b.x).toBeCloseTo(0);
    expect(b.width).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(0);
    expect(b.height).toBeCloseTo(50);
  });

  it("move with their bend", () => {
    const moved = translateAnnotation(line, 10, 5);
    expect(moved.bend).toEqual(line.bend);
    expect(moved.from).toEqual({ x: 10, y: 5 });
  });
});
