// The active tool and the style new annotations get. Style controls and
// per-tool memory arrive with the options panel (Phase 2A step 6).

import { create } from "zustand";
import type { AnnotationId, ArrowHead, StrokeStyle } from "./model/types";

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
  style: StrokeStyle;
  /** The highlighter keeps its own style (PLAN §4.7 per-tool overrides). */
  highlighterStyle: StrokeStyle;
  filled: boolean;
  arrowHead: ArrowHead;
  /** New text: font and size in pt; the color is `style.color`. */
  font: { family: string; size: number };
  editing: TextEditing | null;
  setTool: (tool: ToolId) => void;
  setEditing: (editing: TextEditing | null) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  tool: "select",
  style: { color: "#e53935", width: 4, opacity: 1 },
  highlighterStyle: { color: "#ffeb3b", width: 20, opacity: 1 },
  filled: false,
  arrowHead: "filled",
  font: { family: "Segoe UI", size: 20 },
  editing: null,
  setTool: (tool) => set({ tool }),
  setEditing: (editing) => set({ editing }),
}));
