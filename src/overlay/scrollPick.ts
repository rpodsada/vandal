// Scrolling capture on the overlay (PLAN 3K.4): the area under the pointer,
// as Rust found it. Virtual-desktop physical pixels.

import type { ScrollArea } from "../shared/ipc";
import type { Point, Rect } from "./selection";

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

/** "984 × 1171 · about 4 screens tall", or "· scrolls" when the length is unknown. */
export function areaLabel(area: ScrollArea): string {
  const { width, height } = area.rect;
  const screens = area.screens;
  const tall =
    screens == null ? "scrolls" : `about ${Math.max(2, Math.round(screens))} screens tall`;
  return `${width} × ${height} · ${tall}`;
}
