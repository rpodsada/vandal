import { describe, expect, it } from "vitest";
import { pointerGeometry, pointerStart, segmentQuad } from "./callout";

const box = { x: 0, y: 0, width: 100, height: 40 };

describe("pointerStart", () => {
  it("leaves the side facing the tip, aimed at the centre", () => {
    expect(pointerStart(box, 0, { x: 50, y: 200 })).toEqual({ x: 50, y: 40 });
    expect(pointerStart(box, 0, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 });
    expect(pointerStart(box, 0, { x: 300, y: 20 })).toEqual({ x: 100, y: 20 });
    expect(pointerStart(box, 0, { x: -300, y: 20 })).toEqual({ x: 0, y: 20 });
  });

  it("goes through a corner diagonally", () => {
    // From the centre (50, 20) toward (150, 60): leaves at the right edge.
    const p = pointerStart(box, 0, { x: 150, y: 60 })!;
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(40);
  });

  it("follows a rounded corner", () => {
    const p = pointerStart(box, 10, { x: 150, y: 60 })!;
    // On the corner's circle, centred at (90, 30), radius 10.
    expect(Math.hypot(p.x - 90, p.y - 30)).toBeCloseTo(10);
    // And still on the line from the centre to the tip.
    expect((p.y - 20) / (p.x - 50)).toBeCloseTo(40 / 100);
  });

  it("is hidden while the tip is inside the box", () => {
    expect(pointerStart(box, 0, { x: 10, y: 10 })).toBeNull();
    expect(pointerStart(box, 0, { x: 50, y: 20 })).toBeNull();
  });

  it("shows in a rounded-off corner, outside the box", () => {
    expect(pointerStart(box, 10, { x: 99.5, y: 39.5 })).not.toBeNull();
    expect(pointerStart(box, 0, { x: 99.5, y: 39.5 })).toBeNull();
  });
});

describe("segmentQuad", () => {
  it("is as wide as asked, around the segment", () => {
    const q = segmentQuad({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    expect(q.map((p) => p.y)).toEqual([2, 2, -2, -2]);
    expect(q.map((p) => p.x)).toEqual([0, 10, 10, 0]);
  });
});

describe("pointerGeometry", () => {
  const start = { x: 0, y: 0 };
  const tip = { x: 100, y: 0 };

  it("is a plain line to the tip", () => {
    expect(pointerGeometry(start, tip, "line", 4)).toEqual({
      shaft: [start, tip],
      head: null,
      dot: null,
    });
  });

  it("stops an arrow's shaft at its head, whose point is the tip", () => {
    const g = pointerGeometry(start, tip, "arrow", 4);
    expect(g.head?.[1]).toEqual(tip);
    expect(g.shaft[1].x).toBeLessThan(100);
    expect(g.shaft[1].x).toBeCloseTo(g.head![0].x);
  });

  it("centres a dot, wider than the line, on the tip", () => {
    const g = pointerGeometry(start, tip, "dot", 4);
    expect(g.dot?.center).toEqual(tip);
    expect(g.dot!.radius * 2).toBeGreaterThan(4);
    expect(g.shaft).toEqual([start, tip]);
  });
});
