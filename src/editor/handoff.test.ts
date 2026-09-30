import { describe, expect, it } from "vitest";
import type { EditorInit } from "../shared/ipc";
import type { Annotation } from "../markup/model/types";
import { initialDoc } from "./handoff";

const init: EditorInit = {
  editorId: 1,
  width: 1920,
  height: 1080,
  crop: { x: 100, y: 50, width: 400, height: 300 },
  url: "",
  layerUrl: "",
  highlightsUrl: "",
  markup: null,
  file: null,
  delivered: false,
  empty: false,
};

const style = { color: "#e53935", width: 4, opacity: 1 };

describe("initialDoc", () => {
  it("is empty with the crop when nothing was handed over", () => {
    const doc = initialDoc(init);
    expect(doc.annotations).toEqual([]);
    expect(doc.crop).toEqual(init.crop);
    expect(doc.source).toEqual({ width: 1920, height: 1080 });
  });

  it("shifts handed-over annotations into the base image", () => {
    // Drawn on a monitor at x = -1920: virtual-desktop coordinates are negative.
    const annotations: Annotation[] = [
      { id: "a1", kind: "line", from: { x: -1800, y: 60 }, to: { x: -1700, y: 90 }, style },
      { id: "a2", kind: "pen", points: [-1800, 60, -1790, 70], style },
    ];
    const doc = initialDoc({
      ...init,
      markup: { annotations: JSON.stringify(annotations), dx: 1920, dy: 0 },
    });
    expect(doc.annotations).toEqual([
      { id: "a1", kind: "line", from: { x: 120, y: 60 }, to: { x: 220, y: 90 }, style },
      { id: "a2", kind: "pen", points: [120, 60, 130, 70], style },
    ]);
  });
});
