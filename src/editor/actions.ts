// Copy / save from the editor: render the annotation layers, send them through
// the capture protocol, then let Rust crop, composite and output.

import { renderLayer } from "../markup/export";
import { docStore } from "../markup/model/store";
import type { Doc } from "../markup/model/types";
import {
  commands,
  uploadPixels,
  type EditorInit,
  type ExportAction,
  type ExportOutcome,
} from "../shared/ipc";

/** The Doc as last copied / saved, so closing doesn't repeat an action. */
const lastOutput: { copied: Doc | null; saved: Doc | null } = { copied: null, saved: null };

export async function exportImage(init: EditorInit, action: ExportAction): Promise<ExportOutcome> {
  const doc = docStore.getState().doc;
  const t0 = performance.now();
  const layer = renderLayer(doc, "annotations");
  const highlights = renderLayer(doc, "highlights");
  await Promise.all([
    layer && uploadPixels(init.layerUrl, layer),
    highlights && uploadPixels(init.highlightsUrl, highlights),
  ]);
  const layerMs = layer || highlights ? performance.now() - t0 : null;
  const result = await commands.editorExport(
    doc.crop,
    layer !== null,
    highlights !== null,
    action,
    layerMs,
  );
  if (result.status === "error") throw new Error(result.error);
  const outcome = result.data;
  if (outcome.kind === "copied") lastOutput.copied = doc;
  if (outcome.kind === "saved") lastOutput.saved = doc;
  // A file's changes are only safe once saved; a capture's once copied or saved.
  if (outcome.kind === "saved" || (outcome.kind === "copied" && !init.file))
    docStore.getState().markOutput(doc);
  return outcome;
}

/** The Doc as loaded was already delivered (reopened from a notification):
 * count it as copied and saved, so closing it unchanged repeats nothing. */
export function markDelivered(doc: Doc): void {
  lastOutput.copied = doc;
  lastOutput.saved = doc;
}

/** Whether the current Doc was already copied / saved (since its last change). */
export function alreadyDone(action: "copy" | "save"): boolean {
  const doc = docStore.getState().doc;
  return (action === "copy" ? lastOutput.copied : lastOutput.saved) === doc;
}
