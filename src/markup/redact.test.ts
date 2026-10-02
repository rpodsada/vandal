import { describe, expect, it } from "vitest";
import type { RedactMode } from "./model/types";
import {
  blur,
  pixelate,
  redactPixels,
  redactReads,
  redactRect,
  redactStrength,
  type Pixels,
  type PixelRect,
} from "./redact";

/** A `w`×`h` image whose red channel is `f(x, y)`, the rest fixed. */
function image(w: number, h: number, f: (x: number, y: number) => number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([f(x, y), 10, 20, 255], (y * w + x) * 4);
  return { x: 0, y: 0, width: w, height: h, data };
}

function run(img: Pixels, rect: PixelRect, mode: RedactMode, strength: number) {
  const r = redactReads(rect, mode, strength, img)!;
  return redactPixels(img, r.region, mode, strength, r.reads);
}

const whole = (img: Pixels): PixelRect => ({ x: 0, y: 0, width: img.width, height: img.height });

const reds = (p: Uint8ClampedArray) => [...p].filter((_, i) => i % 4 === 0);
const rest = (p: Uint8ClampedArray) =>
  [...p].every((v, i) => i % 4 === 0 || v === [0, 10, 20, 255][i % 4]);

// The same cases as the Rust tests in `src-tauri/src/redact.rs`.
describe("redact", () => {
  it("pixelates blocks from the region's corner", () => {
    const img = image(5, 3, (x, y) => (x * 10 + y * 100) % 256);
    const out = pixelate(img, { x: 1, y: 0, width: 3, height: 3 }, 2);
    expect(reds(out)).toEqual([65, 65, 80, 65, 65, 80, 215, 215, 230]);
    expect(rest(out)).toBe(true);
  });

  it("blurs like the export", () => {
    const img = image(6, 1, (x) => (x === 2 ? 255 : 0));
    const out = blur(img, whole(img), 1, whole(img));
    expect(reds(out)).toEqual([38, 57, 66, 57, 28, 9]);
    expect(rest(out)).toBe(true);
  });

  it("blurs with the pixels around the region", () => {
    const img = image(4, 1, (x) => (x === 0 ? 255 : 0));
    const out = blur(img, { x: 1, y: 0, width: 2, height: 1 }, 1, whole(img));
    expect(reds(out)).toEqual([85, 38]);
  });

  it("raises tiny strengths", () => {
    const img = image(2, 1, (x) => x * 100);
    expect(reds(run(img, whole(img), "pixelate", 0))).toEqual([50, 50]);
    expect(redactStrength("blur", 0)).toBe(1);
    expect(redactStrength("blur", 7.6)).toBe(8);
    expect(redactStrength("solid", 10)).toBe(0);
  });

  it("covers solid black", () => {
    const img = image(3, 2, (x) => x * 50);
    const out = run(img, { x: 1, y: 0, width: 2, height: 2 }, "solid", 0);
    expect([...out]).toEqual(Array(4).fill([0, 0, 0, 255]).flat());
    expect(redactReads({ x: 1, y: 0, width: 2, height: 2 }, "solid", 0, img)?.reads).toEqual({
      x: 1,
      y: 0,
      width: 2,
      height: 2,
    });
  });

  it("reads only inside the image", () => {
    const r = redactReads({ x: -3, y: 2, width: 5, height: 10 }, "blur", 2, {
      width: 8,
      height: 8,
    });
    expect(r).toEqual({
      region: { x: 0, y: 2, width: 2, height: 6 },
      reads: { x: 0, y: 0, width: 8, height: 8 },
    });
    expect(
      redactReads({ x: 9, y: 0, width: 5, height: 5 }, "pixelate", 8, { width: 8, height: 8 }),
    ).toBeNull();
  });

  it("works on a window of the image", () => {
    // Only the pixels the redaction reads, as the preview fetches them.
    // Radius 1 reaches 3 px (three passes), so 3 px either side is enough.
    const full = image(12, 1, (x) => (x === 5 ? 255 : 0));
    const region = { x: 5, y: 0, width: 2, height: 1 };
    const reads = { x: 2, y: 0, width: 8, height: 1 };
    const part: Pixels = {
      ...reads,
      data: full.data.slice(reads.x * 4, (reads.x + reads.width) * 4),
    };
    expect(reds(blur(part, region, 1, reads))).toEqual(reds(blur(full, region, 1, whole(full))));
  });

  it("rounds a rect's edges, not its size", () => {
    expect(redactRect({ x: 1.4, y: 2.6, width: 3.2, height: 1.1 })).toEqual({
      x: 1,
      y: 3,
      width: 4,
      height: 1,
    });
  });
});
