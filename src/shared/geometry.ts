// CSS ↔ physical pixel conversion at the display edge (PLAN §4.4). Mirrors
// `MonitorInfo::css_to_physical` in src-tauri/src/geometry.rs.
import type { PhysicalPoint, PhysicalRect } from "./ipc";

/** Keeps e.g. (2 / 1.5) * 1.5 = 1.9999… on pixel 2. */
const EPS = 1e-6;

export interface CssPoint {
  x: number;
  y: number;
}

/**
 * The parts of `MonitorInfo` needed for conversion. specta types every Rust
 * `f64` as `number | null` (NaN serializes as null); a monitor's scale is never
 * NaN, so callers narrow it once when they receive the monitor.
 */
export interface MonitorGeometry {
  physicalBounds: PhysicalRect;
  scaleFactor: number;
}

/**
 * CSS point on a monitor's overlay → virtual-desktop physical pixel.
 * Physical pixel p covers CSS [p/scale, (p+1)/scale), so we floor.
 */
export function cssToPhysical(monitor: MonitorGeometry, css: CssPoint): PhysicalPoint {
  const { physicalBounds: b, scaleFactor: s } = monitor;
  return {
    x: b.x + Math.floor(css.x * s + EPS),
    y: b.y + Math.floor(css.y * s + EPS),
  };
}

/** Virtual-desktop physical pixel → CSS point on a monitor's overlay. */
export function physicalToCss(monitor: MonitorGeometry, p: PhysicalPoint): CssPoint {
  const { physicalBounds: b, scaleFactor: s } = monitor;
  return { x: (p.x - b.x) / s, y: (p.y - b.y) / s };
}
