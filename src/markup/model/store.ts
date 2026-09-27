// The document store: the current Doc plus undo/redo history (PLAN §4.6).
//
// History keeps whole Doc snapshots. Docs are immutable and operations share
// unchanged parts, so a snapshot costs about one array of references.
//
// Every action is one undo step. A drag is wrapped in beginGesture/endGesture
// so all its intermediate updates become a single step; no-op actions add
// nothing to history.

import { createStore, useStore } from "zustand";
import {
  addAnnotation,
  removeAnnotations,
  reorderAnnotations,
  setCrop,
  updateAnnotation,
  type Reorder,
} from "./commands";
import {
  emptyDoc,
  type Annotation,
  type AnnotationId,
  type Doc,
  type NewAnnotation,
  type Rect,
} from "./types";

/** Oldest steps are dropped beyond this. */
export const HISTORY_LIMIT = 200;

export interface DocState {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  /** The Doc when the current gesture began, or null outside a gesture. */
  gestureStart: Doc | null;
  /** Not part of history; pruned to existing annotations after undo/redo. */
  selection: AnnotationId[];
  /** The Doc as loaded or last copied/saved; anything else is an unsaved change. */
  baseline: Doc;

  /** Start editing a new document; clears history. */
  load: (doc: Doc) => void;
  /** Add and return the new id. */
  add: (annotation: NewAnnotation) => AnnotationId;
  update: (id: AnnotationId, update: (a: Annotation) => Annotation) => void;
  remove: (ids: readonly AnnotationId[]) => void;
  reorder: (ids: readonly AnnotationId[], how: Reorder) => void;
  crop: (rect: Rect) => void;

  beginGesture: () => void;
  endGesture: () => void;
  /** Abandon the gesture and restore the Doc from before it. */
  cancelGesture: () => void;

  undo: () => void;
  redo: () => void;

  select: (ids: readonly AnnotationId[]) => void;
  /** `doc` (default: the current one) was just copied or saved. */
  markOutput: (doc?: Doc) => void;
}

export function canUndo(s: DocState): boolean {
  return s.past.length > 0 && s.gestureStart === null;
}

export function canRedo(s: DocState): boolean {
  return s.future.length > 0 && s.gestureStart === null;
}

/** Changed since loading or the last copy/save. Undoing back to that point counts as unchanged. */
export function hasUnsavedChanges(s: DocState): boolean {
  return s.doc !== s.baseline;
}

let nextId = 0;
function newId(): AnnotationId {
  nextId += 1;
  return `a${Date.now().toString(36)}${nextId.toString(36)}`;
}

export function createDocStore(initial: Doc = emptyDoc({ width: 1, height: 1 })) {
  return createStore<DocState>()((set, get) => {
    /** Apply a pure operation as one history step (or as part of the current gesture). */
    const apply = (op: (doc: Doc) => Doc) => {
      const s = get();
      const doc = op(s.doc);
      if (doc === s.doc) return;
      if (s.gestureStart) {
        set({ doc });
        return;
      }
      set({ doc, past: pushLimited(s.past, s.doc), future: [] });
    };

    return {
      doc: initial,
      past: [],
      future: [],
      gestureStart: null,
      selection: [],
      baseline: initial,

      load: (doc) =>
        set({
          doc,
          past: [],
          future: [],
          gestureStart: null,
          selection: [],
          baseline: doc,
        }),

      add: (annotation) => {
        const id = newId();
        apply((doc) => addAnnotation(doc, { ...annotation, id } as Annotation));
        return id;
      },
      update: (id, update) => apply((doc) => updateAnnotation(doc, id, update)),
      remove: (ids) => {
        apply((doc) => removeAnnotations(doc, ids));
        pruneSelection();
      },
      reorder: (ids, how) => apply((doc) => reorderAnnotations(doc, ids, how)),
      crop: (rect) => apply((doc) => setCrop(doc, rect)),

      beginGesture: () => {
        if (!get().gestureStart) set({ gestureStart: get().doc });
      },
      endGesture: () => {
        const { gestureStart: start, doc, past } = get();
        if (!start) return;
        if (doc === start) set({ gestureStart: null });
        else set({ gestureStart: null, past: pushLimited(past, start), future: [] });
      },
      cancelGesture: () => {
        const start = get().gestureStart;
        if (!start) return;
        set({ doc: start, gestureStart: null });
        pruneSelection();
      },

      undo: () => {
        const s = get();
        if (!canUndo(s)) return;
        set({
          doc: s.past[s.past.length - 1],
          past: s.past.slice(0, -1),
          future: [s.doc, ...s.future],
        });
        pruneSelection();
      },
      redo: () => {
        const s = get();
        if (!canRedo(s)) return;
        set({
          doc: s.future[0],
          past: pushLimited(s.past, s.doc),
          future: s.future.slice(1),
        });
        pruneSelection();
      },

      select: (ids) => set({ selection: [...new Set(ids)] }),
      markOutput: (doc) => set({ baseline: doc ?? get().doc }),
    };

    function pruneSelection() {
      const { doc, selection } = get();
      const present = new Set(doc.annotations.map((a) => a.id));
      const kept = selection.filter((id) => present.has(id));
      if (kept.length !== selection.length) set({ selection: kept });
    }
  });
}

function pushLimited(past: Doc[], doc: Doc): Doc[] {
  const next = [...past, doc];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/** The document of this window (each editor / overlay hosts one). */
export const docStore = createDocStore();

export function useDoc<T>(selector: (s: DocState) => T): T {
  return useStore(docStore, selector);
}
