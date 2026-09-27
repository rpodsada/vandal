// What the style controls act on, and applying a change (PLAN Phase 2,
// "Restyling"): the text being typed into, else the selected objects, else the
// active tool's next object. Restyling objects is one undo step and also
// becomes the tools' current style.

import { docStore } from "./model/store";
import type {
  Annotation,
  AnnotationId,
  AnnotationKind,
  ArrowEnds,
  ArrowHead,
  Doc,
  ShapeFill,
  TextAlign,
} from "./model/types";
import { textPx } from "./geometry";
import { measureTextWidth } from "./textMeasure";
import {
  rememberColor,
  rememberWidth,
  DEFAULT_TEXT_BACKGROUND,
  TOOL_FOR_KIND,
  toolColor,
  toolFill,
  toolFont,
  toolWidth,
} from "./styles";
import { useToolStore, type ToolId } from "./toolStore";

export interface StyleTarget {
  /** Whose pickers show (and whose memory the values come from with no objects). */
  tool: ToolId;
  /** Objects a change restyles; empty = only the tool's next object. */
  ids: AnnotationId[];
  /** The kinds involved (the tool's own kind when there are no objects). */
  kinds: AnnotationKind[];
}

/** The target for the current state, or null (Select tool, nothing selected). */
export function styleTarget(
  doc: Doc = docStore.getState().doc,
  selection: readonly AnnotationId[] = docStore.getState().selection,
  tool: ToolId = useToolStore.getState().tool,
  editing: AnnotationId | null = useToolStore.getState().editing?.id ?? null,
): StyleTarget | null {
  const ids = editing ? [editing] : [...selection];
  const picked = doc.annotations.filter((a) => ids.includes(a.id));
  if (picked.length) {
    const kinds = [...new Set(picked.map((a) => a.kind))];
    // A mixed selection shows the first non-highlighter's pickers.
    const lead = kinds.find((k) => k !== "highlighter") ?? kinds[0];
    return { tool: TOOL_FOR_KIND[lead], ids: picked.map((a) => a.id), kinds };
  }
  if (tool === "select") return null;
  return { tool, ids: [], kinds: [tool] };
}

export interface TargetValues {
  color: string;
  width: number | null;
  fill: ShapeFill | null;
  /** The fill color with `fill: "both"`. */
  fillColor: string | null;
  head: ArrowHead | null;
  ends: ArrowEnds | null;
  /** Text only. */
  text: {
    fontFamily: string;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    align: TextAlign;
    background: boolean;
    backgroundColor: string;
  } | null;
}

/** What the controls show: the first object's style, or the tool's. */
export function targetValues(target: StyleTarget, doc: Doc): TargetValues {
  const a = doc.annotations.find((x) => x.id === target.ids[0]);
  const tools = useToolStore.getState();
  if (!a) {
    const t = target.tool;
    return {
      color: toolColor(t),
      width: t === "text" ? null : toolWidth(t),
      fill: t === "rect" || t === "ellipse" ? toolFill(t).fill : null,
      fillColor: t === "rect" || t === "ellipse" ? (toolFill(t).color ?? toolColor(t)) : null,
      head: t === "arrow" ? tools.arrowHead : null,
      ends: t === "arrow" ? tools.arrowEnds : null,
      text:
        t === "text"
          ? {
              fontFamily: toolFont().family,
              fontSize: toolFont().size,
              bold: tools.textBold,
              italic: tools.textItalic,
              align: tools.textAlign,
              background: tools.textBackground,
              backgroundColor: tools.textBackgroundColor ?? DEFAULT_TEXT_BACKGROUND,
            }
          : null,
    };
  }
  return {
    color: a.kind === "text" ? a.color : a.style.color,
    width: a.kind === "text" ? null : a.style.width,
    fill: a.kind === "rect" || a.kind === "ellipse" ? a.fill : null,
    fillColor: a.kind === "rect" || a.kind === "ellipse" ? a.fillColor : null,
    head: a.kind === "arrow" ? a.head : null,
    ends: a.kind === "arrow" ? a.ends : null,
    text:
      a.kind === "text"
        ? {
            fontFamily: a.fontFamily,
            fontSize: a.fontSize,
            bold: a.bold,
            italic: a.italic,
            align: a.align,
            background: a.background,
            backgroundColor: a.backgroundColor,
          }
        : null,
  };
}

/** Which sections the options show for a target. */
export function targetSections(target: StyleTarget) {
  const all = (pred: (k: AnnotationKind) => boolean) => target.kinds.every(pred);
  return {
    color: true,
    width: target.kinds.some((k) => k !== "text"),
    fill: all((k) => k === "rect" || k === "ellipse"),
    head: all((k) => k === "arrow"),
    text: all((k) => k === "text"),
  };
}

