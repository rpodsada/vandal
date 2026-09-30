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
  "tool.redact": "[B] Pixelate or blur an area · always under the other markup",
  "tool.spotlight": "[S] Darken everything outside a box or ellipse",
  "tool.step": "[N] Click to place numbered or lettered markers · they count up",
  "tool.callout": "[O] Drag from what to point at to where the text goes, or click",
  "tool.crop": "[C] Crop the image · [Ctrl+Z] undoes a crop",
  undo: "[Ctrl+Z] Undo",
  redo: "[Ctrl+Y] or [Ctrl+Shift+Z] Redo",
  swatch: "[Ctrl+1…0] Pick a color by number · Right-click to change or delete it",
  "swatch.fill":
    "[Shift]+click sets the border · [Ctrl+1…0] fill color · [Ctrl+Shift+1…0] border color · Right-click to change or delete",
  "swatch.box":
    "[Shift]+click sets the background · [Ctrl+1…0] text color · [Ctrl+Shift+1…0] background color · Right-click to change or delete",
  "chip.fill":
    "Choose which color the swatches set · [X] swaps them · [Shift]+click a swatch sets the border",
  "chip.box":
    "Choose which color the swatches set · [X] swaps them · [Shift]+click a swatch sets the background",
  "swatch.label":
    "[Shift]+click sets the marker · [Ctrl+1…0] label color · [Ctrl+Shift+1…0] marker color · Right-click to change or delete",
  "chip.label":
    "Choose which color the swatches set · [X] swaps them · [Shift]+click a swatch sets the marker",
  "swatch.callout":
    "[Shift]+click sets the callout · [Ctrl+1…0] text color · [Ctrl+Shift+1…0] callout color · Right-click to change or delete",
  "chip.callout":
    "Choose which color the swatches set · [X] swaps them · [Shift]+click a swatch sets the callout",
  "chip.swap": "[X] Swap the two colors",
  colorMenu:
    "[Ctrl+1…0] Pick a color by number · Click for the palette · Right-click to edit the color in use",
  "colorMenu.second":
    "[Ctrl+Shift+1…0] Pick this color by number · Click for the palette · Right-click to edit the color in use",
  customColor:
    "Your custom color · Click it again, or right-click, to change it · [Esc] in the picker puts the old one back",
  width: "[1…0] Pick a width by number",
  "redact.mode": "Pixelate or blur · the export's pixels are really changed",
  strength: "[1…0] Pick a strength by number",
  "spotlight.shape": "The bright area's shape",
  corner: "[Alt+1…0] Round the corners · 0 is square",
  "corner.callout": "Round the box's corners · 0 is square",
  "callout.size": "[1…0] Pick a text size by number",
  "callout.width": "[Shift+1…0] Pick the pointer's thickness by number",
  "callout.end": "The end of the pointer: plain, an arrow or a dot",
  dim: "[1…0] How dark outside · shared by every spotlight",
  "step.shape": "The marker's shape",
  "step.format": "Numbers or letters · shared by every marker",
  "step.start": "The first marker's label · the others count up from it",
  "step.resetStyles": "Give every marker the style shown here · [Ctrl+Z] undoes it",
  "step.resetNumbering":
    "Drop the labels you typed, so every marker counts up again · [Ctrl+Z] undoes it",
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
  open: "[Ctrl+O] Open an image file · or drop one on the window",
  copy: "[Ctrl+C] Copy the image with its markup",
  save: "[Ctrl+S] Save · [Ctrl+Shift+S] Save as",
  zoom: "[Ctrl]+wheel Zoom at the pointer · [Ctrl+=] [Ctrl+−] Zoom in and out",
  fit: "[Ctrl+0] Fit to window",
  actualSize: "[Ctrl+Shift+0] Actual size",
  settings: "Open Settings",
} as const;

export type ControlHint = keyof typeof CONTROL_HINTS;

/** What a drag in progress is doing, for its modifier hints. */
export type DragHint =
  "segment" | "bend" | "square" | "circle" | "stroke" | "text" | "callout" | "resize" | "rotate";

const DRAG_HINTS: Record<DragHint, string> = {
  segment: "[Shift] 45° steps",
  bend: "[Shift] symmetric arc · Near the straight line it snaps straight · Double-click the handle to straighten",
  square: "[Shift] square",
  circle: "[Shift] circle",
  stroke: "[Shift] straight line",
  text: "Release to type in a box this wide",
  callout: "Release where the text goes · the pointer points where you pressed",
  resize: "[Shift] keep proportions",
  rotate: "Snaps to 45° steps near them",
};

const PAN_ZOOM = "[Space]+drag pan · [Ctrl]+wheel zoom";

