import { describe, expect, it } from "vitest";
import { canRedo, canUndo, createDocStore, hasUnsavedChanges, HISTORY_LIMIT } from "./store";
import { emptyDoc, type NewAnnotation } from "./types";

const rect = (x = 0): NewAnnotation => ({
  kind: "rect",
  rect: { x, y: 0, width: 10, height: 10 },
  rotation: 0,
  fill: "none",
  fillColor: "#000",
  style: { color: "#e53935", width: 4, opacity: 1 },
});
const fresh = () => createDocStore(emptyDoc({ width: 100, height: 80 }));
const xOf = (s: ReturnType<typeof fresh>, id: string) => {
  const a = s.getState().doc.annotations.find((a) => a.id === id);
  return a?.kind === "rect" ? a.rect.x : undefined;
};

describe("doc store", () => {
  it("adds with unique ids, one undo step each", () => {
    const s = fresh();
    const a = s.getState().add(rect());
    const b = s.getState().add(rect());
    expect(a).not.toBe(b);
    expect(s.getState().doc.annotations).toHaveLength(2);
    expect(s.getState().past).toHaveLength(2);
  });

  it("replaces the Doc as one undo step, dropping a stale selection", () => {
    const s = fresh();
    const id = s.getState().add(rect());
    s.getState().select([id]);
    const before = s.getState().doc;
    s.getState().replace({ ...before, annotations: [] });
    expect(s.getState().doc.annotations).toHaveLength(0);
    expect(s.getState().selection).toEqual([]);
    s.getState().undo();
    expect(s.getState().doc).toBe(before);
  });

  it("undoes and redoes add / update / delete", () => {
    const s = fresh();
    const id = s.getState().add(rect(1));
    s.getState().update(id, (a) => (a.kind === "rect" ? { ...a, rect: { ...a.rect, x: 5 } } : a));
    s.getState().remove([id]);
    expect(s.getState().doc.annotations).toHaveLength(0);

    s.getState().undo();
    expect(xOf(s, id)).toBe(5);
    s.getState().undo();
    expect(xOf(s, id)).toBe(1);
    s.getState().undo();
    expect(s.getState().doc.annotations).toHaveLength(0);
    expect(canUndo(s.getState())).toBe(false);

    s.getState().redo();
    s.getState().redo();
    expect(xOf(s, id)).toBe(5);
    s.getState().redo();
    expect(s.getState().doc.annotations).toHaveLength(0);
    expect(canRedo(s.getState())).toBe(false);
  });

  it("a new action clears redo", () => {
    const s = fresh();
    s.getState().add(rect());
    s.getState().undo();
    expect(canRedo(s.getState())).toBe(true);
    s.getState().add(rect());
    expect(canRedo(s.getState())).toBe(false);
  });

  it("no-ops add no history", () => {
    const s = fresh();
    s.getState().remove(["missing"]);
    s.getState().update("missing", (a) => ({ ...a }));
    s.getState().crop({ x: 0, y: 0, width: 100, height: 80 });
    expect(s.getState().past).toHaveLength(0);
  });

  it("a gesture is one undo step", () => {
    const s = fresh();
    const id = s.getState().add(rect(0));
    s.getState().beginGesture();
    for (let x = 1; x <= 20; x++) {
      s.getState().update(id, (a) => (a.kind === "rect" ? { ...a, rect: { ...a.rect, x } } : a));
    }
    expect(canUndo(s.getState())).toBe(false); // not mid-drag
    s.getState().endGesture();
    expect(s.getState().past).toHaveLength(2);
    s.getState().undo();
    expect(xOf(s, id)).toBe(0);
  });

  it("an empty gesture adds nothing; a cancelled one restores", () => {
    const s = fresh();
    const id = s.getState().add(rect(0));
    s.getState().beginGesture();
    s.getState().endGesture();
    expect(s.getState().past).toHaveLength(1);

    s.getState().beginGesture();
    s.getState().update(id, (a) => (a.kind === "rect" ? { ...a, rect: { ...a.rect, x: 9 } } : a));
    s.getState().cancelGesture();
    expect(xOf(s, id)).toBe(0);
    expect(s.getState().past).toHaveLength(1);
  });

  it("undo prunes the selection", () => {
    const s = fresh();
    const id = s.getState().add(rect());
    s.getState().select([id, id]);
    expect(s.getState().selection).toEqual([id]);
    s.getState().undo();
    expect(s.getState().selection).toEqual([]);
  });

  it("caps history", () => {
    const s = fresh();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) s.getState().add(rect(i));
    expect(s.getState().past).toHaveLength(HISTORY_LIMIT);
  });

  it("tracks unsaved changes against load and output", () => {
    const s = fresh();
    expect(hasUnsavedChanges(s.getState())).toBe(false);
    s.getState().add(rect());
    expect(hasUnsavedChanges(s.getState())).toBe(true);
    s.getState().undo();
    expect(hasUnsavedChanges(s.getState())).toBe(false);
    s.getState().redo();
    s.getState().markOutput();
    expect(hasUnsavedChanges(s.getState())).toBe(false);
    s.getState().undo();
    expect(hasUnsavedChanges(s.getState())).toBe(true);
  });

  it("load resets everything", () => {
    const s = fresh();
    s.getState().add(rect());
    s.getState().load(emptyDoc({ width: 5, height: 5 }));
    expect(s.getState().past).toHaveLength(0);
    expect(s.getState().doc.source).toEqual({ width: 5, height: 5 });
    expect(hasUnsavedChanges(s.getState())).toBe(false);
  });

  it("history snapshots share unchanged annotations", () => {
    const s = fresh();
    s.getState().add(rect(0));
    const second = s.getState().add(rect(1));
    const firstObj = s.getState().doc.annotations[0];
    s.getState().update(second, (a) => ({ ...a }));
    expect(s.getState().doc.annotations[0]).toBe(firstObj);
    expect(s.getState().past[s.getState().past.length - 1].annotations[0]).toBe(firstObj);
  });
});
