// Pure geometry for the markup tools, in source-image pixels.

import type { Annotation, Point, Rect } from "./model/types";

/** Rect spanned by a drag from `a` to `b`. With `square`, the shorter side grows to match. */
export function rectFromDrag(a: Point, b: Point, square = false): Rect {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = side * (Math.sign(dx) || 1);
    dy = side * (Math.sign(dy) || 1);
  }
  return {
    x: Math.min(a.x, a.x + dx),
    y: Math.min(a.y, a.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Axis-aligned box of `r` rotated by `degrees` about its centre. */
export function rotatedBounds(r: Rect, degrees: number): Rect {
  if (!degrees) return r;
  const t = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(t));
  const sin = Math.abs(Math.sin(t));
  const w = r.width * cos + r.height * sin;
  const h = r.width * sin + r.height * cos;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

function pointsBounds(xs: number[], ys: number[]): Rect {
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Approximate on-image bounds, for box selection. Stroke width is ignored. */
export function annotationBounds(a: Annotation): Rect {
  switch (a.kind) {
    case "rect":
    case "ellipse":
      return rotatedBounds(a.rect, a.rotation);
    case "line":
    case "arrow":
      return pointsBounds([a.from.x, a.to.x], [a.from.y, a.to.y]);
    case "pen":
    case "highlighter":
      return pointsBounds(
        a.points.filter((_, i) => i % 2 === 0),
        a.points.filter((_, i) => i % 2 === 1),
      );
    case "text": {
      const lines = Math.max(1, a.text.split("\n").length);
      const box = { x: a.x, y: a.y, width: a.width, height: lines * a.fontSize * 1.3 };
      return rotatedBounds(box, a.rotation);
    }
  }
}

/** `a` moved by (dx, dy). */
export function translateAnnotation<A extends Annotation>(a: A, dx: number, dy: number): A {
  const p = (q: Point) => ({ x: q.x + dx, y: q.y + dy });
  switch (a.kind) {
    case "rect":
    case "ellipse":
      return { ...a, rect: { ...a.rect, x: a.rect.x + dx, y: a.rect.y + dy } };
    case "line":
    case "arrow":
      return { ...a, from: p(a.from), to: p(a.to) };
    case "pen":
    case "highlighter":
      return { ...a, points: a.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
    case "text":
      return { ...a, x: a.x + dx, y: a.y + dy };
  }
  return a;
}
