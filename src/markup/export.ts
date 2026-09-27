// The annotation layer for export (PLAN §4.6): straight-alpha RGBA the size of
// `doc.crop`, drawn at 1:1 source pixels whatever the view zoom. Rust
// composites it over the base image.

import Konva from "konva";
import type { Doc } from "./model/types";

/** The live annotation group of the markup surface (source-px coordinates). */
let source: Konva.Group | null = null;

export function registerAnnotationGroup(group: Konva.Group | null): void {
  source = group;
}

/**
 * Render the annotations over the crop at 1:1, or null when there's nothing
 * on top. A clone goes into an offscreen stage exactly the crop's size, so the
 * result has exact dimensions and never includes selection handles.
 */
export function renderLayer(doc: Doc): Uint8ClampedArray<ArrayBuffer> | null {
  if (doc.annotations.length === 0) return null;
  if (!source) throw new Error("The annotations aren't ready to export yet.");
  const { crop } = doc;
  const stage = new Konva.Stage({
    container: document.createElement("div"),
    width: crop.width,
    height: crop.height,
  });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    layer.add(source.clone({ x: -crop.x, y: -crop.y, scaleX: 1, scaleY: 1 }));
    const canvas = stage.toCanvas({ pixelRatio: 1 });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas context.");
    return ctx.getImageData(0, 0, crop.width, crop.height).data;
  } finally {
    stage.destroy();
  }
}
