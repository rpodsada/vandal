// Curved lines and arrows (PLAN 3D.6). A bent segment is one cubic Bézier
// whose hidden control points follow the bend handle: with the handle in the
// middle (Shift) it matches the circular arc through the ends and the handle;
// slid toward an end, both control points slide too, so the curve leans that
// way and stays smooth. The handle is always on the curve, at its peak. It's
// stored relative to the chord, so moving an end keeps the curve's shape.

import type { Bend, Point } from "./model/types";

/** Handles closer than this to the chord (source px) are straight. */
export const STRAIGHT_EPSILON = 0.5;
/** How far along the chord the handle may go before the curve would hook back. */
const T_MIN = 0.15;
const T_MAX = 0.85;
/** Samples for measuring length along a curve. */
const SAMPLES = 64;

/** A cubic Bézier: start, two control points, end. */
export type Cubic = [Point, Point, Point, Point];

/** Where the bend handle sits: the chord's midpoint when straight. */
export function bendPoint(from: Point, to: Point, bend: Bend | undefined): Point {
  const t = bend?.t ?? 0.5;
  const d = bend?.d ?? 0;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + t * dx - (dy / len) * d, y: from.y + t * dy + (dx / len) * d };
}

/**
 * The bend that puts the handle at `p`, or undefined (straight) within
 * `straightWithin` source px of the chord. `symmetric` (Shift) keeps it on
 * the perpendicular through the chord's midpoint: a circular arc.
 */
export function bendFromPoint(
  from: Point,
  to: Point,
  p: Point,
  symmetric: boolean,
  straightWithin = STRAIGHT_EPSILON,
): Bend | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return undefined;
  const px = p.x - from.x;
  const py = p.y - from.y;
  const d = (px * -dy + py * dx) / len;
  if (Math.abs(d) < Math.max(straightWithin, STRAIGHT_EPSILON)) return undefined;
  const t = symmetric ? 0.5 : Math.min(T_MAX, Math.max(T_MIN, (px * dx + py * dy) / (len * len)));
  return { t, d };
}

/** The same bend seen from the other end (the chord reversed). */
export function reverseBend(bend: Bend | undefined): Bend | undefined {
  return bend && { t: 1 - bend.t, d: -bend.d };
}

/** A bent segment's curve, or null when it's straight. */
export function bentCurve(from: Point, to: Point, bend: Bend | undefined): Cubic | null {
  if (!bend || Math.abs(bend.d) < STRAIGHT_EPSILON) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const u = { x: dx / len, y: dy / len };
  // Toward the bulge.
  const side = Math.sign(bend.d);
  const n = { x: -u.y * side, y: u.x * side };
  // The circular arc with this height over the chord: tan(sweep/4) = h/c.
  const h = Math.abs(bend.d);
  const c = len / 2;
  const r = (c * c + h * h) / (2 * h);
  const half = 2 * Math.atan(h / c); // half the sweep
  // Its standard cubic: control points (4/3)·tan(sweep/4)·r along the end tangents.
  const k = (4 / 3) * (h / c) * r;
  const cos = Math.cos(half);
  const sin = Math.sin(half);
  const out = { x: u.x * cos + n.x * sin, y: u.y * cos + n.y * sin };
  const back = { x: u.x * cos - n.x * sin, y: u.y * cos - n.y * sin };
  // Sliding both control points by δ moves the curve's middle by ¾δ (and
  // keeps its direction there), so this puts the peak at the handle.
  const shift = (4 / 3) * (bend.t - 0.5);
  const sx = shift * dx;
  const sy = shift * dy;
  return [
    { ...from },
    { x: from.x + k * out.x + sx, y: from.y + k * out.y + sy },
    { x: to.x - k * back.x + sx, y: to.y - k * back.y + sy },
    { ...to },
  ];
}

export function cubicPoint([p0, p1, p2, p3]: Cubic, s: number): Point {
  const m = 1 - s;
  const a = m * m * m;
  const b = 3 * m * m * s;
  const c = 3 * m * s * s;
  const d = s * s * s;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Points along the curve, both ends included. */
export function cubicPoints(curve: Cubic, steps = SAMPLES): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => cubicPoint(curve, i / steps));
}

/** Measures a curve: its length, and the parameter at a length along it. */
export function measure(curve: Cubic): { length: number; paramAt: (s: number) => number } {
  const pts = cubicPoints(curve);
  const acc = [0];
  for (let i = 1; i < pts.length; i++)
    acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const length = acc[acc.length - 1];
  const paramAt = (s: number) => {
    if (s <= 0) return 0;
    if (s >= length) return 1;
    let i = 1;
    while (acc[i] < s) i++;
    const f = (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
    return (i - 1 + f) / SAMPLES;
  };
  return { length, paramAt };
}

/** The part of the curve between parameters `s0` and `s1` (de Casteljau). */
export function subCubic(curve: Cubic, s0: number, s1: number): Cubic {
  const left = split(curve, s1)[0];
  return s1 > 0 ? split(left, s0 / s1)[1] : left;
}

function split([p0, p1, p2, p3]: Cubic, s: number): [Cubic, Cubic] {
  const lerp = (a: Point, b: Point) => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
  const a = lerp(p0, p1);
  const b = lerp(p1, p2);
  const c = lerp(p2, p3);
  const ab = lerp(a, b);
  const bc = lerp(b, c);
  const mid = lerp(ab, bc);
  return [
    [p0, a, ab, mid],
    [mid, bc, c, p3],
  ];
}

export function reverseCubic([p0, p1, p2, p3]: Cubic): Cubic {
  return [p3, p2, p1, p0];
}
