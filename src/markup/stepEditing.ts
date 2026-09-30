// Typing a step marker's own label (PLAN 3D.12), and Renumber. The
// label is typed into a field over the marker (StepLabelEditor) and goes into
// the document once, as one undo step, when typing ends.

import { docStore } from "./model/store";
import type { AnnotationId } from "./model/types";
import { stepLabels, stepsOf, withTypedLabel } from "./steps";
import { finishTextEdit } from "./textEditing";
import { useToolStore } from "./toolStore";

/** Start typing `id`'s label (a step marker; anything else is ignored). */
export function editStepLabel(id: AnnotationId): void {
  const store = docStore.getState();
  if (!store.doc.annotations.some((a) => a.id === id && a.kind === "step")) return;
  finishTextEdit();
  store.select([id]);
  useToolStore.setState({ labelEditing: id });
}

/** Stop typing; `typed` is what to keep, or null to leave the label as it was. */
export function finishStepLabel(typed: string | null): void {
  const id = useToolStore.getState().labelEditing;
  if (!id) return;
  useToolStore.setState({ labelEditing: null });
  if (typed === null) return;
  const store = docStore.getState();
  const shown = stepLabels(store.doc).get(id) ?? "";
  store.update(id, (a) => (a.kind === "step" ? withTypedLabel(a, typed, shown) : a));
}

/** Every marker counts up again: typed labels are dropped, as one undo step. */
export function resetStepNumbering(): void {
  const store = docStore.getState();
  const typed = stepsOf(store.doc).filter((s) => s.label !== undefined);
  if (!typed.length) return;
  store.beginGesture();
  for (const s of typed) {
    store.update(s.id, (a) => (a.kind === "step" ? { ...a, label: undefined } : a));
  }
  store.endGesture();
}
