import { describe, expect, it } from "vitest";
import { emptyDoc, type Annotation, type Doc } from "../markup/model/types";
import { MARKUP_KIND, markupFromJson, markupToJson, readMarkup } from "./markupJson";

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
