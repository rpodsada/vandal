// Quick edit's markup on the overlay (PLAN 2B.2): a fresh document per
// capture, and the layers Rust composites onto the selection when copying,
// saving or finishing. The overlay page lives across captures, so everything
// here is reset on each load.

import { renderLayer } from "../markup/export";
import { docStore } from "../markup/model/store";
import { emptyDoc } from "../markup/model/types";
import { useToolStore } from "../markup/toolStore";
import { loadToolStyles } from "../editor/toolStylesSync";
import { uploadPixels, type OverlayLoad, type QuickMarkup } from "../shared/ipc";
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
  useToolStore.setState({ tool: "select", editing: null, colorSlot: "border" });
  void loadToolStyles();
}

/** Render the markup over `selection` and hand it to Rust, before an action uses it. */
export async function uploadMarkup(load: OverlayLoad, selection: Rect): Promise<QuickMarkup> {
  // The layers cover the selection (source px = this monitor's physical px).
  const doc = { ...docStore.getState().doc, crop: selection };
  const layer = renderLayer(doc, "annotations");
  const highlights = renderLayer(doc, "highlights");
  await Promise.all([
    layer && uploadPixels(load.layerUrl, layer),
    highlights && uploadPixels(load.highlightsUrl, highlights),
  ]);
  return { layer: layer !== null, highlights: highlights !== null, revision };
}
