// Quick edit's markup on the overlay (PLAN 2B.2): a fresh document per
// capture, and the layers Rust composites onto the selection when copying,
// saving or finishing. The overlay page lives across captures, so everything
// here is reset on each load.

import { renderLayer } from "../markup/export";
import { exportRedactions } from "../markup/redact";
import { translateAnnotation } from "../markup/geometry";
import { docStore } from "../markup/model/store";
import { emptyDoc } from "../markup/model/types";
import { finishTextEdit } from "../markup/textEditing";
import { useToolStore } from "../markup/toolStore";
import { loadToolStyles } from "../editor/toolStylesSync";
import { setTextRecognizer } from "../markup/textRedact";
import { commands, uploadPixels, type OverlayLoad, type QuickMarkup } from "../shared/ipc";
import type { Rect } from "./selection";

/** Counts document changes, so Rust can tell whether a copy is still current. */
let revision = 0;
docStore.subscribe((s, prev) => {
  if (s.doc !== prev.doc) revision++;
});

/** A clean slate for a new capture: no markup, the Select tool, styles as remembered. */
export function resetMarkup(load: OverlayLoad): void {
  // The source is this monitor's frame, in its physical pixels.
  docStore.getState().load(emptyDoc({ width: load.width, height: load.height }));
  // Detect text starts off for every capture, and the last one's words go (PLAN 3J.6).
  useToolStore.setState({ tool: "select", editing: null, colorSlot: "first", redactText: false });
  setTextRecognizer(null);
  void loadToolStyles();
}

/**
 * How Detect text reads the words in `selection` (PLAN 3J.6): Rust works in
 * virtual-desktop px, the document in this monitor's.
 */
export function selectionTextRecognizer(load: OverlayLoad, selection: Rect) {
  const { x: dx, y: dy } = load.physicalBounds;
  const rect = {
    x: Math.round(selection.x) + dx,
    y: Math.round(selection.y) + dy,
    width: Math.round(selection.width),
    height: Math.round(selection.height),
  };
  return async () => {
    const result = await commands.quickRecognizeText(load.captureId, rect);
    if (result.status === "error") return result;
    const lines = result.data.map((line) => ({
      words: line.words.map((w) => ({
        ...w,
        rect: { ...w.rect, x: w.rect.x - dx, y: w.rect.y - dy },
      })),
    }));
    return { status: "ok" as const, data: lines };
  };
}

/**
 * The annotations for an editor to take over, as JSON in virtual-desktop px
 * (the document's are this monitor's physical px). A text being typed is
 * finished first.
 */
export function handoffAnnotations(load: OverlayLoad): string {
  if (useToolStore.getState().editing) finishTextEdit();
  const { x, y } = load.physicalBounds;
  const annotations = docStore.getState().doc.annotations;
  return JSON.stringify(annotations.map((a) => translateAnnotation(a, x, y)));
}

/** Render the markup over `selection` and hand it to Rust, before an action uses it. */
export async function uploadMarkup(load: OverlayLoad, selection: Rect): Promise<QuickMarkup> {
  const annotations = handoffAnnotations(load);
  // The layers cover the selection (source px = this monitor's physical px).
  const doc = { ...docStore.getState().doc, crop: selection };
  const layer = renderLayer(doc, "annotations");
  const highlights = renderLayer(doc, "highlights");
  await Promise.all([
    layer && uploadPixels(load.layerUrl, layer),
    highlights && uploadPixels(load.highlightsUrl, highlights),
  ]);
  // Rust bakes redactions in itself, in virtual-desktop px like the annotations.
  const { x, y } = load.physicalBounds;
  const redactions = exportRedactions(doc).map((r) => ({
    ...r,
    rect: { ...r.rect, x: r.rect.x + x, y: r.rect.y + y },
  }));
  return {
    layer: layer !== null,
    highlights: highlights !== null,
    redactions,
    revision,
    annotations,
  };
}
