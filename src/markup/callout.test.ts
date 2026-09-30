import { describe, expect, it } from "vitest";
import {
  calloutExtent,
  grabsTip,
  growCallout,
  orbitCallout,
  pointerGeometry,
  pointerPivot,
  pointerStart,
  segmentQuad,
  underlineLayout,
} from "./callout";
import type { CalloutAnnotation } from "./model/types";

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

describe("underlineLayout", () => {
  // 20pt: 26.67px text, padding 8, so the line sits 4 px off the text,
  // then a tenth of the text's size lower.
  const drop = 0.1 * ((20 * 96) / 72);
  const at = (tip: { x: number; y: number }) => underlineLayout(100, 100, 80, 30, 20, tip);

  it("runs under the text, a little wider, when the tip is lower", () => {
    const u = at({ x: 400, y: 300 });
    expect(u.line.map((p) => p.x)).toEqual([96, 184]);
    expect(u.line[0].y).toBeCloseTo(134 + drop);
    expect(u.line[1].y).toBeCloseTo(134 + drop);
    expect(u.start).toEqual(u.line[1]);
  });

  it("goes over the text when the tip is higher than its middle", () => {
    const u = at({ x: 400, y: 50 });
    expect(u.line[0].y).toBeCloseTo(96 + drop);
    expect(u.start).toEqual(u.line[1]);
  });

  it("starts from the end on the tip's side of the text's centre", () => {
    expect(at({ x: 130, y: 300 }).start?.x).toBe(96);
    expect(at({ x: 150, y: 300 }).start?.x).toBe(184);
  });

  it("hides the pointer while the tip is inside the text's box", () => {
    expect(at({ x: 120, y: 110 }).start).toBeNull();
  });
});

describe("growCallout", () => {
  const callout = (tip: { x: number; y: number }): CalloutAnnotation => ({
    id: "c",
    kind: "callout",
    x: 100,
    y: 100,
    width: 40,
    autoWidth: true,
    text: "Hi",
    fontFamily: "Segoe UI",
    fontSize: 20,
    bold: false,
    italic: false,
    align: "left",
    shape: "box",
    color: "#e53935",
    textColor: "#ffffff",
    lineWidth: 4,
    cornerRadius: 5,
    tip,
    end: "line",
  });

  it("grows away from a tip on its right, keeping that edge", () => {
    expect(growCallout(callout({ x: 300, y: 110 }), 60)).toMatchObject({ x: 80, width: 60 });
  });

  it("grows right, as text does, from a tip on its left", () => {
    expect(growCallout(callout({ x: 10, y: 110 }), 60)).toMatchObject({ x: 100, width: 60 });
  });

  it("grows both ways from a tip above or below", () => {
    expect(growCallout(callout({ x: 120, y: 300 }), 60)).toMatchObject({ x: 90, width: 60 });
    expect(growCallout(callout({ x: 110, y: 0 }), 20)).toMatchObject({ x: 110, width: 20 });
  });
});

describe("pointerPivot", () => {
  const base = {
    id: "c",
    kind: "callout",
    x: 100,
    y: 100,
    width: 80,
    autoWidth: false,
    text: "Hi",
    fontFamily: "Segoe UI",
    fontSize: 20,
    bold: false,
    italic: false,
    align: "left",
    color: "#e53935",
    textColor: "#ffffff",
    lineWidth: 4,
    cornerRadius: 5,
    end: "line",
  } as const;

  it("is a box's centre", () => {
    const a: CalloutAnnotation = { ...base, shape: "box", tip: { x: 0, y: 0 } };
    const p = pointerPivot(a, 80, 30);
    expect(p.x).toBe(140);
    expect(p.y).toBeCloseTo(115 + 0.1 * ((20 * 96) / 72));
  });

  it("is the underline's end on the tip's side", () => {
    const a: CalloutAnnotation = { ...base, shape: "underline", tip: { x: 400, y: 300 } };
    const p = pointerPivot(a, 80, 30);
    expect(p.x).toBe(184);
    expect(p.y).toBeCloseTo(134 + 0.1 * ((20 * 96) / 72));
  });
});

describe("calloutExtent and orbitCallout", () => {
  const a: CalloutAnnotation = {
    id: "c",
    kind: "callout",
    x: 100,
    y: 100,
    width: 80,
    autoWidth: false,
    text: "Hi",
    fontFamily: "Segoe UI",
    fontSize: 20,
    bold: false,
    italic: false,
    align: "left",
    shape: "box",
    color: "#e53935",
    textColor: "#ffffff",
    lineWidth: 4,
    cornerRadius: 5,
    tip: { x: 300, y: 250 },
    end: "dot",
  };

  it("takes in the box and the pointer's end", () => {
    const e = calloutExtent(a, 80, 30);
    expect(e.x).toBe(92); // the box's padding
    expect(e.x + e.width).toBe(300 + 7); // the dot's radius past the tip
    expect(e.y + e.height).toBe(250 + 7);
  });

  it("takes in an outline's stroke outside the box", () => {
    const e = calloutExtent({ ...a, shape: "outline" }, 80, 30);
    expect(e.x).toBe(92 - 2); // half the 4px outline past the box
  });

  it("moves the text's centre and the tip, keeping the text's size", () => {
    // A half turn about (200, 200).
    const turn = (p: { x: number; y: number }) => ({ x: 400 - p.x, y: 400 - p.y });
    const o = orbitCallout(a, 80, 30, turn);
    expect(o.tip).toEqual({ x: 100, y: 150 });
    // The centre (140, 115) goes to (260, 285): the text's corner follows.
    expect(o).toMatchObject({ x: 220, y: 270, width: 80 });
  });
});

describe("grabsTip", () => {
  const a = (end: "line" | "arrow" | "dot"): CalloutAnnotation => ({
    id: "c",
    kind: "callout",
    x: 0,
    y: 0,
    width: 50,
    autoWidth: false,
    text: "Hi",
    fontFamily: "Segoe UI",
    fontSize: 20,
    bold: false,
    italic: false,
    align: "left",
    shape: "box",
    color: "#e53935",
    textColor: "#ffffff",
    lineWidth: 4,
    cornerRadius: 5,
    tip: { x: 200, y: 200 },
    end,
  });

  it("takes the handle's reach around the end", () => {
    expect(grabsTip(a("line"), { x: 208, y: 200 }, 10)).toBe(true);
    expect(grabsTip(a("line"), { x: 215, y: 200 }, 10)).toBe(false);
  });

  it("takes in a long arrow head", () => {
    // Head length for 4 px: 18.
    expect(grabsTip(a("arrow"), { x: 185, y: 200 }, 10)).toBe(true);
    expect(grabsTip(a("line"), { x: 185, y: 200 }, 10)).toBe(false);
  });
});
