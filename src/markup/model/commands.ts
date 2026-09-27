// Pure document operations. Each returns a new Doc (sharing unchanged parts)
// or the same Doc when nothing changes, so the store can tell no-ops apart.

import type { Annotation, AnnotationId, Doc, Rect } from "./types";

export function addAnnotation(doc: Doc, annotation: Annotation): Doc {
  return { ...doc, annotations: [...doc.annotations, annotation] };
}

/** Replace one annotation with `update(it)`. Unknown id or same object: no change. */
export function updateAnnotation(
  doc: Doc,
  id: AnnotationId,
  update: (a: Annotation) => Annotation,
): Doc {
  const i = doc.annotations.findIndex((a) => a.id === id);
  if (i < 0) return doc;
  const next = update(doc.annotations[i]);
  if (next === doc.annotations[i]) return doc;
  if (next.id !== id || next.kind !== doc.annotations[i].kind) {
    throw new Error("an update can't change an annotation's id or kind");
  }
  const annotations = doc.annotations.slice();
  annotations[i] = next;
  return { ...doc, annotations };
}

export function removeAnnotations(doc: Doc, ids: readonly AnnotationId[]): Doc {
  const drop = new Set(ids);
  const annotations = doc.annotations.filter((a) => !drop.has(a.id));
  return annotations.length === doc.annotations.length ? doc : { ...doc, annotations };
}

export type Reorder = "front" | "back" | "forward" | "backward";

/**
 * Change stacking order of `ids`, keeping their order relative to each other.
 * "forward"/"backward" move each past one unselected neighbour.
 */
export function reorderAnnotations(doc: Doc, ids: readonly AnnotationId[], how: Reorder): Doc {
  const pick = new Set(ids);
  const list = doc.annotations;
  let next: Annotation[];
  switch (how) {
    case "front":
      next = [...list.filter((a) => !pick.has(a.id)), ...list.filter((a) => pick.has(a.id))];
      break;
    case "back":
      next = [...list.filter((a) => pick.has(a.id)), ...list.filter((a) => !pick.has(a.id))];
      break;
    case "forward":
      next = list.slice();
      for (let i = next.length - 2; i >= 0; i--) {
        if (pick.has(next[i].id) && !pick.has(next[i + 1].id)) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      }
      break;
    case "backward":
      next = list.slice();
      for (let i = 1; i < next.length; i++) {
        if (pick.has(next[i].id) && !pick.has(next[i - 1].id)) {
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
        }
      }
      break;
  }
  return next.every((a, i) => a === list[i]) ? doc : { ...doc, annotations: next };
}

/** Set the crop, clamped to the source. An empty result is refused (no change). */
export function setCrop(doc: Doc, crop: Rect): Doc {
  const x = Math.max(0, Math.min(Math.round(crop.x), doc.source.width));
  const y = Math.max(0, Math.min(Math.round(crop.y), doc.source.height));
  const right = Math.max(x, Math.min(Math.round(crop.x + crop.width), doc.source.width));
  const bottom = Math.max(y, Math.min(Math.round(crop.y + crop.height), doc.source.height));
  const next = { x, y, width: right - x, height: bottom - y };
  if (next.width === 0 || next.height === 0) return doc;
  const c = doc.crop;
  if (c.x === next.x && c.y === next.y && c.width === next.width && c.height === next.height) {
    return doc;
  }
  return { ...doc, crop: next };
}
