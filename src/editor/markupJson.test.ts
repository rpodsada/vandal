import { describe, expect, it } from "vitest";
import { emptyDoc, type Annotation, type Doc, type ShapeAnnotation } from "../markup/model/types";
import {
  MARKUP_KIND,
  markupFromJson,
  markupToJson,
  placePasted,
  readMarkup,
  type Markup,
} from "./markupJson";

const step: Annotation = {
  kind: "step",
  id: "s1",
  x: 10,
  y: 12,
  seq: 1,
  shape: "circle",
  size: 44,
  color: "#fb8c00",
  textColor: "#ffffff",
  fontFamily: "Arial",
  format: "numbers",
  start: 1,
};

const made: Doc = {
  ...emptyDoc({ width: 40, height: 30 }, { x: 1, y: 2, width: 10, height: 20 }),
  annotations: [step],
};

describe("markupToJson", () => {
  it("is the Doc, tagged", () => {
    const parsed = JSON.parse(markupToJson(made)) as unknown;
    expect(parsed).toEqual({ kind: MARKUP_KIND, ...made });
  });
});

describe("markupFromJson", () => {
  it("round-trips onto an image of the same size, crop included", () => {
    const result = markupFromJson(markupToJson(made), emptyDoc({ width: 40, height: 30 }));
    expect(result).toEqual({ ok: true, doc: made });
  });

  it("keeps the current crop on an image of another size", () => {
    const current = emptyDoc({ width: 80, height: 60 });
    const result = markupFromJson(markupToJson(made), current);
    expect(result).toEqual({
      ok: true,
      doc: { ...current, annotations: [step] },
      madeFor: { width: 40, height: 30 },
    });
  });

  it("refuses other text", () => {
    const current = emptyDoc({ width: 40, height: 30 });
    for (const text of ["hello", "[]", "{}", JSON.stringify({ ...made, kind: "other" })]) {
      expect(markupFromJson(text, current).ok).toBe(false);
    }
  });

  it("refuses another version, unknown kinds, and missing or repeated ids", () => {
    const current = emptyDoc({ width: 40, height: 30 });
    const variants = [
      { ...made, version: 2 },
      { ...made, annotations: [{ ...step, kind: "blob" }] },
      { ...made, annotations: [{ ...step, id: undefined }] },
      { ...made, annotations: [step, step] },
      { ...made, crop: null },
    ];
    for (const v of variants) {
      expect(markupFromJson(JSON.stringify({ kind: MARKUP_KIND, ...v }), current).ok).toBe(false);
    }
  });
});

describe("readMarkup", () => {
  it("gives what it was made on and its annotations", () => {
    expect(readMarkup(markupToJson(made))).toEqual({
      ok: true,
      markup: { source: made.source, crop: made.crop, annotations: [step] },
    });
  });

  it("refuses text that isn't markup", () => {
    expect(readMarkup("hello").ok).toBe(false);
  });
});

describe("placePasted", () => {
  // A 20×20 rectangle at (30, 40) of the source, copied with the crop at (10, 20).
  const box = (x: number, y: number, width = 20, height = 20): Annotation =>
    ({
      kind: "rect",
      id: "r",
      rect: { x, y, width, height },
      rotation: 0,
      style: { color: "#e53935", width: 4, opacity: 1 },
      fill: null,
      cornerRadius: 0,
    }) as unknown as Annotation;
  const copied = (a: Annotation, crop = { x: 10, y: 20, width: 200, height: 100 }): Markup => ({
    source: { width: 400, height: 300 },
    crop,
    annotations: [a],
  });
  const rectOf = (as: Annotation[]) => (as[0] as ShapeAnnotation).rect;

  it("leaves it in place in the same visible area", () => {
    const a = box(30, 40);
    expect(placePasted(copied(a), { x: 10, y: 20, width: 200, height: 100 })[0]).toBe(a);
  });

  it("keeps its place relative to the visible area's corner", () => {
    const placed = placePasted(copied(box(30, 40)), { x: 0, y: 0, width: 200, height: 100 });
    expect(rectOf(placed)).toMatchObject({ x: 20, y: 20 });
  });

  it("slides in just far enough when it would leave the area", () => {
    const placed = placePasted(copied(box(190, 110)), { x: 0, y: 0, width: 100, height: 60 });
    expect(rectOf(placed)).toMatchObject({ x: 80, y: 40 });
  });

  it("is centred when bigger than the area", () => {
    const placed = placePasted(copied(box(10, 20, 120, 20)), {
      x: 0,
      y: 0,
      width: 100,
      height: 60,
    });
    expect(rectOf(placed)).toMatchObject({ x: -10, y: 0 });
  });

  it("moves several objects together, keeping their layout", () => {
    const markup: Markup = {
      ...copied(box(10, 20)),
      annotations: [box(10, 20), { ...box(90, 20), id: "s" } as Annotation],
    };
    const placed = placePasted(markup, { x: 0, y: 0, width: 50, height: 50 });
    const xs = placed.map((a) => (a as ShapeAnnotation).rect.x);
    // 100 px wide in a 50 px area: centred, still 80 apart.
    expect(xs).toEqual([-25, 55]);
  });
});
