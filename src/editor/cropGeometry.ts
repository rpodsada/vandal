// The crop box's geometry (PLAN 2A step 7): resizing by an edge or corner,
// moving, and drawing a new box, always in whole source pixels and inside the
// frame. Pure, so it's tested without a UI. The functions work in the frame's
// own coordinates (its top-left is 0, 0); `inFrame` translates.

import type { Point, Size } from "./view";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a drag holds: an edge, a corner, or the whole box. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The box resized or moved by a drag of (`dx`, `dy`) source px on `handle`. */
export function dragCrop(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  frame: Size,
  keepRatio = false,
): Rect {
  if (handle === "move") {
    return {
      ...start,
      x: Math.round(clamp(start.x + dx, 0, frame.width - start.width)),
      y: Math.round(clamp(start.y + dy, 0, frame.height - start.height)),
    };
  }

  // Each side stays put unless the handle moves it; a side can't cross the
  // opposite one (the box keeps at least 1 px).
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - 1);
  if (handle.includes("e")) right = clamp(right + dx, left + 1, frame.width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - 1);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + 1, frame.height);
  const free = round({ x: left, y: top, width: right - left, height: bottom - top });
  return keepRatio ? keepProportions(start, free, handle, frame) : free;
}

/** A new box dragged from `from` to `to` (Shift: a square). */
export function drawCrop(from: Point, to: Point, frame: Size, square = false): Rect {
  const a = { x: clamp(from.x, 0, frame.width), y: clamp(from.y, 0, frame.height) };
  let b = { x: clamp(to.x, 0, frame.width), y: clamp(to.y, 0, frame.height) };
  if (square) {
    // The largest square toward the pointer that fits the frame.
    const sx = Math.sign(b.x - a.x) || 1;
    const sy = Math.sign(b.y - a.y) || 1;
    const room = Math.min(sx > 0 ? frame.width - a.x : a.x, sy > 0 ? frame.height - a.y : a.y);
    const side = Math.min(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)), room);
    b = { x: a.x + sx * side, y: a.y + sy * side };
  }
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return round({ x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) });
}

/** Nudge (arrows) or resize from the bottom-right (Ctrl+arrows), like the capture overlay. */
export function nudgeCrop(start: Rect, dx: number, dy: number, frame: Size, resize: boolean): Rect {
  return resize ? dragCrop(start, "se", dx, dy, frame) : dragCrop(start, "move", dx, dy, frame);
}

/** `rect` with its size set, keeping its top-left where it can (the W/H fields). */
export function resizeCrop(rect: Rect, width: number, height: number, frame: Size): Rect {
  const w = clamp(Math.round(width), 1, frame.width);
  const h = clamp(Math.round(height), 1, frame.height);
  return {
    x: Math.min(rect.x, frame.width - w),
    y: Math.min(rect.y, frame.height - h),
    width: w,
    height: h,
  };
}

/**
 * The start box's proportions applied to a freely dragged one. A corner keeps
 * the opposite corner still; an edge keeps the box centred across it. Shrinks
 * rather than leave the frame.
 */
function keepProportions(start: Rect, free: Rect, handle: Handle, frame: Size): Rect {
  const ratio = start.width / start.height;
  const horizontal = handle === "e" || handle === "w";
  const vertical = handle === "n" || handle === "s";
  let width = free.width;
  let height = free.height;
  if (horizontal) height = width / ratio;
  else if (vertical) width = height * ratio;
  // A corner follows whichever side moved more, relatively.
  else if (width / start.width > height / start.height) height = width / ratio;
  else width = height * ratio;

  // Where the box grows from, and how much room it has there.
  const anchorX = handle.includes("w")
    ? start.x + start.width
    : handle.includes("e")
      ? start.x
      : start.x + start.width / 2;
  const anchorY = handle.includes("n")
    ? start.y + start.height
    : handle.includes("s")
      ? start.y
      : start.y + start.height / 2;
  const roomX = handle.includes("w")
    ? anchorX
    : handle.includes("e")
      ? frame.width - anchorX
      : 2 * Math.min(anchorX, frame.width - anchorX);
  const roomY = handle.includes("n")
    ? anchorY
    : handle.includes("s")
      ? frame.height - anchorY
      : 2 * Math.min(anchorY, frame.height - anchorY);
  const fit = Math.min(1, roomX / width, roomY / height);
  width = Math.max(1, width * fit);
  height = Math.max(1, height * fit);

  const x = handle.includes("w")
    ? anchorX - width
    : handle.includes("e")
      ? anchorX
      : anchorX - width / 2;
  const y = handle.includes("n")
    ? anchorY - height
    : handle.includes("s")
      ? anchorY
      : anchorY - height / 2;
  return round({ x, y, width, height });
}

/**
 * Run `f` in the coordinates of `frame` (a rect in source px, e.g. the current
 * crop): `local` converts rects and points in, and the result comes back out.
 */
export function inFrame(frame: Rect, f: (size: Size, local: Local) => Rect): Rect {
  const local: Local = {
    rect: (r) => ({ ...r, x: r.x - frame.x, y: r.y - frame.y }),
    point: (p) => ({ x: p.x - frame.x, y: p.y - frame.y }),
  };
  const r = f({ width: frame.width, height: frame.height }, local);
  return { ...r, x: r.x + frame.x, y: r.y + frame.y };
}

interface Local {
  rect: (r: Rect) => Rect;
  point: (p: Point) => Point;
}

function round(r: Rect): Rect {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  return {
    x,
    y,
    width: Math.max(1, Math.round(r.x + r.width) - x),
    height: Math.max(1, Math.round(r.y + r.height) - y),
  };
}
