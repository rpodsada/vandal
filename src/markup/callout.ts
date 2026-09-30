// Callout geometry (PLAN 3E), in source px: the box around the text and where
// the pointer leaves it.

import type { CalloutAnnotation, CalloutEnd, Point, Rect } from "./model/types";
import { drawnCornerRadius } from "./styles";
import { textBoxPadding } from "./textMeasure";
import { arrowGeometry, arrowHeadSize, textPx } from "./geometry";

/**
 * How far below the text's line boxes the box and underline sit, as a share
 * of the text's size: a line box has more room above the letters than below,
 * so centred on it they looked low (Richard). Moving the box, not the text,
 * keeps the text editor lined up.
 */
const TEXT_DROP = 0.1;

/** The box around a callout's text (`width` × `height` as laid out), with the text box padding. */
export function calloutBox(
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
): Rect {
  const px = textPx(fontSize);
  const pad = textBoxPadding(px);
  return {
    x: x - pad,
    y: y - pad + TEXT_DROP * px,
    width: width + 2 * pad,
    height: height + 2 * pad,
  };
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

/**
 * Everything a callout draws (PLAN 3E.6): its box (which holds an underline
 * too) and its pointer out to the end's reach. `width` × `height`: its text
 * as laid out. A multi-selection's frame goes around this.
 */
export function calloutExtent(a: CalloutAnnotation, width: number, height: number): Rect {
  const box = calloutBox(a.x, a.y, width, height, a.fontSize);
  const reach =
    a.end === "dot"
      ? dotRadius(a.lineWidth)
      : a.end === "arrow"
        ? arrowHeadSize(a.lineWidth).halfWidth
        : a.lineWidth / 2;
  const x0 = Math.min(box.x, a.tip.x - reach);
  const y0 = Math.min(box.y, a.tip.y - reach);
  const x1 = Math.max(box.x + box.width, a.tip.x + reach);
  const y1 = Math.max(box.y + box.height, a.tip.y + reach);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Does a press at `p` grab the pointer's end (PLAN 3E.7)? Within `slop` (the
 * handle's reach, in source px) or on the arrow head or dot, so pressing the
 * end of an unselected callout moves the end, as its handle would.
 */
export function grabsTip(a: CalloutAnnotation, p: Point, slop: number): boolean {
  const reach =
    a.end === "dot"
      ? dotRadius(a.lineWidth)
      : a.end === "arrow"
        ? arrowHeadSize(a.lineWidth).length
        : a.lineWidth / 2;
  return Math.hypot(p.x - a.tip.x, p.y - a.tip.y) <= Math.max(reach, slop);
}

/**
 * Where a callout goes when a group rotation carries it (PLAN 3E.6): its
 * text's centre and its tip moved by `move`, the text staying upright.
 * `width` × `height`: its text as laid out.
 */
export function orbitCallout(
  a: CalloutAnnotation,
  width: number,
  height: number,
  move: (p: Point) => Point,
): CalloutAnnotation {
  const c = { x: a.x + width / 2, y: a.y + height / 2 };
  const moved = move(c);
  return { ...a, x: a.x + moved.x - c.x, y: a.y + moved.y - c.y, tip: move(a.tip) };
}

/**
 * A growing callout at its new `width` (PLAN 3E.5): it grows away from what
 * it points at, so its text never grows over the tip. The edge toward the
 * tip stays put, or the centre when the tip is above or below the text.
 */
export function growCallout(a: CalloutAnnotation, width: number): CalloutAnnotation {
  const x =
    a.tip.x > a.x + a.width
      ? a.x + a.width - width
      : a.tip.x < a.x
        ? a.x
        : a.x + (a.width - width) / 2;
  return { ...a, x, width };
}

/**
 * What Shift snaps a callout's tip around, so the pointer itself takes 45°
 * steps: a box's centre (its pointer lies on the line from there), or the
 * underline's end on the tip's side. `width` × `height`: the text as laid out.
 */
export function pointerPivot(a: CalloutAnnotation, width: number, height: number): Point {
  if (a.shape === "underline") {
    const [left, right] = underlineLayout(a.x, a.y, width, height, a.fontSize, a.tip).line;
    return a.tip.x < a.x + width / 2 ? left : right;
  }
  const box = calloutBox(a.x, a.y, width, height, a.fontSize);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** An underline callout's line and where its pointer starts (PLAN 3E.3). */
export interface UnderlineLayout {
  /** Under the text, or over it when the tip is higher than the text's middle. */
  line: [Point, Point];
  /** The line's end on the tip's side, or null while the tip is inside the text's box. */
  start: Point | null;
}

/**
 * Lay out an underline callout whose text is at (x, y), `width` × `height`: a
 * line a little wider than the text, half a padding below it (or above), and
 * the pointer from the end on the tip's side of the text's centre.
 */
export function underlineLayout(
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  tip: Point,
): UnderlineLayout {
  const px = textPx(fontSize);
  const pad = textBoxPadding(px);
  const above = tip.y < y + height / 2;
  const lineY = (above ? y - pad / 2 : y + height + pad / 2) + TEXT_DROP * px;
  const left = { x: x - pad / 2, y: lineY };
  const right = { x: x + width + pad / 2, y: lineY };
  const box = calloutBox(x, y, width, height, fontSize);
  const inside =
    tip.x >= box.x && tip.x <= box.x + box.width && tip.y >= box.y && tip.y <= box.y + box.height;
  return {
    line: [left, right],
    start: inside ? null : tip.x < x + width / 2 ? left : right,
  };
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
