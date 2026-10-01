// Window mode on the overlay (PLAN 3H): which of the windows recorded at
// capture time is under a point. Virtual-desktop physical pixels.

import type { Point, Rect } from "./selection";

/** Index of the topmost window containing `p` (windows are topmost first). */
export function windowAt(windows: readonly Rect[], p: Point): number | null {
  const i = windows.findIndex(
    (w) => p.x >= w.x && p.x < w.x + w.width && p.y >= w.y && p.y < w.y + w.height,
  );
  return i < 0 ? null : i;
}

/** The part of `rect` on a monitor at `bounds`, in that monitor's local pixels. */
export function visiblePart(rect: Rect, bounds: Rect): Rect | null {
  const left = Math.max(rect.x, bounds.x);
  const top = Math.max(rect.y, bounds.y);
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
  if (right <= left || bottom <= top) return null;
  return { x: left - bounds.x, y: top - bounds.y, width: right - left, height: bottom - top };
}
