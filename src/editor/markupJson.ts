// The editor's markup as text (internal/decisions.md, 2026-10-01): hidden
// editor shortcuts copy it to the clipboard and paste it back, for building
// the screenshot kit's examples and for reproducing bug reports. It's the
// Doc as it is, tagged so a paste can tell it from other text; a start on the
// saved project files in ideas.md.

import type { Doc } from "../markup/model/types";

/** Marks the text as Vandal markup. */
export const MARKUP_KIND = "vandal-markup";

export function markupToJson(doc: Doc): string {
  return JSON.stringify({ kind: MARKUP_KIND, ...doc }, null, 2);
}
