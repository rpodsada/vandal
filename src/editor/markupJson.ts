// The editor's markup as text (internal/decisions.md, 2026-10-01): hidden
// editor shortcuts copy it to the clipboard and paste it back, for building
// the screenshot kit's examples and for reproducing bug reports. It's the
// Doc as it is, tagged so a paste can tell it from other text; a start on the
// saved project files in ideas.md.

import { DOC_VERSION, type AnnotationKind, type Doc, type Rect } from "../markup/model/types";

/** Marks the text as Vandal markup. */
export const MARKUP_KIND = "vandal-markup";

export function markupToJson(doc: Doc): string {
  return JSON.stringify({ kind: MARKUP_KIND, ...doc }, null, 2);
}

// A Record so a new kind can't be forgotten here.
const KINDS: Record<AnnotationKind, true> = {
  pen: true,
  highlighter: true,
  line: true,
  arrow: true,
  rect: true,
  ellipse: true,
  text: true,
  redact: true,
  spotlight: true,
  step: true,
  callout: true,
};

export type PastedMarkup =
  | {
      ok: true;
      doc: Doc;
      /** Made for another image size: only its annotations were taken, not its crop. */
      madeFor?: { width: number; height: number };
    }
  | { ok: false; reason: string };

/**
 * `current` with the markup in `text` in place of its own. Checks the shape
 * down to each annotation's kind and id; the rest is trusted (we wrote it).
 */
export function markupFromJson(text: string, current: Doc): PastedMarkup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "the clipboard has no Vandal markup" };
  }
  if (!isObject(data) || data.kind !== MARKUP_KIND) {
    return { ok: false, reason: "the clipboard has no Vandal markup" };
  }
  if (data.version !== DOC_VERSION) {
    return { ok: false, reason: `it's version ${String(data.version)}, not ${DOC_VERSION}` };
  }
  const { source, crop, annotations } = data;
  if (!isSize(source) || !isRect(crop) || !Array.isArray(annotations)) {
    return { ok: false, reason: "it's not complete" };
  }
  const ids = new Set<string>();
  for (const a of annotations as unknown[]) {
    if (!isObject(a) || typeof a.id !== "string" || ids.has(a.id)) {
      return { ok: false, reason: "an annotation has no id, or a repeated one" };
    }
    if (typeof a.kind !== "string" || !Object.prototype.hasOwnProperty.call(KINDS, a.kind)) {
      return { ok: false, reason: `unknown annotation kind "${String(a.kind)}"` };
    }
    ids.add(a.id);
  }
  const doc = { ...current, annotations: annotations as Doc["annotations"] };
  const sameSize = source.width === current.source.width && source.height === current.source.height;
  if (!sameSize) return { ok: true, doc, madeFor: source };
  return { ok: true, doc: { ...doc, crop } };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSize(v: unknown): v is { width: number; height: number } {
  return isObject(v) && typeof v.width === "number" && typeof v.height === "number";
}

function isRect(v: unknown): v is Rect {
  return isSize(v) && typeof (v as Rect).x === "number" && typeof (v as Rect).y === "number";
}
