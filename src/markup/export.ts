// The annotation layer for export (PLAN §4.6): straight-alpha RGBA the size of
// `doc.crop`, drawn at 1:1 source pixels whatever the view zoom. Rust
// composites it over the base image.

import type { Doc } from "./model/types";

/** The layer to upload, or null when there is nothing to draw on top. */
export function renderLayer(doc: Doc): Uint8ClampedArray<ArrayBuffer> | null {
  if (doc.annotations.length === 0) return null;
  // Drawing arrives with the first tool (Phase 2A step 5).
  throw new Error("Annotations can't be exported yet.");
}
