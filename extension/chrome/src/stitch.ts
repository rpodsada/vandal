// Full-page stitching geometry (PLAN 3N.5), in device pixels. Pure, so it's
// tested without a browser.

/** Chromium's largest canvas side, and Vandal's editor's limit too. */
export const MAX_SIDE = 65_000;
/** Chromium's largest canvas area (16,384 × 16,384). */
export const MAX_AREA = 268_435_456;

/** The tallest image a full page of this width can become. */
export function maxHeight(width: number): number {
  return Math.min(MAX_SIDE, Math.floor(MAX_AREA / Math.max(1, width)));
}

/** One piece of the stitched image: rows `sy…sy+h` of shot `index`, drawn at `dy`. */
export interface Piece {
  index: number;
  sy: number;
  dy: number;
  h: number;
}

/** How shots taken at page offsets `tops` (each `shotH` tall) make one image
 *  at most `limit` tall. Each row comes from the first shot that covered it,
 *  so a last screen that overlaps the one before adds only its new rows.
 *  `tops` must increase. */
export function stitchPlan(
  tops: number[],
  shotH: number,
  limit: number,
): { pieces: Piece[]; height: number } {
  const pieces: Piece[] = [];
  let covered = 0;
  tops.forEach((top, index) => {
    const start = Math.max(top, covered);
    const end = Math.min(top + shotH, limit);
    if (end > start) pieces.push({ index, sy: start - top, dy: start, h: end - start });
    covered = Math.max(covered, end);
  });
  return { pieces, height: covered };
}
