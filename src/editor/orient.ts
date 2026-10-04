// Turning a decoded image upright per its EXIF orientation (1–8), the same way
// as Rust's `decode::orient`, so an image file the page decodes itself
// (PLAN 3Q) matches the pixels Rust exports from.

export interface Oriented {
  /** Size once upright: 5–8 swap width and height. */
  width: number;
  height: number;
  /** For `setTransform(a, b, c, d, e, f)` before drawing the unrotated image at 0,0. */
  transform: [number, number, number, number, number, number];
}

/** How to draw a `w` × `h` image upright for `orientation` (anything else: as is). */
export function orientation(orientation: number, w: number, h: number): Oriented {
  const swap = orientation >= 5 && orientation <= 8;
  const size = swap ? { width: h, height: w } : { width: w, height: h };
  const t: Oriented["transform"] = (() => {
    switch (orientation) {
      case 2:
        return [-1, 0, 0, 1, w, 0];
      case 3:
        return [-1, 0, 0, -1, w, h];
      case 4:
        return [1, 0, 0, -1, 0, h];
      case 5:
        return [0, 1, 1, 0, 0, 0];
      case 6:
        return [0, 1, -1, 0, h, 0];
      case 7:
        return [0, -1, -1, 0, h, w];
      case 8:
        return [0, -1, 1, 0, 0, w];
      default:
        return [1, 0, 0, 1, 0, 0];
    }
  })();
  return { ...size, transform: t };
}
