// A text-editing session: from starting to type into a text object until
// Esc, a click elsewhere or anything else that takes focus. The whole session
// (including creating the object) is one undo step.

import { docStore } from "./model/store";
import type { AnnotationId, NewAnnotation } from "./model/types";
import { useToolStore } from "./toolStore";

/** Create a text object and start typing into it. */
export function createText(text: Extract<NewAnnotation, { kind: "text" }>): void {
  finishTextEdit();
  const store = docStore.getState();
  store.select([]);
  store.beginGesture();
  const id = store.add(text);
  useToolStore.getState().setEditing({ id, isNew: true });
}

/** Start typing into an existing text object. */
export function editText(id: AnnotationId): void {
  const editing = useToolStore.getState().editing;
  if (editing?.id === id) return;
  finishTextEdit();
  const store = docStore.getState();
  if (!store.doc.annotations.some((a) => a.id === id && a.kind === "text")) return;
  store.select([]);
  store.beginGesture();
  useToolStore.getState().setEditing({ id, isNew: false });
}

/**
 * End the session: empty text is removed, anything else stays selected (so Esc
 * steps back text → selection → tool). Safe to call when nothing is being edited.
 */
export function finishTextEdit(): void {
  const tools = useToolStore.getState();
  const editing = tools.editing;
  if (!editing) return;
  tools.setEditing(null);
  const store = docStore.getState();
  const a = store.doc.annotations.find((x) => x.id === editing.id);
  const empty = !a || (a.kind === "text" && a.text.trim() === "");
  if (empty && editing.isNew) {
    store.cancelGesture();
    return;
  }
  if (empty) store.remove([editing.id]);
  store.endGesture();
  if (!empty) store.select([editing.id]);
}
