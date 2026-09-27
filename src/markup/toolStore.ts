// The active tool and what each tool remembers of its style (see styles.ts
// for how the current color and width are worked out).

import { create } from "zustand";
import { docStore } from "./model/store";
import type { AnnotationId, ArrowHead } from "./model/types";

/** Tools built so far; the list grows one tool per increment. */
export const TOOLS = [
  "select",
  "pen",
  "highlighter",
  "line",
  "arrow",
  "rect",
  "ellipse",
  "text",
] as const;
export type ToolId = (typeof TOOLS)[number];

/** Single-key shortcuts (KeyboardEvent.code). */
export const TOOL_KEYS: Record<string, ToolId> = {
  KeyV: "select",
  KeyP: "pen",
  KeyH: "highlighter",
  KeyL: "line",
  KeyA: "arrow",
  KeyR: "rect",
  KeyE: "ellipse",
  KeyT: "text",
};

export function isTool(value: string): value is ToolId {
  return (TOOLS as readonly string[]).includes(value);
}

/** The text object being typed into, if any. */
export interface TextEditing {
  id: AnnotationId;
  /** Created by this session: an empty result is dropped without an undo step. */
  isNew: boolean;
}

interface ToolState {
  tool: ToolId;
  /** The current color of tools on the shared palette (`editor.shareColor`); null = first preset. */
  sharedColor: string | null;
  /** Each tool's own current color, when it isn't shared. */
  colors: Partial<Record<ToolId, string>>;
  /** Each tool's line width, once picked. */
  widths: Partial<Record<ToolId, number>>;
  /** Rectangle and ellipse: filled instead of outlined. */
  filled: Partial<Record<ToolId, boolean>>;
  arrowHead: ArrowHead;
  /** New text: font and size in pt. */
  font: { family: string; size: number };
  editing: TextEditing | null;
  setTool: (tool: ToolId) => void;
  setEditing: (editing: TextEditing | null) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  tool: "select",
  sharedColor: null,
  colors: {},
  widths: {},
  filled: {},
  arrowHead: "filled",
  font: { family: "Segoe UI", size: 20 },
  editing: null,
  // Picking a drawing tool drops the selection, so the options show that tool.
  setTool: (tool) => {
    if (tool !== "select") docStore.getState().select([]);
    set({ tool });
  },
  setEditing: (editing) => set({ editing }),
}));
