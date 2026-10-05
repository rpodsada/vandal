// What can be done to the selected objects, shared by the keyboard shortcuts
// and the objects' right-click menu.

import { translateAnnotation } from "./geometry";
import { docStore } from "./model/store";
import type { Annotation, AnnotationId, Doc, NewAnnotation, StepAnnotation } from "./model/types";
import { nextStepSeq } from "./steps";

/** Duplicates land this far (source px) down-right of the original. */
const DUPLICATE_OFFSET = 10;

/** Duplicate the selection as one undo step and select the copies. False: nothing selected. */
export function duplicateSelection(): boolean {
  const store = docStore.getState();
  if (!store.selection.length) return false;
  const picked = store.doc.annotations.filter((a) => store.selection.includes(a.id));
  store.beginGesture();
  // Duplicated step markers are the newest, so they take the next labels,
  // in the order of the originals.
  const firstSeq = nextStepSeq(store.doc);
  const stepOrder = picked
    .filter((a): a is StepAnnotation => a.kind === "step")
    .sort((a, b) => a.seq - b.seq)
    .map((a) => a.id);
  const ids = picked.map((a) => {
    const copy = withoutId(translateAnnotation(a, DUPLICATE_OFFSET, DUPLICATE_OFFSET));
    if (copy.kind === "step") copy.seq = firstSeq + stepOrder.indexOf(a.id);
    return store.add(copy);
  });
  store.endGesture();
  store.select(ids);
  return true;
}

/** Stacking order means something only with an unselected object to go past. */
export function canArrange(doc: Doc, selection: readonly AnnotationId[]): boolean {
  return selection.length > 0 && doc.annotations.some((a) => !selection.includes(a.id));
}

function withoutId(a: Annotation): NewAnnotation {
  const copy: Partial<Annotation> = { ...a };
  delete copy.id;
  return copy as NewAnnotation;
}
