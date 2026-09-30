// The active tool and what each tool remembers of its style (see styles.ts
// for how the current color and width are worked out).

import { create } from "zustand";
import { docStore } from "./model/store";
import type {
  AnnotationId,
  ArrowEnds,
  ArrowHead,
  RedactMode,
  ShapeFill,
  SpotlightShape,
  StepFormat,
  StepShape,
  TextAlign,
} from "./model/types";

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
  "redact",
  "spotlight",
  "step",
] as const;
export type ToolId = (typeof TOOLS)[number];

/** A palette: the shared one, or a tool's own. */
export type PaletteKey = ToolId | "shared";

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
  KeyB: "redact",
  KeyS: "spotlight",
  KeyN: "step",
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

export interface ToolState {
  tool: ToolId;
  /** The current color of tools on the shared palette (`editor.shareColor`); null = first preset. */
  sharedColor: string | null;
  /** Each tool's own current color, when it isn't shared. */
  colors: Partial<Record<ToolId, string>>;
  /** Each tool's line width, once picked. */
  widths: Partial<Record<ToolId, number>>;
  /** Rectangle and ellipse: border, fill or both. */
  fills: Partial<Record<ToolId, ShapeFill>>;
  /** Rectangle and ellipse: the fill color for "both", once picked. */
  fillColors: Partial<Record<ToolId, string>>;
  /**
   * The last color from the custom picker, kept on the custom swatch: one for
   * the shared palette ("shared"), and one per tool with its own palette.
   */
  customColors: Partial<Record<PaletteKey, string>>;
  /** Which color the swatches set when a shape has border and fill. */
  colorSlot: "border" | "fill";
  arrowHead: ArrowHead;
  arrowEnds: ArrowEnds;
  /** Text: font family and size in pt, once picked. */
  fontFamily: string | null;
  fontSize: number | null;
  textAlign: TextAlign;
  textBold: boolean;
  textItalic: boolean;
  /** Text: draw a box behind it, in this color (null: white until picked). */
  textBackground: boolean;
  textBackgroundColor: string | null;
  /** Redact: pixelate or blur, and each mode's strength once picked. */
  redactMode: RedactMode;
  redactStrengths: Partial<Record<RedactMode, number>>;
  /** Spotlight: its shape, and the darkness once picked (%). */
  spotlightShape: SpotlightShape;
  spotlightDim: number | null;
  /** Step markers: the style of the next one (size and label color once picked). */
  stepShape: StepShape;
  stepSize: number | null;
  /** Null: black or white, whichever reads better on the marker. */
  stepTextColor: string | null;
  /** Once picked. */
  stepFont: string | null;
  /** The labels of a document's first marker (after that, its markers say). */
  stepFormat: StepFormat;
  stepStart: number;
  editing: TextEditing | null;
  /** The step marker whose label is being typed (PLAN 3D.12). */
  labelEditing: AnnotationId | null;
  setTool: (tool: ToolId) => void;
  setEditing: (editing: TextEditing | null) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  tool: "select",
  sharedColor: null,
  colors: {},
  widths: {},
  fills: {},
  fillColors: {},
  customColors: {},
  colorSlot: "border",
  arrowHead: "filled",
  arrowEnds: "end",
  fontFamily: null,
  fontSize: null,
  textAlign: "left",
  textBold: false,
  textItalic: false,
  textBackground: false,
  textBackgroundColor: null,
  redactMode: "pixelate",
  redactStrengths: {},
  spotlightShape: "rect",
  spotlightDim: null,
  stepShape: "circle",
  stepSize: null,
  stepTextColor: null,
  stepFont: null,
  stepFormat: "numbers",
  stepStart: 1,
  editing: null,
  labelEditing: null,
  // Picking a drawing tool drops the selection, so the options show that tool.
  setTool: (tool) => {
    if (tool !== "select") docStore.getState().select([]);
    set({ tool, colorSlot: "border" });
  },
  setEditing: (editing) => set({ editing }),
}));
