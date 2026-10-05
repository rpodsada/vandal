// The editor's markup as text (internal/decisions.md, 2026-10-01): hidden
// editor shortcuts copy it to the clipboard and paste it back, for building
// the screenshot kit's examples and for reproducing bug reports, and the
// right-click menu copies it and adds what it pastes (PLAN 3R). It's the Doc
// as it is, tagged so a paste can tell it from other text; a start on the
// saved project files in ideas.md.

import {
  DOC_VERSION,
  type Annotation,
  type AnnotationKind,
  type Doc,
  type Rect,
} from "../markup/model/types";
import { annotationBounds, translateAnnotation } from "../markup/geometry";

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

/** Markup read from the clipboard: what it was made on, and its annotations. */
export interface Markup {
  source: { width: number; height: number };
  crop: Rect;
  annotations: Annotation[];
}

export type ReadMarkup = { ok: true; markup: Markup } | { ok: false; reason: string };

/** Checks the shape down to each annotation's kind and id; the rest is trusted (we wrote it). */
export function readMarkup(text: string): ReadMarkup {
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
  return { ok: true, markup: { source, crop, annotations: annotations as Annotation[] } };
}

/**
 * Where pasted markup goes in a document cropped to `crop` (PLAN 3R): at the
 * same place relative to the visible area as where it was copied from, so
 * pasting into the image it came from leaves it in place. If the objects'
 * box would leave the visible area, they slide in together just far enough;
 * a box bigger than the area is centred on it. Never scaled or clipped.
 */
export function placePasted(markup: Markup, crop: Rect): Annotation[] {
  const { annotations } = markup;
  if (!annotations.length) return [];
  const boxes = annotations.map(annotationBounds);
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  let dx = crop.x - markup.crop.x;
  let dy = crop.y - markup.crop.y;
  dx += fitShift(left + dx, right - left, crop.x, crop.width);
  dy += fitShift(top + dy, bottom - top, crop.y, crop.height);
  if (dx === 0 && dy === 0) return annotations;
  return annotations.map((a) => translateAnnotation(a, dx, dy));
}

/** How far a span at `start` of `size` moves to fit in the one at `lo` of `length`. */
function fitShift(start: number, size: number, lo: number, length: number): number {
  if (size > length) return Math.round(lo + (length - size) / 2 - start);
  if (start < lo) return Math.ceil(lo - start);
  if (start + size > lo + length) return Math.floor(lo + length - (start + size));
  return 0;
}

/** `current` with the markup in `text` in place of its own (the hidden paste). */
export function markupFromJson(text: string, current: Doc): PastedMarkup {
  const read = readMarkup(text);
  if (!read.ok) return read;
  const { source, crop, annotations } = read.markup;
  const doc = { ...current, annotations };
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
