import { describe, expect, it } from "vitest";
import {
  clampView,
  displaySize,
  FIT_MARGIN,
  fitView,
  fitWidthDiffers,
  fitWidthView,
  fitWidthZoom,
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  snapToDevice,
  stepZoom,
  topRow,
  wheelZoomFactor,
  zoomAt,
  zoomLabel,
} from "./view";

const viewport = (w: number, h: number) => ({
  width: w + 2 * FIT_MARGIN,
  height: h + 2 * FIT_MARGIN,
});

describe("fitZoom", () => {
  it("never enlarges past 100%", () => {
    expect(fitZoom({ width: 100, height: 50 }, viewport(1000, 800), 1)).toBe(1);
  });

  it("shrinks to the tighter axis", () => {
    expect(fitZoom({ width: 2000, height: 500 }, viewport(1000, 800), 1)).toBe(0.5);
    expect(fitZoom({ width: 500, height: 1600 }, viewport(1000, 800), 1)).toBe(0.5);
  });

  it("counts image pixels as device pixels", () => {
    // 1500 device px at 150% is 1000 CSS px: fits exactly.
    expect(fitZoom({ width: 1500, height: 300 }, viewport(1000, 800), 1.5)).toBe(1);
    expect(fitZoom({ width: 3000, height: 300 }, viewport(1000, 800), 1.5)).toBe(0.5);
  });

  it("survives degenerate input", () => {
    expect(fitZoom({ width: 0, height: 10 }, viewport(100, 100), 1)).toBe(1);
    expect(fitZoom({ width: 10, height: 10 }, viewport(100, 100), 0)).toBe(1);
    expect(fitZoom({ width: 100, height: 100 }, { width: 0, height: 0 }, 1)).toBeGreaterThan(0);
  });
});

describe("displaySize", () => {
  it("converts device px to CSS px at a zoom", () => {
    expect(displaySize({ width: 1500, height: 900 }, 0.5, 1.5)).toEqual({
      width: 500,
      height: 300,
    });
  });
});

const vp = { width: 1000, height: 800 };

describe("clampView", () => {
  it("centres an image smaller than the viewport", () => {
    expect(clampView({ zoom: 1, x: -500, y: 900 }, { width: 400, height: 200 }, vp, 1)).toEqual({
      zoom: 1,
      x: 300,
      y: 300,
    });
  });

  it("keeps a large image's edges from moving in past the margin", () => {
    const image = { width: 3000, height: 2000 };
    expect(clampView({ zoom: 1, x: 500, y: 500 }, image, vp, 1)).toMatchObject({
      x: FIT_MARGIN,
      y: FIT_MARGIN,
    });
    expect(clampView({ zoom: 1, x: -9999, y: -9999 }, image, vp, 1)).toMatchObject({
      x: 1000 - FIT_MARGIN - 3000,
      y: 800 - FIT_MARGIN - 2000,
    });
    expect(clampView({ zoom: 1, x: -100, y: -200 }, image, vp, 1)).toMatchObject({
      x: -100,
      y: -200,
    });
  });

  it("treats each axis on its own", () => {
    // Wide and short: x is free within limits, y is centred.
    const v = clampView({ zoom: 1, x: -50, y: 0 }, { width: 3000, height: 100 }, vp, 1);
    expect(v).toEqual({ zoom: 1, x: -50, y: 350 });
  });
});

describe("fitView", () => {
  it("fits and centres", () => {
    const v = fitView({ width: 2000, height: 500 }, viewport(1000, 800), 1);
    expect(v.zoom).toBe(0.5);
    expect(v.x).toBe(FIT_MARGIN);
    expect(v.y).toBeCloseTo((800 + 2 * FIT_MARGIN - 250) / 2);
  });
});

describe("fitWidthZoom", () => {
  it("fits the width only", () => {
    // A 1000 × 5000 capture in an 800-wide window: 80%, though it's far too tall to fit.
    expect(fitWidthZoom({ width: 1000, height: 5000 }, viewport(800, 600), 1)).toBe(0.8);
  });

  it("never enlarges", () => {
    expect(fitWidthZoom({ width: 400, height: 5000 }, viewport(800, 600), 1)).toBe(1);
  });

  it("works in device px", () => {
    expect(fitWidthZoom({ width: 2400, height: 9000 }, viewport(800, 600), 1.5)).toBe(0.5);
  });
});

