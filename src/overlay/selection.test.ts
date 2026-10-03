import { describe, expect, it } from "vitest";
import {
  arrowDelta,
  cursorFor,
  growRect,
  hitTest,
  moveRect,
  rectFromDrag,
  resizeKeepingShape,
  resizeRect,
  squareFromDrag,
  type Edges,
} from "./selection";

const bounds = { width: 100, height: 50 };
const edges = (e: Partial<Edges>): Edges => ({
  left: false,
  right: false,
  top: false,
  bottom: false,
  ...e,
});

describe("rectFromDrag", () => {
  it("includes both end pixels in any direction", () => {
    const expected = { x: 10, y: 5, width: 11, height: 6 };
    expect(rectFromDrag({ x: 10, y: 5 }, { x: 20, y: 10 }, bounds)).toEqual(expected);
    expect(rectFromDrag({ x: 20, y: 10 }, { x: 10, y: 5 }, bounds)).toEqual(expected);
    expect(rectFromDrag({ x: 20, y: 5 }, { x: 10, y: 10 }, bounds)).toEqual(expected);
  });

  it("a click is a 1×1 rect", () => {
    expect(rectFromDrag({ x: 3, y: 4 }, { x: 3, y: 4 }, bounds)).toEqual({
      x: 3,
      y: 4,
      width: 1,
      height: 1,
    });
  });

  it("clamps to the monitor when dragging off-screen", () => {
    expect(rectFromDrag({ x: 90, y: 40 }, { x: 500, y: -20 }, bounds)).toEqual({
      x: 90,
      y: 0,
      width: 10,
      height: 41,
    });
  });
});

describe("moveRect", () => {
  const r = { x: 10, y: 10, width: 20, height: 10 };
  it("moves freely inside", () => {
    expect(moveRect(r, 5, -3, bounds)).toEqual({ ...r, x: 15, y: 7 });
  });
  it("stops at edges without resizing", () => {
    expect(moveRect(r, -50, 100, bounds)).toEqual({ ...r, x: 0, y: 40 });
    expect(moveRect(r, 500, -500, bounds)).toEqual({ ...r, x: 80, y: 0 });
  });
});

describe("resizeRect", () => {
  const r = { x: 10, y: 10, width: 20, height: 10 };
  it("drags a corner", () => {
    expect(resizeRect(r, edges({ right: true, bottom: true }), 5, 5, bounds)).toEqual({
      x: 10,
      y: 10,
      width: 25,
      height: 15,
    });
  });
  it("drags a single edge", () => {
    expect(resizeRect(r, edges({ left: true }), -4, 99, bounds)).toEqual({
      ...r,
      x: 6,
      width: 24,
    });
  });
  it("flips when an edge passes its opposite", () => {
    // Left edge dragged from 10 to 40, past the right edge at 30.
    expect(resizeRect(r, edges({ left: true }), 30, 0, bounds)).toEqual({
      ...r,
      x: 30,
      width: 10,
    });
  });
  it("never collapses below 1px", () => {
    expect(resizeRect(r, edges({ right: true }), -20, 0, bounds).width).toBe(1);
    const atEdge = { x: 99, y: 0, width: 1, height: 1 };
    expect(resizeRect(atEdge, edges({ left: true }), 1, 0, bounds)).toEqual(atEdge);
  });
  it("clamps to the monitor", () => {
    expect(resizeRect(r, edges({ right: true, top: true }), 500, -500, bounds)).toEqual({
      x: 10,
      y: 0,
      width: 90,
      height: 20,
    });
  });
});

describe("squareFromDrag", () => {
  it("is a square toward the pointer, covering both pixels like a plain drag", () => {
    expect(squareFromDrag({ x: 10, y: 10 }, { x: 29, y: 14 }, bounds)).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
    expect(squareFromDrag({ x: 40, y: 30 }, { x: 31, y: 21 }, bounds)).toEqual({
      x: 31,
      y: 21,
      width: 10,
      height: 10,
    });
  });

  it("shrinks rather than leave the monitor", () => {
    // 60 wide toward the right, but only 40 px below the anchor.
    expect(squareFromDrag({ x: 10, y: 10 }, { x: 69, y: 20 }, bounds)).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    });
  });
});