/** The color keys, naming both colors only when there are two. */
function colorKeys(tool: ToolId, twoColors: boolean): string {
  if (tool === "step") return "[Ctrl+1…0] label color · [Ctrl+Shift+1…0] marker color";
  if (tool === "callout") return "[Ctrl+1…0] text color · [Ctrl+Shift+1…0] callout color";
  if (tool === "text") {
    return twoColors
      ? "[Ctrl+1…0] text color · [Ctrl+Shift+1…0] background color"
      : "[Ctrl+1…0] text color";
  }
  return twoColors ? "[Ctrl+1…0] fill color · [Ctrl+Shift+1…0] border color" : "[Ctrl+1…0] color";
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
      return `[Shift] square · [1…0] width · [Alt+1…0] corners · ${colors}`;
    case "ellipse":
      return `[Shift] circle · [1…0] width · ${colors}`;
    case "text":
      return `Click to type, drag to set a width · [1…0] size · [Alt+1…0] font · ${colors}`;
    case "redact":
      return "Drag over what to hide · [1…0] strength";
    case "spotlight":
      return "Drag the area to keep bright · [Shift] square or circle · [1…0] darkness · [Alt+1…0] corners";
    case "step":
      return `Click to place the next marker · [1…0] size · [Alt+1…0] font · ${colors}`;
    case "callout":
      return `Drag from what to point at to where the text goes · [1…0] size · [Shift+1…0] thickness · [Alt+1…0] font · ${colors}`;
  }
}

const SELECTED =
  "[Del] delete · [Ctrl+D] duplicate · [←↑↓→] nudge, [Shift] 10 px · [Ctrl+[] [Ctrl+]] order · [Shift]+click adds or removes";
const TEXT_SELECTED = `[Enter] edit the text · ${SELECTED}`;
const STEP_SELECTED = `[Enter] or double-click to type its own label · ${SELECTED}`;
const CALLOUT_SELECTED = `Drag the ● handle to point it · [Enter] edit the text · ${SELECTED}`;
const LABEL_TYPING = "[Enter] done · [Esc] cancel · Leave it empty to count up again";
const SEGMENT_SELECTED = `Drag the ◆ handle to bend it, double-click it to straighten · ${SELECTED}`;
const TYPING = "[Esc] done · [Ctrl+B] bold · [Ctrl+I] italic · [Alt+1…0] font";
const CROP =
  "Drag edges or corners, [Shift] keeps proportions · Drag outside for a new box · [Enter] apply · [Esc] cancel · [←↑↓→] nudge, [Ctrl] resize";

const IDLE = `[V] [P] [H] [L] [A] [R] [E] [T] [O] [B] [S] [N] tools · [Ctrl+Z] undo · [Ctrl+C] copy · [Ctrl+S] save · ${PAN_ZOOM}`;

export interface HintState {
  hover: ControlHint | null;
  drag: DragHint | null;
  /** A host mode instead of a tool (the editor's crop). */
  mode: HostMode | null;
  tool: ToolId;
  selected: number;
  /** The one selected object is text. */
  textSelected: boolean;
  /** The one selected object is a line or an arrow (it can bend). */
  segmentSelected: boolean;
  /** The one selected object is a step marker. */
  stepSelected: boolean;
  /** The one selected object is a callout. */
  calloutSelected: boolean;
  /** A step marker's label is being typed. */
  labelTyping: boolean;
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
  if (s.mode === "crop") return CROP;
  if (s.typing)
    return `${TYPING} · ${colorKeys(s.tool === "callout" || s.calloutSelected ? "callout" : "text", s.twoColors)}`;
  if (s.labelTyping) return LABEL_TYPING;
  // With Select or the step tool (which selects what it places).
  if (s.selected === 1 && s.stepSelected && (s.tool === "select" || s.tool === "step"))
    return STEP_SELECTED;
  // With Select or the callout tool (which selects what it makes).
  if (s.selected === 1 && s.calloutSelected && (s.tool === "select" || s.tool === "callout"))
    return CALLOUT_SELECTED;
  if (s.tool === "select") {
    if (s.selected === 1 && s.textSelected) return TEXT_SELECTED;
    if (s.selected === 1 && s.segmentSelected) return SEGMENT_SELECTED;
    if (s.selected) return SELECTED;
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

/** Modes a host adds beside the tools. */
export type HostMode = "crop";

interface HintSources {
  hover: ControlHint | null;
  drag: DragHint | null;
  mode: HostMode | null;
  overObject: boolean;
}

/** What the canvas and the pointer report; the rest comes from the stores. */
export const useHintSources = create<HintSources>(() => ({
  hover: null,
  drag: null,
  mode: null,
  overObject: false,
}));

export function setDragHint(drag: DragHint | null): void {
  if (useHintSources.getState().drag !== drag) useHintSources.setState({ drag });
}

export function setOverObject(overObject: boolean): void {
  if (useHintSources.getState().overObject !== overObject) useHintSources.setState({ overObject });
}
