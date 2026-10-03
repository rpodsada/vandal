// Selection geometry for one overlay, in monitor-local *physical* pixels
// (integers). Pure functions so the interaction logic is unit-testable.

import { dragCrop, drawCrop, type Handle } from "../editor/cropGeometry";

export interface Point {
  x: number;
  y: number;
}

/** Half-open: covers x..x+width, y..y+height. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Edges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

export type Hit = { kind: "inside" } | { kind: "edge"; edges: Edges } | null;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function fromEdges(left: number, top: number, right: number, bottom: number): Rect {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Clamp a point to a pixel inside the monitor. */
export function clampPoint(p: Point, bounds: Size): Point {
  return { x: clamp(p.x, 0, bounds.width - 1), y: clamp(p.y, 0, bounds.height - 1) };
}

/** Rect covering both pixels (inclusive) of a drag, clamped to the monitor. */
export function rectFromDrag(anchor: Point, current: Point, bounds: Size): Rect {
  const a = clampPoint(anchor, bounds);
  const b = clampPoint(current, bounds);
  return fromEdges(
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.max(a.x, b.x) + 1,
    Math.max(a.y, b.y) + 1,
  );
}

/** Move without resizing; stops at the monitor edges. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, bounds.width - rect.width),
    y: clamp(rect.y + dy, 0, bounds.height - rect.height),
  };
}

/**
 * Drag the given edges by (dx, dy). Dragging an edge past its opposite flips
 * the rect rather than inverting it. Never smaller than 1×1.
 */
export function resizeRect(rect: Rect, edges: Edges, dx: number, dy: number, bounds: Size): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (edges.left) left = clamp(left + dx, 0, bounds.width);
  if (edges.right) right = clamp(right + dx, 0, bounds.width);
  if (edges.top) top = clamp(top + dy, 0, bounds.height);
  if (edges.bottom) bottom = clamp(bottom + dy, 0, bounds.height);
  if (left > right) [left, right] = [right, left];
  if (top > bottom) [top, bottom] = [bottom, top];
  if (right - left < 1) {
    if (right < bounds.width) right = left + 1;
    else left = right - 1;
  }
  if (bottom - top < 1) {
    if (bottom < bounds.height) bottom = top + 1;
    else top = bottom - 1;
  }
  return fromEdges(left, top, right, bottom);
}

/** A square dragged from `anchor` toward `current` (Shift, PLAN 3O.2), as the editor's crop draws one. */
export function squareFromDrag(anchor: Point, current: Point, bounds: Size): Rect {
  // From the anchor pixel's far side to the current pixel's, so the square
  // covers both, as `rectFromDrag` does.
  const a = clampPoint(anchor, bounds);
  const b = clampPoint(current, bounds);
  const right = b.x >= a.x;
  const down = b.y >= a.y;
  return drawCrop(
    { x: right ? a.x : a.x + 1, y: down ? a.y : a.y + 1 },
    { x: right ? b.x + 1 : b.x, y: down ? b.y + 1 : b.y },
    bounds,
    1,
  );
}

/**
 * Drag a corner by (dx, dy) keeping the rect's proportions (Shift, PLAN
 * 3O.2), as the editor's crop does: the opposite corner stays put, and it
 * shrinks rather than leave the monitor. An edge resizes freely.
 */
export function resizeKeepingShape(
  rect: Rect,
  edges: Edges,
  dx: number,
  dy: number,
  bounds: Size,
): Rect {
  const corner = cornerOf(edges);
  if (!corner) return resizeRect(rect, edges, dx, dy, bounds);
  return dragCrop(rect, corner, dx, dy, bounds, rect.width / rect.height);
}

function cornerOf(e: Edges): Handle | null {
  if ((e.left || e.right) && (e.top || e.bottom))
    return `${e.top ? "n" : "s"}${e.left ? "w" : "e"}` as Handle;
  return null;
}

/**
 * Keyboard resize: grow/shrink from the right and bottom edges, keeping the
 * top-left fixed. Unlike `resizeRect` it never flips; it stops at 1px and at
 * the monitor edge.
 */
export function growRect(rect: Rect, dw: number, dh: number, bounds: Size): Rect {
  return {
    ...rect,
    width: clamp(rect.width + dw, 1, bounds.width - rect.x),
    height: clamp(rect.height + dh, 1, bounds.height - rect.y),
  };
}

/**
 * What's under `p`: an edge/corner handle (within `tolerance` px of the
 * border), the inside of the rect, or nothing. Corners win over edges.
 */
export function hitTest(rect: Rect, p: Point, tolerance: number): Hit {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const inX = p.x >= rect.x - tolerance && p.x <= right + tolerance;
  const inY = p.y >= rect.y - tolerance && p.y <= bottom + tolerance;
  if (!inX || !inY) return null;
  const edges: Edges = {
    left: Math.abs(p.x - rect.x) <= tolerance,
    right: Math.abs(p.x - right) <= tolerance,
    top: Math.abs(p.y - rect.y) <= tolerance,
    bottom: Math.abs(p.y - bottom) <= tolerance,
  };
  // A tiny rect is within tolerance of both sides; prefer the nearer one.
  if (edges.left && edges.right) {
    edges.left = Math.abs(p.x - rect.x) < Math.abs(p.x - right);
    edges.right = !edges.left;
  }
  if (edges.top && edges.bottom) {
    edges.top = Math.abs(p.y - rect.y) < Math.abs(p.y - bottom);
    edges.bottom = !edges.top;
  }
  if (edges.left || edges.right || edges.top || edges.bottom) return { kind: "edge", edges };
  const inside = p.x >= rect.x && p.x < right && p.y >= rect.y && p.y < bottom;
  return inside ? { kind: "inside" } : null;
}

/** CSS cursor for a hit. */
export function cursorFor(hit: Hit): string {
  if (!hit) return "crosshair";
  if (hit.kind === "inside") return "move";
  const { left, right, top, bottom } = hit.edges;
  if ((left && top) || (right && bottom)) return "nwse-resize";
  if ((right && top) || (left && bottom)) return "nesw-resize";
  if (left || right) return "ew-resize";
  return "ns-resize";
}

/** Arrow-key direction → (dx, dy), or null for other keys. */
export function arrowDelta(key: string, step: number): Point | null {
  switch (key) {
    case "ArrowLeft":
      return { x: -step, y: 0 };
    case "ArrowRight":
      return { x: step, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -step };
    case "ArrowDown":
      return { x: 0, y: step };
    default:
      return null;
  }
}