export interface StylePatch {
  color?: string;
  width?: number;
  fill?: ShapeFill;
  fillColor?: string;
  head?: ArrowHead;
  ends?: ArrowEnds;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
  background?: boolean;
  backgroundColor?: string;
}

function patchAnnotation(a: Annotation, p: StylePatch): Annotation {
  if (a.kind === "text") {
    const t = {
      ...a,
      color: p.color ?? a.color,
      fontFamily: p.fontFamily ?? a.fontFamily,
      fontSize: p.fontSize ?? a.fontSize,
      bold: p.bold ?? a.bold,
      italic: p.italic ?? a.italic,
      align: p.align ?? a.align,
      background: p.background ?? a.background,
      backgroundColor: p.backgroundColor ?? a.backgroundColor,
    };
    // A growing box follows its new font.
    const fontChanged =
      t.fontFamily !== a.fontFamily ||
      t.fontSize !== a.fontSize ||
      t.bold !== a.bold ||
      t.italic !== a.italic;
    if (t.autoWidth && fontChanged)
      t.width = measureTextWidth(t.text, textPx(t.fontSize), t.fontFamily, t.bold, t.italic);
    return t;
  }
  let next: Annotation = a;
  if (p.color !== undefined || p.width !== undefined) {
    next = {
      ...next,
      style: { ...a.style, color: p.color ?? a.style.color, width: p.width ?? a.style.width },
    } as Annotation;
  }
  if (next.kind === "rect" || next.kind === "ellipse") {
    if (p.fill !== undefined && p.fill !== next.fill) {
      // Turning on border + fill keeps a solid shape's look, else uses the
      // tool's fill color (or the border color until one is picked).
      const fillColor =
        p.fill !== "both"
          ? next.fillColor
          : next.fill === "solid"
            ? next.style.color
            : (toolFill(TOOL_FOR_KIND[next.kind]).color ?? next.style.color);
      next = { ...next, fill: p.fill, fillColor };
    }
    if (p.fillColor !== undefined) next = { ...next, fillColor: p.fillColor };
  }
  if (p.head !== undefined && next.kind === "arrow") next = { ...next, head: p.head };
  if (p.ends !== undefined && next.kind === "arrow") next = { ...next, ends: p.ends };
  return next;
}

/** A continuous change (a slider drag) in progress: its steps share one undo entry. */
let draggingOwnGesture = false;

export function beginStyleDrag(): void {
  const store = docStore.getState();
  if (store.gestureStart) return; // e.g. typing: join that step
  store.beginGesture();
  draggingOwnGesture = true;
}

export function endStyleDrag(): void {
  if (!draggingOwnGesture) return;
  draggingOwnGesture = false;
  docStore.getState().endGesture();
}

/** Abandon the drag: the objects go back to how they were (restore tool memory separately). */
export function cancelStyleDrag(): void {
  if (!draggingOwnGesture) return;
  draggingOwnGesture = false;
  docStore.getState().cancelGesture();
}

/** Apply a style change to the current target (objects and/or tool memory). */
export function applyStyle(patch: StylePatch): void {
  const target = styleTarget();
  if (!target) return;

  // The tools involved remember it for their next object.
  const tools = new Set(target.kinds.map((k) => TOOL_FOR_KIND[k]));
  for (const tool of tools) {
    if (patch.color !== undefined) rememberColor(tool, patch.color);
    if (patch.width !== undefined && tool !== "text") rememberWidth(tool, patch.width);
    if (tool === "rect" || tool === "ellipse") {
      if (patch.fill !== undefined)
        useToolStore.setState((s) => ({ fills: { ...s.fills, [tool]: patch.fill } }));
      if (patch.fillColor !== undefined)
        useToolStore.setState((s) => ({
          fillColors: { ...s.fillColors, [tool]: patch.fillColor },
        }));
    }
    if (tool === "text") {
      const t = useToolStore.getState();
      useToolStore.setState({
        fontFamily: patch.fontFamily ?? t.fontFamily,
        fontSize: patch.fontSize ?? t.fontSize,
        textBold: patch.bold ?? t.textBold,
        textItalic: patch.italic ?? t.textItalic,
        textAlign: patch.align ?? t.textAlign,
        textBackground: patch.background ?? t.textBackground,
        textBackgroundColor: patch.backgroundColor ?? t.textBackgroundColor,
      });
    }
    if (patch.head !== undefined && tool === "arrow")
      useToolStore.setState({ arrowHead: patch.head });
    if (patch.ends !== undefined && tool === "arrow")
      useToolStore.setState({ arrowEnds: patch.ends });
  }

  if (!target.ids.length) return;
  const store = docStore.getState();
  const own = !store.gestureStart;
  if (own) store.beginGesture();
  for (const id of target.ids) store.update(id, (a) => patchAnnotation(a, patch));
  if (own) store.endGesture();
}
