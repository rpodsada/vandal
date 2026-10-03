// Selection geometry for the region overlay (PLAN 3N.4), in CSS pixels of the
// viewport. Pure, so it's tested without a page.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The rectangle between two points, kept inside the viewport. */
export function fromPoints(ax: number, ay: number, bx: number, by: number, view: Size): Rect {
  const x1 = clamp(Math.min(ax, bx), 0, view.w);
  const y1 = clamp(Math.min(ay, by), 0, view.h);
  const x2 = clamp(Math.max(ax, bx), 0, view.w);
  const y2 = clamp(Math.max(ay, by), 0, view.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** `r` moved by (dx, dy), stopping at the viewport's edges. */
export function moveBy(r: Rect, dx: number, dy: number, view: Size): Rect {
  return {
    ...r,
    x: clamp(r.x + dx, 0, view.w - r.w),
    y: clamp(r.y + dy, 0, view.h - r.h),
  };
}

/** `start` with the edges `handle` names dragged by (dx, dy). Dragging an
 *  edge past the opposite one flips the rectangle, as in Vandal's overlay. */
export function resizeBy(start: Rect, handle: Handle, dx: number, dy: number, view: Size): Rect {
  let x1 = start.x;
  let y1 = start.y;
  let x2 = start.x + start.w;
  let y2 = start.y + start.h;
  if (handle.includes("w")) x1 += dx;
  if (handle.includes("e")) x2 += dx;
  if (handle.includes("n")) y1 += dy;
  if (handle.includes("s")) y2 += dy;
  return fromPoints(x1, y1, x2, y2, view);
}

/** Grow or shrink from the bottom-right corner (Ctrl+arrows), at least 1px. */
export function growBy(r: Rect, dw: number, dh: number, view: Size): Rect {
  return {
    ...r,
    w: clamp(r.w + dw, 1, view.w - r.x),
    h: clamp(r.h + dh, 1, view.h - r.y),
  };
}

/** The crop in image pixels: `scale` image pixels per CSS pixel. */
export function toImage(r: Rect, scale: number, image: Size): Rect {
  const x = clamp(Math.round(r.x * scale), 0, image.w - 1);
  const y = clamp(Math.round(r.y * scale), 0, image.h - 1);
  const x2 = clamp(Math.round((r.x + r.w) * scale), x + 1, image.w);
  const y2 = clamp(Math.round((r.y + r.h) * scale), y + 1, image.h);
  return { x, y, w: x2 - x, h: y2 - y };
}
