// The hint line in the status bar (PLAN 2A.6e): one line saying which keys
// and modifiers do something right now. Most specific first: the control under
// the pointer, then the modifiers of a drag in progress, then the active tool
// (or typing), then, with Select and nothing selected, the general shortcuts.
//
// Every hint is written here, in one table. Keys go in brackets: "[Ctrl+1…0]"
// shows as key caps; " · " separates the parts. Put the most useful part
// first, since a narrow window cuts the end off.

import { create } from "zustand";
import type { ToolId } from "./toolStore";

/** Hints for controls, by the id in their `data-hint` attribute. */
export const CONTROL_HINTS = {
  "tool.select": "[V] Select and move objects · [Esc] steps back to Select",
  "tool.pen": "[P] Draw freehand · [Shift] straight line",
  "tool.highlighter": "[H] Highlight freehand · [Shift] straight line",
  "tool.line": "[L] Draw a line · [Shift] 45° steps",
  "tool.arrow": "[A] Draw an arrow · [Shift] 45° steps",
  "tool.rect": "[R] Draw a rectangle · [Shift] square",
  "tool.ellipse": "[E] Draw an ellipse · [Shift] circle",
  "tool.text": "[T] Click to type, or drag to set a width",
  undo: "[Ctrl+Z] Undo",
  redo: "[Ctrl+Y] or [Ctrl+Shift+Z] Redo",
  swatch: "[Ctrl+1…0] Pick a color by number",
  "swatch.fill":
    "[Shift]+click sets the fill · [Ctrl+1…0] border color · [Ctrl+Shift+1…0] fill color",
  "swatch.box":
    "[Shift]+click sets the background · [Ctrl+1…0] text color · [Ctrl+Shift+1…0] background color",
  "chip.fill": "Choose which color the swatches set · [Shift]+click a swatch sets the fill",
  "chip.box": "Choose which color the swatches set · [Shift]+click a swatch sets the background",
  width: "[1…0] Pick a width by number",
  size: "[1…0] Pick a size by number",
  font: "[Alt+1…0] Pick a font by number · Type to filter the list",
  fill: "Border only, filled, or border and fill",
  bold: "[Ctrl+B] Bold, also while typing",
  italic: "[Ctrl+I] Italic, also while typing",
  box: "A background box behind the text · [Ctrl+Shift+1…0] background color",
  align: "Align the lines of the text",
  head: "The shape of the arrow heads",
  "ends.one": "Click again to flip the arrow",
  "ends.both": "Heads on both ends",
  newCapture: "[Ctrl+N] New capture",
  copy: "[Ctrl+C] Copy the image with its markup",
  save: "[Ctrl+S] Save · [Ctrl+Shift+S] Save as",
  zoom: "[Ctrl]+wheel Zoom at the pointer · [Ctrl+=] [Ctrl+−] Zoom in and out",
  fit: "[Ctrl+0] Fit to window",
  actualSize: "[Ctrl+Shift+0] Actual size",
  settings: "Open Settings",
} as const;

export type ControlHint = keyof typeof CONTROL_HINTS;

/** What a drag in progress is doing, for its modifier hints. */
export type DragHint = "segment" | "square" | "circle" | "stroke" | "text" | "resize" | "rotate";

const DRAG_HINTS: Record<DragHint, string> = {
  segment: "[Shift] 45° steps",
  square: "[Shift] square",
  circle: "[Shift] circle",
  stroke: "[Shift] straight line",
  text: "Release to type in a box this wide",
  resize: "[Shift] keep proportions",
  rotate: "Snaps to 45° steps near them",
};

const PAN_ZOOM = "[Space]+drag pan · [Ctrl]+wheel zoom";

/** The color keys, naming both colors only when there are two. */
function colorKeys(tool: ToolId, twoColors: boolean): string {
  if (tool === "text") {
    return twoColors
      ? "[Ctrl+1…0] text color · [Ctrl+Shift+1…0] background color"
      : "[Ctrl+1…0] text color";
  }
  return twoColors ? "[Ctrl+1…0] border color · [Ctrl+Shift+1…0] fill color" : "[Ctrl+1…0] color";
}

