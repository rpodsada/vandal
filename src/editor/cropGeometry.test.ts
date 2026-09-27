import { describe, expect, it } from "vitest";
import { dragCrop, drawCrop, inFrame, nudgeCrop, resizeCrop } from "./cropGeometry";

const frame = { width: 1000, height: 500 };
const box = { x: 100, y: 100, width: 200, height: 100 };

describe("dragCrop", () => {
  it("moves one side per edge handle and two per corner", () => {
    expect(dragCrop(box, "e", 50, 30, frame)).toEqual({ ...box, width: 250 });
    expect(dragCrop(box, "n", 50, -30, frame)).toEqual({ ...box, y: 70, height: 130 });
    expect(dragCrop(box, "nw", -20, -10, frame)).toEqual({ x: 80, y: 90, width: 220, height: 110 });
  });

  it("stays inside the frame and at least 1 px", () => {
    expect(dragCrop(box, "w", -500, 0, frame).x).toBe(0);
    expect(dragCrop(box, "se", 5000, 5000, frame)).toEqual({
      x: 100,
      y: 100,
      width: 900,
      height: 400,
    });
    expect(dragCrop(box, "e", -500, 0, frame).width).toBe(1);
  });

  it("moves the whole box, clamped to the frame", () => {
    expect(dragCrop(box, "move", 10.4, -20.6, frame)).toEqual({ ...box, x: 110, y: 79 });
    expect(dragCrop(box, "move", 5000, 5000, frame)).toEqual({ ...box, x: 800, y: 400 });
  });

  it("keeps the proportions with Shift", () => {
    // Corner: the opposite corner stays, 2:1 kept.
    expect(dragCrop(box, "se", 100, 0, frame, true)).toEqual({ ...box, width: 300, height: 150 });
    // Edge: centred across it.
    expect(dragCrop(box, "e", 100, 0, frame, true)).toEqual({
      x: 100,
      y: 75,
      width: 300,
      height: 150,
    });
    // Shrinks rather than leave the frame.
    const r = dragCrop(box, "se", 5000, 0, frame, true);
    expect(r).toEqual({ x: 100, y: 100, width: 800, height: 400 });
  });
});

describe("drawCrop", () => {
  it("draws in any direction, inside the frame", () => {
    expect(drawCrop({ x: 300, y: 200 }, { x: 100, y: 50 }, frame)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    });
    expect(drawCrop({ x: 900, y: 400 }, { x: 2000, y: 900 }, frame)).toEqual({
      x: 900,
      y: 400,
      width: 100,
      height: 100,
    });
  });

  it("draws a square with Shift, as big as fits", () => {
    expect(drawCrop({ x: 100, y: 100 }, { x: 300, y: 150 }, frame, true)).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 200,
    });
    expect(drawCrop({ x: 100, y: 400 }, { x: 400, y: 450 }, frame, true).height).toBe(100);
  });
});

describe("inFrame", () => {
  it("works inside a frame that isn't at the origin", () => {
    const frame2 = { x: 500, y: 200, width: 300, height: 100 };
    const moved = inFrame(frame2, (size, local) =>
      dragCrop(local.rect({ x: 600, y: 250, width: 50, height: 20 }), "move", 5000, -5000, size),
    );
    expect(moved).toEqual({ x: 750, y: 200, width: 50, height: 20 });
    const drawn = inFrame(frame2, (size, local) =>
      drawCrop(local.point({ x: 0, y: 0 }), local.point({ x: 600, y: 250 }), size),
    );
    expect(drawn).toEqual({ x: 500, y: 200, width: 100, height: 50 });
  });
});

describe("keyboard and fields", () => {
  it("nudges or resizes from the bottom-right", () => {
    expect(nudgeCrop(box, 10, 0, frame, false)).toEqual({ ...box, x: 110 });
    expect(nudgeCrop(box, 0, -1, frame, true)).toEqual({ ...box, height: 99 });
  });

  it("sets the size, moving the box in only if it must", () => {
    expect(resizeCrop(box, 400, 50, frame)).toEqual({ ...box, width: 400, height: 50 });
    expect(resizeCrop(box, 950, 600, frame)).toEqual({ x: 50, y: 0, width: 950, height: 500 });
  });
});
