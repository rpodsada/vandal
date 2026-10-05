// What can be done to the selected objects, shared by the keyboard shortcuts
// and the objects' right-click menu.

import { translateAnnotation } from "./geometry";
import { docStore } from "./model/store";
import type { Annotation, AnnotationId, Doc, NewAnnotation, StepAnnotation } from "./model/types";
import { nextStepSeq, stepsOf } from "./steps";
import { stepNumbering } from "./styles";

/** Duplicates land this far (source px) down-right of the original. */
const DUPLICATE_OFFSET = 10;

/** Duplicate the selection as one undo step and select the copies. False: nothing selected. */
export function duplicateSelection(): boolean {
  const store = docStore.getState();
  if (!store.selection.length) return false;
  const picked = store.doc.annotations.filter((a) => store.selection.includes(a.id));
  addCopies(picked.map((a) => translateAnnotation(a, DUPLICATE_OFFSET, DUPLICATE_OFFSET)));
  return true;
}

/**
 * Add copies of `annotations` in front of everything, as one undo step, and
 * select them. Step markers take the next labels, in the order of the
 * originals, and the document's numbering if it already has markers.
 */
export function addCopies(annotations: readonly Annotation[]): AnnotationId[] {
  const store = docStore.getState();
  if (!annotations.length) return [];
  const firstSeq = nextStepSeq(store.doc);
  const numbering = stepsOf(store.doc).length ? stepNumbering(store.doc) : null;
  const stepOrder = annotations
    .filter((a): a is StepAnnotation => a.kind === "step")
    .sort((a, b) => a.seq - b.seq);
  store.beginGesture();
  const ids = annotations.map((a) => {
    const copy = withoutId(a);
    if (copy.kind === "step") {
      copy.seq = firstSeq + stepOrder.indexOf(a as StepAnnotation);
      if (numbering) Object.assign(copy, numbering);
    }
    return store.add(copy);
  });
  store.endGesture();
  store.select(ids);
  return ids;
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
