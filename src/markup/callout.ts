// Callout geometry (PLAN 3E), in source px: the box around the text and where
// the pointer leaves it.

import type { CalloutEnd, Point, Rect } from "./model/types";
import { drawnCornerRadius } from "./styles";
import { textBoxPadding } from "./textMeasure";
import { arrowGeometry, textPx } from "./geometry";

/** The box around a callout's text (`width` × `height` as laid out), with the text box padding. */
export function calloutBox(
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
): Rect {
  const pad = textBoxPadding(textPx(fontSize));
  return { x: x - pad, y: y - pad, width: width + 2 * pad, height: height + 2 * pad };
}

/**
 * Where the pointer starts: the point where the line from the box's centre to
 * `tip` leaves the box (rounded by `radius`), or null when the tip is inside
 * the box, which hides the pointer.
 */
export function pointerStart(box: Rect, radius: number, tip: Point): Point | null {
  const hw = box.width / 2;
  const hh = box.height / 2;
  const c = { x: box.x + hw, y: box.y + hh };
  const dx = tip.x - c.x;
  const dy = tip.y - c.y;
  const r = drawnCornerRadius(radius, box.width, box.height);
  if (insideRoundedBox(dx, dy, hw, hh, r)) return null;
  // Where the ray leaves the square-cornered box.
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  const ex = dx * t;
  const ey = dy * t;
  if (r > 0 && Math.abs(ex) > hw - r && Math.abs(ey) > hh - r) {
    // In a rounded corner: where the ray meets that corner's circle, farther root.
    const ccx = Math.sign(ex) * (hw - r);
    const ccy = Math.sign(ey) * (hh - r);
    const a = dx * dx + dy * dy;
    const b = -2 * (dx * ccx + dy * ccy);
    const cc = ccx * ccx + ccy * ccy - r * r;
    const s = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * cc))) / (2 * a);
    return { x: c.x + dx * s, y: c.y + dy * s };
  }
  return { x: c.x + ex, y: c.y + ey };
}

/** Is (dx, dy), from the centre, inside a box of half-size hw × hh with corners rounded by r? */
function insideRoundedBox(dx: number, dy: number, hw: number, hh: number, r: number): boolean {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > hw || ay > hh) return false;
  if (ax <= hw - r || ay <= hh - r) return true;
  return Math.hypot(ax - (hw - r), ay - (hh - r)) <= r;
}

/** A dot end's radius for a pointer thickness: clearly wider than the line. */
export function dotRadius(width: number): number {
  return 2 + 1.25 * width;
}

export interface PointerGeometry {
  /** The line to stroke. */
  shaft: [Point, Point];
  /** A filled arrow head [left, tip, right]. */
  head: [Point, Point, Point] | null;
  /** A filled dot centred on the tip. */
  dot: { center: Point; radius: number } | null;
}

/**
 * The pointer from `start` (on the box) to `tip` with its end (PLAN 3E.2): an
 * arrow's shaft stops at the head's base, like the arrow tool's, and its head
 * shrinks on a short pointer; a dot is centred on the tip.
 */
export function pointerGeometry(
  start: Point,
  tip: Point,
  end: CalloutEnd,
  width: number,
): PointerGeometry {
  if (end === "arrow") {
    const g = arrowGeometry(start, tip, "filled", width);
    const s = g.shaft;
    const shaft: [Point, Point] =
      s.kind === "line"
        ? [
            { x: s.points[0], y: s.points[1] },
            { x: s.points[2], y: s.points[3] },
          ]
        : [start, tip];
    return { shaft, head: g.heads[0] ?? null, dot: null };
  }
  if (end === "dot")
    return { shaft: [start, tip], head: null, dot: { center: tip, radius: dotRadius(width) } };
  return { shaft: [start, tip], head: null, dot: null };
}

/**
 * The pointer as a quad `width` wide around `from`–`to`, for hit testing (a
 * text node has no stroke to hit with).
 */
export function segmentQuad(from: Point, to: Point, width: number): Point[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const nx = (-(to.y - from.y) / len) * (width / 2);
  const ny = ((to.x - from.x) / len) * (width / 2);
  return [
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny },
  ];
}