function toolHint(tool: Exclude<ToolId, "select">, twoColors: boolean): string {
  const colors = colorKeys(tool, twoColors);
  switch (tool) {
    case "pen":
    case "highlighter":
      return `[Shift] straight line · [1…0] width · ${colors}`;
    case "line":
    case "arrow":
      return `[Shift] 45° steps · [1…0] width · ${colors}`;
    case "rect":
      return `[Shift] square · [1…0] width · ${colors}`;
    case "ellipse":
      return `[Shift] circle · [1…0] width · ${colors}`;
    case "text":
      return `Click to type, drag to set a width · [1…0] size · [Alt+1…0] font · ${colors}`;
  }
}

const SELECTED =
  "[Del] delete · [Ctrl+D] duplicate · [←↑↓→] nudge, [Shift] 10 px · [Ctrl+[] [Ctrl+]] order · [Shift]+click adds or removes";
const TEXT_SELECTED = `[Enter] edit the text · ${SELECTED}`;
const TYPING = "[Esc] done · [Ctrl+B] bold · [Ctrl+I] italic · [Alt+1…0] font";
const IDLE = `[V] [P] [H] [L] [A] [R] [E] [T] tools · [Ctrl+Z] undo · [Ctrl+C] copy · [Ctrl+S] save · ${PAN_ZOOM}`;

export interface HintState {
  hover: ControlHint | null;
  drag: DragHint | null;
  tool: ToolId;
  selected: number;
  /** The one selected object is text. */
  textSelected: boolean;
  typing: boolean;
  /** The pointer is over an object on the canvas. */
  overObject: boolean;
  /** What's being styled has a second color: border and fill, or text on a box. */
  twoColors: boolean;
  /** `editor.drawingToolsSelect`. */
  drawingToolsSelect: boolean;
}

/** The hint to show, in the table's bracket format. */
export function chooseHint(s: HintState): string {
  if (s.hover) return CONTROL_HINTS[s.hover];
  if (s.drag) return DRAG_HINTS[s.drag];
  if (s.typing) return `${TYPING} · ${colorKeys("text", s.twoColors)}`;
  if (s.tool === "select") {
    if (s.selected) return s.textSelected && s.selected === 1 ? TEXT_SELECTED : SELECTED;
    return IDLE;
  }
  const tool = toolHint(s.tool, s.twoColors);
  if (s.tool === "pen" || s.tool === "highlighter") return tool;
  // Over an object, say what a press does and how to get the other behavior.
  if (s.overObject) {
    return s.drawingToolsSelect
      ? `Press to select or move it · [Ctrl] draw over it · ${tool}`
      : `[Ctrl] select or move it · ${tool}`;
  }
  return tool;
}

/** A hint split into text and key caps (each cap one key, e.g. ["Ctrl", "1…0"]). */
export type HintPart = { text: string } | { keys: string[] };

export function parseHint(hint: string): HintPart[] {
  const parts: HintPart[] = [];
  let text = "";
  let i = 0;
  while (i < hint.length) {
    if (hint[i] !== "[") {
      text += hint[i++];
      continue;
    }
    // A "]" closes the caps unless it is itself a key: "[Ctrl+]]".
    let end = i + 1;
    while (end < hint.length && !(hint[end] === "]" && end > i + 1 && hint[end - 1] !== "+")) end++;
    if (end >= hint.length) {
      text += hint.slice(i);
      break;
    }
    if (text) parts.push({ text });
    text = "";
    parts.push({ keys: hint.slice(i + 1, end).split(/\+(?=.)/) });
    i = end + 1;
  }
  if (text) parts.push({ text });
  return parts;
}

interface HintSources {
  hover: ControlHint | null;
  drag: DragHint | null;
  overObject: boolean;
}

/** What the canvas and the pointer report; the rest comes from the stores. */
export const useHintSources = create<HintSources>(() => ({
  hover: null,
  drag: null,
  overObject: false,
}));

export function setDragHint(drag: DragHint | null): void {
  if (useHintSources.getState().drag !== drag) useHintSources.setState({ drag });
}

export function setOverObject(overObject: boolean): void {
  if (useHintSources.getState().overObject !== overObject) useHintSources.setState({ overObject });
}
