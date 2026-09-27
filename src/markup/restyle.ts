// What the style controls act on, and applying a change (PLAN Phase 2,
// "Restyling"): the text being typed into, else the selected objects, else the
// active tool's next object. Restyling objects is one undo step and also
// becomes the tools' current style.

import { docStore } from "./model/store";
import type { Annotation, AnnotationId, AnnotationKind, ArrowHead, Doc } from "./model/types";
import { rememberColor, rememberWidth, TOOL_FOR_KIND, toolColor, toolWidth } from "./styles";
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
  filled: boolean | null;
  head: ArrowHead | null;
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
      filled: t === "rect" || t === "ellipse" ? !!tools.filled[t] : null,
      head: t === "arrow" ? tools.arrowHead : null,
    };
  }
  return {
    color: a.kind === "text" ? a.color : a.style.color,
    width: a.kind === "text" ? null : a.style.width,
    filled: a.kind === "rect" || a.kind === "ellipse" ? a.filled : null,
    head: a.kind === "arrow" ? a.head : null,
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
  };
}

export interface StylePatch {
  color?: string;
  width?: number;
  filled?: boolean;
  head?: ArrowHead;
}

function patchAnnotation(a: Annotation, p: StylePatch): Annotation {
  if (a.kind === "text") return p.color ? { ...a, color: p.color } : a;
  let next: Annotation = a;
  if (p.color !== undefined || p.width !== undefined) {
    next = {
      ...next,
      style: { ...a.style, color: p.color ?? a.style.color, width: p.width ?? a.style.width },
    } as Annotation;
  }
  if (p.filled !== undefined && (next.kind === "rect" || next.kind === "ellipse"))
    next = { ...next, filled: p.filled };
  if (p.head !== undefined && next.kind === "arrow") next = { ...next, head: p.head };
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

/** Apply a style change to the current target (objects and/or tool memory). */
export function applyStyle(patch: StylePatch): void {
  const target = styleTarget();
  if (!target) return;

  // The tools involved remember it for their next object.
  const tools = new Set(target.kinds.map((k) => TOOL_FOR_KIND[k]));
  for (const tool of tools) {
    if (patch.color !== undefined) rememberColor(tool, patch.color);
    if (patch.width !== undefined && tool !== "text") rememberWidth(tool, patch.width);
    if (patch.filled !== undefined && (tool === "rect" || tool === "ellipse"))
      useToolStore.setState((s) => ({ filled: { ...s.filled, [tool]: patch.filled } }));
    if (patch.head !== undefined && tool === "arrow")
      useToolStore.setState({ arrowHead: patch.head });
  }

  if (!target.ids.length) return;
  const store = docStore.getState();
  const own = !store.gestureStart;
  if (own) store.beginGesture();
  for (const id of target.ids) store.update(id, (a) => patchAnnotation(a, patch));
  if (own) store.endGesture();
}