describe("fitWidthDiffers", () => {
  it("is true when the height limits Fit", () => {
    expect(fitWidthDiffers({ width: 1000, height: 5000 }, viewport(800, 600), 1)).toBe(true);
  });

  it("is false for a wide image, or one that fits at 100%", () => {
    expect(fitWidthDiffers({ width: 1600, height: 900 }, viewport(800, 600), 1)).toBe(false);
    expect(fitWidthDiffers({ width: 400, height: 300 }, viewport(800, 600), 1)).toBe(false);
  });
});

describe("fitWidthView", () => {
  const tall = { width: 1000, height: 5000 };

  it("starts at the top of a tall image", () => {
    const v = fitWidthView(tall, viewport(800, 600), 1);
    expect(v).toEqual({ zoom: 0.8, x: FIT_MARGIN, y: FIT_MARGIN });
  });

  it("puts a given row at the top, and round-trips through topRow", () => {
    const v = fitWidthView(tall, viewport(800, 600), 1, 2000);
    expect(topRow(v, 1)).toBeCloseTo(2000);
    // After a resize the same row stays at the top.
    const w = fitWidthView(tall, viewport(500, 600), 1, topRow(v, 1));
    expect(topRow(w, 1)).toBeCloseTo(2000);
  });

  it("stops at the bottom", () => {
    const v = fitWidthView(tall, viewport(800, 600), 1, 4990);
    const shown = v.y + 5000 * 0.8;
    expect(shown).toBeCloseTo(600 + FIT_MARGIN);
  });

  it("centres a short image like Fit", () => {
    const v = fitWidthView({ width: 1000, height: 100 }, viewport(800, 600), 1);
    expect(v.y).toBeCloseTo((600 + 2 * FIT_MARGIN - 80) / 2);
  });
});

describe("zoomAt", () => {
  const image = { width: 4000, height: 3000 };

  it("keeps the image point under the anchor still", () => {
    const view = { zoom: 0.5, x: -100, y: -50 };
    const anchor = { x: 400, y: 300 };
    const before = { x: (anchor.x - view.x) / view.zoom, y: (anchor.y - view.y) / view.zoom };
    const next = zoomAt(view, 1, anchor, image, vp, 1);
    const after = { x: (anchor.x - next.x) / next.zoom, y: (anchor.y - next.y) / next.zoom };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps the zoom range", () => {
    const view = { zoom: 1, x: 0, y: 0 };
    expect(zoomAt(view, 1000, { x: 0, y: 0 }, image, vp, 1).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(view, 0, { x: 0, y: 0 }, image, vp, 1).zoom).toBe(MIN_ZOOM);
  });
});

describe("panBy", () => {
  it("moves and clamps", () => {
    const image = { width: 3000, height: 2000 };
    const v = panBy({ zoom: 1, x: -100, y: -100 }, -50, 20, image, vp, 1);
    expect(v).toEqual({ zoom: 1, x: -150, y: -80 });
    expect(panBy(v, 10_000, 0, image, vp, 1).x).toBe(FIT_MARGIN);
  });
});

describe("stepZoom", () => {
  it("goes to the next preset either way", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(0.8, 1)).toBe(1);
    expect(stepZoom(0.8, -1)).toBe(0.75);
  });

  it("stops at the ends", () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(0.1, -1)).toBe(MIN_ZOOM);
  });
});

describe("helpers", () => {
  it("wheel notches zoom symmetrically", () => {
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1);
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
  });

  it("snaps to device pixels", () => {
    expect(snapToDevice(10.3, 1)).toBe(10);
    expect(snapToDevice(10.5, 1.5)).toBeCloseTo(10.6667); // 15.75 device px -> 16
  });

  it("labels zoom", () => {
    expect(zoomLabel(0.6667)).toBe("67%");
    expect(zoomLabel(1.5)).toBe("150%");
  });
});
