import { describe, expect, it } from "vitest";
import { fromPoints, growBy, moveBy, resizeBy, toImage } from "./rect";

const view = { w: 1000, h: 600 };

describe("fromPoints", () => {
  it("works in any drag direction", () => {
    expect(fromPoints(300, 200, 100, 50, view)).toEqual({ x: 100, y: 50, w: 200, h: 150 });
  });

  it("stays inside the viewport", () => {
    expect(fromPoints(-20, -5, 1200, 700, view)).toEqual({ x: 0, y: 0, w: 1000, h: 600 });
  });
});

describe("moveBy", () => {
  it("moves and stops at the edges", () => {
    const r = { x: 100, y: 100, w: 200, h: 100 };
    expect(moveBy(r, 10, -5, view)).toEqual({ x: 110, y: 95, w: 200, h: 100 });
    expect(moveBy(r, 5000, 5000, view)).toEqual({ x: 800, y: 500, w: 200, h: 100 });
    expect(moveBy(r, -5000, -5000, view)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });
});

describe("resizeBy", () => {
  const r = { x: 100, y: 100, w: 200, h: 100 };

  it("drags only the named edges", () => {
    expect(resizeBy(r, "e", 50, 30, view)).toEqual({ x: 100, y: 100, w: 250, h: 100 });
    expect(resizeBy(r, "nw", -10, -20, view)).toEqual({ x: 90, y: 80, w: 210, h: 120 });
  });

  it("flips past the opposite edge", () => {
    expect(resizeBy(r, "w", 250, 0, view)).toEqual({ x: 300, y: 100, w: 50, h: 100 });
  });
});

describe("growBy", () => {
  it("keeps at least 1px and stays inside", () => {
    const r = { x: 900, y: 100, w: 50, h: 50 };
    expect(growBy(r, 500, -500, view)).toEqual({ x: 900, y: 100, w: 100, h: 1 });
  });
});

describe("toImage", () => {
  it("scales to device pixels", () => {
    const r = { x: 10.2, y: 20, w: 100, h: 50.4 };
    expect(toImage(r, 1.5, { w: 1500, h: 900 })).toEqual({ x: 15, y: 30, w: 150, h: 76 });
  });

  it("is at least one pixel and inside the image", () => {
    expect(toImage({ x: 999.9, y: 0, w: 0, h: 0 }, 1, { w: 1000, h: 600 })).toEqual({
      x: 999,
      y: 0,
      w: 1,
      h: 1,
    });
  });
});
