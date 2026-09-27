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

/**
 * The box resized or moved by a drag of (`dx`, `dy`) source px on `handle`.
 * `ratio` (width / height) holds the box to that shape: a locked aspect
 * ratio, or the box's own with Shift.
 */
export function dragCrop(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  frame: Size,
  ratio?: number,
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
  return ratio ? keepProportions(start, free, handle, frame, ratio) : free;
}

/** A new box dragged from `from` to `to`, held to `ratio` if given (Shift: 1, a square). */
export function drawCrop(from: Point, to: Point, frame: Size, ratio?: number): Rect {
  const a = { x: clamp(from.x, 0, frame.width), y: clamp(from.y, 0, frame.height) };
  let b = { x: clamp(to.x, 0, frame.width), y: clamp(to.y, 0, frame.height) };
  if (ratio) {
    // The largest box of that shape toward the pointer that fits the frame.
    const sx = Math.sign(b.x - a.x) || 1;
    const sy = Math.sign(b.y - a.y) || 1;
    let w = Math.abs(b.x - a.x);
    let h = Math.abs(b.y - a.y);
    if (w / ratio > h) h = w / ratio;
    else w = h * ratio;
    const roomX = sx > 0 ? frame.width - a.x : a.x;
    const roomY = sy > 0 ? frame.height - a.y : a.y;
    const fit = Math.min(1, roomX / w || 0, roomY / h || 0);
    b = { x: a.x + sx * w * fit, y: a.y + sy * h * fit };
  }
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return round({ x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) });
}

/** Nudge (arrows) or resize from the bottom-right (Ctrl+arrows), like the capture overlay. */
export function nudgeCrop(
  start: Rect,
  dx: number,
  dy: number,
  frame: Size,
  resize: boolean,
  ratio?: number,
): Rect {
  if (!resize) return dragCrop(start, "move", dx, dy, frame);
  // With a ratio, the arrow along the longer side drives the size.
  const d = ratio && !dx ? dy * ratio : dx;
  return dragCrop(start, "se", ratio ? d : dx, ratio ? d / ratio : dy, frame, ratio);
}

/**
 * `rect` with its size set, keeping its top-left where it can (the W/H
 * fields). With a `ratio`, the other side follows the one typed (`changed`),
 * and the box shrinks to fit the frame.
 */
export function resizeCrop(
  rect: Rect,
  width: number,
  height: number,
  frame: Size,
  ratio?: number,
  changed: "width" | "height" = "width",
): Rect {
  let w = width;
  let h = height;
  if (ratio) {
    if (changed === "width") h = w / ratio;
    else w = h * ratio;
    const fit = Math.min(1, frame.width / w, frame.height / h);
    w *= fit;
    h *= fit;
  }
  w = clamp(Math.round(w), 1, frame.width);
  h = clamp(Math.round(h), 1, frame.height);
  return {
    x: Math.min(rect.x, frame.width - w),
    y: Math.min(rect.y, frame.height - h),
    width: w,
    height: h,
  };
}

/** The largest box of `ratio` inside `box`, centred on it (picking an aspect ratio). */
export function fitRatio(box: Rect, ratio: number): Rect {
  let width = box.width;
  let height = width / ratio;
  if (height > box.height) {
    height = box.height;
    width = height * ratio;
  }
  return round({
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  });
}

/**
 * `ratio` applied to a freely dragged box. A corner keeps
 * the opposite corner still; an edge keeps the box centred across it. Shrinks
 * rather than leave the frame.
 */
function keepProportions(
  start: Rect,
  free: Rect,
  handle: Handle,
  frame: Size,
  ratio: number,
): Rect {
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
