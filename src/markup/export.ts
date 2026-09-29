// The annotation layers for export (PLAN §4.6): straight-alpha RGBA the size of
// `doc.crop`, drawn at 1:1 source pixels whatever the view zoom. Rust
// multiplies the highlights into the base image, then composites the rest over
// it, the same way the surface shows them.

import Konva from "konva";
import type { Annotation, Doc } from "./model/types";

/** Redactions are never rendered for export: Rust bakes them in (PLAN 3D.3). */
export type LayerName = "annotations" | "highlights" | "redactions";

/** The live groups of the markup surface (source-px coordinates). */
const groups: Record<LayerName, Konva.Group | null> = {
  annotations: null,
  highlights: null,
  redactions: null,
};

export function registerAnnotationGroup(name: LayerName, group: Konva.Group | null): void {
  groups[name] = group;
}

/** Which layer an annotation draws in: redactions, then highlights, then the rest. */
export function layerOf(a: Annotation): LayerName {
  return a.kind === "redact"
    ? "redactions"
    : a.kind === "highlighter"
      ? "highlights"
      : "annotations";
}

/**
 * Render one layer over the crop at 1:1, or null when it has nothing in it. A
 * clone goes into an offscreen stage exactly the crop's size, so the result
 * has exact dimensions and never includes selection handles.
 */
export function renderLayer(doc: Doc, name: LayerName): Uint8ClampedArray<ArrayBuffer> | null {
  if (!doc.annotations.some((a) => layerOf(a) === name)) return null;
  const source = groups[name];
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
    const clone = source.clone({ x: -crop.x, y: -crop.y, scaleX: 1, scaleY: 1 });
    // Text being typed into is hidden on screen (the textarea shows it) but exported.
    clone.find(".annotation").forEach((n) => n.visible(true));
    layer.add(clone);
    const canvas = stage.toCanvas({ pixelRatio: 1 });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas context.");
    return ctx.getImageData(0, 0, crop.width, crop.height).data;
  } finally {
    stage.destroy();
  }
}