describe("resizeKeepingShape", () => {
  const r = { x: 10, y: 10, width: 40, height: 20 };

  it("keeps a corner drag's proportions, the opposite corner still", () => {
    expect(resizeKeepingShape(r, edges({ right: true, bottom: true }), 20, 0, bounds)).toEqual({
      x: 10,
      y: 10,
      width: 60,
      height: 30,
    });
    expect(resizeKeepingShape(r, edges({ left: true, top: true }), 0, -6, bounds)).toEqual({
      // 52 × 26 wouldn't fit left of x 50, so 50 × 25.
      x: 0,
      y: 5,
      width: 50,
      height: 25,
    });
  });

  it("resizes an edge freely", () => {
    expect(resizeKeepingShape(r, edges({ right: true }), 10, 0, bounds)).toEqual({
      ...r,
      width: 50,
    });
  });
});

describe("growRect", () => {
  const r = { x: 10, y: 10, width: 20, height: 10 };
  it("grows and shrinks from the bottom-right, keeping the origin", () => {
    expect(growRect(r, 1, 0, bounds)).toEqual({ ...r, width: 21 });
    expect(growRect(r, -10, 0, bounds)).toEqual({ ...r, width: 10 });
    expect(growRect(r, 0, 10, bounds)).toEqual({ ...r, height: 20 });
    expect(growRect(r, 0, -1, bounds)).toEqual({ ...r, height: 9 });
  });
  it("stops at 1px instead of flipping", () => {
    expect(growRect({ ...r, width: 5 }, -10, 0, bounds)).toEqual({ ...r, width: 1 });
    expect(growRect({ ...r, height: 1 }, 0, -1, bounds)).toEqual({ ...r, height: 1 });
  });
  it("stops at the monitor edge", () => {
    expect(growRect(r, 500, 500, bounds)).toEqual({ ...r, width: 90, height: 40 });
  });
});

describe("hitTest", () => {
  const r = { x: 10, y: 10, width: 40, height: 20 };
  it("finds corners, edges, inside and outside", () => {
    expect(hitTest(r, { x: 11, y: 9 }, 3)).toEqual({
      kind: "edge",
      edges: edges({ left: true, top: true }),
    });
    expect(hitTest(r, { x: 50, y: 20 }, 3)).toEqual({
      kind: "edge",
      edges: edges({ right: true }),
    });
    expect(hitTest(r, { x: 30, y: 20 }, 3)).toEqual({ kind: "inside" });
    expect(hitTest(r, { x: 5, y: 20 }, 3)).toBeNull();
    expect(hitTest(r, { x: 30, y: 35 }, 3)).toBeNull();
  });
  it("picks the nearer side of a tiny rect", () => {
    const tiny = { x: 10, y: 10, width: 2, height: 2 };
    expect(hitTest(tiny, { x: 12, y: 11 }, 3)).toEqual({
      kind: "edge",
      edges: edges({ right: true, bottom: true }),
    });
  });
  it("maps hits to cursors", () => {
    expect(cursorFor(null)).toBe("crosshair");
    expect(cursorFor({ kind: "inside" })).toBe("move");
    expect(cursorFor({ kind: "edge", edges: edges({ right: true, top: true }) })).toBe(
      "nesw-resize",
    );
    expect(cursorFor({ kind: "edge", edges: edges({ bottom: true }) })).toBe("ns-resize");
  });
});

describe("arrowDelta", () => {
  it("maps arrows", () => {
    expect(arrowDelta("ArrowLeft", 10)).toEqual({ x: -10, y: 0 });
    expect(arrowDelta("ArrowDown", 1)).toEqual({ x: 0, y: 1 });
    expect(arrowDelta("Enter", 1)).toBeNull();
  });
});
