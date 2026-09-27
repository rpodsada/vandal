// Keyboard shortcuts shared by quick edit and the editor: tools, undo/redo,
// delete, nudge, duplicate, select all, stacking order and the Esc ladder.
// Host-specific keys (copy, save, zoom, close) live in the host.

import { useEffect } from "react";
import { isTyping } from "../shared/dom";
import { translateAnnotation } from "./geometry";
import { docStore } from "./model/store";
import { editText } from "./textEditing";
import type { Annotation, NewAnnotation } from "./model/types";
import { TOOL_KEYS, useToolStore } from "./toolStore";

/** Duplicates land this far (source px) down-right of the original. */
const DUPLICATE_OFFSET = 10;

export function useMarkupKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;
      if (e.ctrlKey ? handleCtrl(e) : handlePlain(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Returns true when the key was handled. */
function handlePlain(e: KeyboardEvent): boolean {
  const store = docStore.getState();
  const tools = useToolStore.getState();
  const tool = TOOL_KEYS[e.code];
  if (tool && !e.shiftKey) {
    tools.setTool(tool);
    return true;
  }
  switch (e.code) {
    case "Enter":
    case "NumpadEnter": {
      // Enter on one selected text object starts typing into it.
      const [id] = store.selection;
      const a = store.doc.annotations.find((x) => x.id === id);
      if (store.selection.length !== 1 || a?.kind !== "text") return false;
      editText(id);
      return true;
    }
    case "Delete":
    case "Backspace":
      if (!store.selection.length) return false;
      store.remove(store.selection);
      return true;
    case "Escape":
      // One step back at a time: selection, then tool (PLAN Phase 2).
      if (store.selection.length) store.select([]);
      else if (tools.tool !== "select") tools.setTool("select");
      else return false;
      return true;
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown": {
      if (!store.selection.length) return false;
      const step = e.shiftKey ? 10 : 1;
      const dx = e.code === "ArrowLeft" ? -step : e.code === "ArrowRight" ? step : 0;
      const dy = e.code === "ArrowUp" ? -step : e.code === "ArrowDown" ? step : 0;
      store.beginGesture();
      for (const id of store.selection) store.update(id, (a) => translateAnnotation(a, dx, dy));
      store.endGesture();
      return true;
    }
  }
  return false;
}

function handleCtrl(e: KeyboardEvent): boolean {
  const store = docStore.getState();
  switch (e.code) {
    case "KeyZ":
      if (e.shiftKey) store.redo();
      else store.undo();
      return true;
    case "KeyY":
    case "KeyR": // habit from other editors; the webview's reload is blocked
      if (e.shiftKey) return false;
      store.redo();
      return true;
    case "KeyA":
      if (e.shiftKey) return false;
      store.select(store.doc.annotations.map((a) => a.id));
      return true;
    case "KeyD": {
      if (e.shiftKey || !store.selection.length) return false;
      const picked = store.doc.annotations.filter((a) => store.selection.includes(a.id));
      store.beginGesture();
      const ids = picked.map((a) =>
        store.add(withoutId(translateAnnotation(a, DUPLICATE_OFFSET, DUPLICATE_OFFSET))),
      );
      store.endGesture();
      store.select(ids);
      return true;
    }
    case "BracketRight":
      if (!store.selection.length) return false;
      store.reorder(store.selection, e.shiftKey ? "front" : "forward");
      return true;
    case "BracketLeft":
      if (!store.selection.length) return false;
      store.reorder(store.selection, e.shiftKey ? "back" : "backward");
      return true;
  }
  return false;
}

function withoutId(a: Annotation): NewAnnotation {
  const copy: Partial<Annotation> = { ...a };
  delete copy.id;
  return copy as NewAnnotation;
}
