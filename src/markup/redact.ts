// Redaction (PLAN 3D.3): the preview's pixelate and blur. Rust bakes the same
// thing into the export (`src-tauri/src/redact.rs`) with exactly this
// arithmetic, so what you see is what you get. Change both together; the tests
// share their cases.

import { create } from "zustand";
import type { Redaction } from "../shared/ipc";
import type { Doc, RedactAnnotation, RedactMode, Rect } from "./model/types";

/** Smallest pixelate block and blur radius that still hide anything. */
const MIN_BLOCK = 2;
const MIN_RADIUS = 1;
/** Box blur passes (three approximate a Gaussian). */
const PASSES = 3;

/** Whole pixels, like Rust's `PhysicalRect`. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Some of an image's RGBA pixels: the area `x, y, width, height` of it. */
export interface Pixels extends PixelRect {
  data: Uint8ClampedArray;
}

/**
 * The host's base image in source px, for the preview to read from (the
 * editor's image; quick edit's monitor frame). Kept in memory rather than read
 * back from a canvas, which would be slow.
 */
export const useRedactSource = create<{ image: Pixels | null }>(() => ({ image: null }));

/** A redaction's pixels: its rect with rounded edges. */
export function redactRect(rect: Rect): PixelRect {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  return {
    x,
    y,
    width: Math.round(rect.x + rect.width) - x,
    height: Math.round(rect.y + rect.height) - y,
  };
}

/** The strength Rust gets: a whole number, at least the minimum. */
export function redactStrength(mode: RedactMode, strength: number): number {
  return Math.max(mode === "pixelate" ? MIN_BLOCK : MIN_RADIUS, Math.round(strength));
}

export function intersect(a: PixelRect, b: PixelRect): PixelRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/** The redactions to send with an export, bottom to top. */
export function exportRedactions(doc: Doc): Redaction[] {
  return doc.annotations
    .filter((a): a is RedactAnnotation => a.kind === "redact")
    .map((a) => ({
      rect: redactRect(a.rect),
      mode: a.mode,
      strength: redactStrength(a.mode, a.strength),
    }));
}

/**
 * What a redaction needs to read: the image area it covers, plus the margin
 * the blur reaches (clamped to the image). Null if it misses the image.
 */
export function redactReads(
  rect: PixelRect,
  mode: RedactMode,
  strength: number,
  image: { width: number; height: number },
): { region: PixelRect; reads: PixelRect } | null {
  const bounds = { x: 0, y: 0, width: image.width, height: image.height };
  const region = intersect(rect, bounds);
  if (!region) return null;
  if (mode === "pixelate") return { region, reads: region };
  const m = redactStrength(mode, strength) * PASSES;
  const grown = {
    x: region.x - m,
    y: region.y - m,
    width: region.width + 2 * m,
    height: region.height + 2 * m,
  };
  return { region, reads: intersect(grown, bounds) ?? region };
}

/**
 * `region`'s pixels redacted, row by row. `src` must hold what
 * {@link redactReads} says (Rust: `redact::redacted`).
 */
export function redactPixels(
  src: Pixels,
  region: PixelRect,
  mode: RedactMode,
  strength: number,
  reads: PixelRect,
): Uint8ClampedArray<ArrayBuffer> {
  const s = redactStrength(mode, strength);
  return mode === "pixelate" ? pixelate(src, region, s) : blur(src, region, s, reads);
}

function at(src: Pixels, x: number, y: number): number {
  return ((y - src.y) * src.width + (x - src.x)) * 4;
}

/** Blocks from the region's top-left, each the rounded mean of its pixels. */
function pixelate(src: Pixels, region: PixelRect, block: number): Uint8ClampedArray<ArrayBuffer> {
  const { width: w, height: h } = region;
  const out = new Uint8ClampedArray(w * h * 4);
  const sum = [0, 0, 0, 0];
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const bw = Math.min(block, w - bx);
      const bh = Math.min(block, h - by);
      sum.fill(0);
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const i = at(src, region.x + x, region.y + y);
          for (let c = 0; c < 4; c++) sum[c] += src.data[i + c];
        }
      }
      const n = bw * bh;
      const avg = sum.map((v) => Math.floor((v + Math.floor(n / 2)) / n));
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) out.set(avg, (y * w + x) * 4);
      }
    }
  }
  return out;
}

/** Three box-blur passes (each horizontal, then vertical) over `reads`, edges repeated. */
function blur(
  src: Pixels,
  region: PixelRect,
  radius: number,
  reads: PixelRect,
): Uint8ClampedArray<ArrayBuffer> {
  const { width: w, height: h } = reads;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const i = at(src, reads.x, reads.y + y);
    buf.set(src.data.subarray(i, i + w * 4), y * w * 4);
  }
  const line = new Uint8Array(Math.max(w, h) * 4);
  for (let pass = 0; pass < PASSES; pass++) {
    for (let y = 0; y < h; y++) boxPass(buf, y * w * 4, 4, w, radius, line);
    for (let x = 0; x < w; x++) boxPass(buf, x * 4, w * 4, h, radius, line);
  }
  const out = new Uint8ClampedArray(region.width * region.height * 4);
  const ox = region.x - reads.x;
  const oy = region.y - reads.y;
  for (let y = 0; y < region.height; y++) {
    const i = ((oy + y) * w + ox) * 4;
    out.set(buf.subarray(i, i + region.width * 4), y * region.width * 4);
  }
  return out;
}

/** One box blur along `n` pixels, `stride` bytes apart (Rust: `box_pass`). */
function boxPass(
  buf: Uint8ClampedArray,
  start: number,
  stride: number,
  n: number,
  r: number,
  line: Uint8Array,
): void {
  for (let i = 0; i < n; i++) {
    const p = start + i * stride;
    line[i * 4] = buf[p];
    line[i * 4 + 1] = buf[p + 1];
    line[i * 4 + 2] = buf[p + 2];
    line[i * 4 + 3] = buf[p + 3];
  }
  const d = 2 * r + 1;
  const half = Math.floor(d / 2);
  const get = (i: number, c: number) => line[Math.min(Math.max(i, 0), n - 1) * 4 + c];
  for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += get(k, c);
    for (let i = 0; i < n; i++) {
      buf[start + i * stride + c] = Math.floor((sum + half) / d);
      sum += get(i + r + 1, c) - get(i - r, c);
    }
  }
}
