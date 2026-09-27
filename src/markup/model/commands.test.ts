import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  removeAnnotations,
  reorderAnnotations,
  setCrop,
  updateAnnotation,
} from "./commands";
import { emptyDoc, type Annotation, type Doc } from "./types";

const style = { color: "#e53935", width: 4, opacity: 1 };
const line = (id: string): Annotation => ({
  id,
  kind: "line",
  from: { x: 0, y: 0 },
  to: { x: 10, y: 10 },
  style,
});
const withIds = (...ids: string[]): Doc => ({
  ...emptyDoc({ width: 100, height: 80 }),
  annotations: ids.map(line),
});
const order = (doc: Doc) => doc.annotations.map((a) => a.id).join("");

describe("emptyDoc", () => {
  it("crops to the whole source by default", () => {
    expect(emptyDoc({ width: 100, height: 80 }).crop).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
  });
});

describe("add / update / remove", () => {
  it("adds on top", () => {
    const doc = addAnnotation(withIds("a"), line("b"));
    expect(order(doc)).toBe("ab");
  });

  it("updates one annotation and shares the rest", () => {
    const before = withIds("a", "b");
    const after = updateAnnotation(before, "b", (a) => ({ ...a, style: { ...style, width: 9 } }));
    expect(after).not.toBe(before);
    expect(after.annotations[0]).toBe(before.annotations[0]);
    expect((after.annotations[1] as { style: { width: number } }).style.width).toBe(9);
  });

  it("returns the same doc for no-ops", () => {
    const doc = withIds("a");
    expect(updateAnnotation(doc, "missing", (a) => ({ ...a }))).toBe(doc);
    expect(updateAnnotation(doc, "a", (a) => a)).toBe(doc);
    expect(removeAnnotations(doc, ["missing"])).toBe(doc);
  });

  it("refuses to change id or kind", () => {
    expect(() => updateAnnotation(withIds("a"), "a", (a) => ({ ...a, id: "z" }))).toThrow();
  });

  it("removes several", () => {
    expect(order(removeAnnotations(withIds("a", "b", "c"), ["a", "c"]))).toBe("b");
  });
});

describe("reorderAnnotations", () => {
  const doc = withIds("a", "b", "c", "d");

  it("brings to front and sends to back, keeping relative order", () => {
    expect(order(reorderAnnotations(doc, ["c", "a"], "front"))).toBe("bdac");
    expect(order(reorderAnnotations(doc, ["d", "b"], "back"))).toBe("bdac");
  });

  it("moves one step", () => {
    expect(order(reorderAnnotations(doc, ["b"], "forward"))).toBe("acbd");
    expect(order(reorderAnnotations(doc, ["c"], "backward"))).toBe("acbd");
    expect(order(reorderAnnotations(doc, ["a", "b"], "forward"))).toBe("cabd");
  });

  it("is a no-op at the ends", () => {
    expect(reorderAnnotations(doc, ["d"], "front")).toBe(doc);
    expect(reorderAnnotations(doc, ["d"], "forward")).toBe(doc);
    expect(reorderAnnotations(doc, ["a"], "backward")).toBe(doc);
  });
});

describe("setCrop", () => {
  const doc = emptyDoc({ width: 100, height: 80 });

  it("clamps to the source and rounds to pixels", () => {
    expect(setCrop(doc, { x: -10, y: 10.4, width: 50, height: 200 }).crop).toEqual({
      x: 0,
      y: 10,
      width: 40,
      height: 70,
    });
  });

  it("refuses an empty crop and ignores an unchanged one", () => {
    expect(setCrop(doc, { x: 200, y: 0, width: 10, height: 10 })).toBe(doc);
    expect(setCrop(doc, { x: 0, y: 0, width: 100, height: 80 })).toBe(doc);
  });
});
