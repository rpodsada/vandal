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
  RedactMode,
  ShapeFill,
  SpotlightShape,
  StepFormat,
  StepShape,
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
  toolRedact,
  stepNumbering,
  toolCornerRadius,
  toolSpotlight,
  toolStepStyle,
  toolWidth,
} from "./styles";
import { stepsOf, type StepStyle } from "./steps";
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
    // A mixed selection shows the pickers of the first kind that draws
    // (not a highlighter, redaction or spotlight), if there is one.
    const lead =
      kinds.find((k) => k !== "highlighter" && k !== "redact" && k !== "spotlight") ??
      kinds.find((k) => k !== "highlighter") ??
      kinds[0];
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
  /** Redact only. */
  redact: { mode: RedactMode; strength: number } | null;
  /** Spotlight only. */
  spotlight: { shape: SpotlightShape; dim: number } | null;
  /** Step markers only (`color` is the marker's). */
  step: (StepStyle & { format: StepFormat; start: number }) | null;
  /** Rectangles and rectangular spotlights: the corner radius (PLAN 3D.17). */
  corner: number | null;
}

/** What the controls show: the first object's style, or the tool's. */
export function targetValues(target: StyleTarget, doc: Doc): TargetValues {
  return { ...styleValues(target, doc), corner: cornerValue(target, doc) };
}

/** The corner radius on show, or null where corners don't apply (ellipses, round spotlights). */
function cornerValue(target: StyleTarget, doc: Doc): number | null {
  const a = doc.annotations.find((x) => x.id === target.ids[0]);
  if (!a) {
    if (target.tool === "rect") return toolCornerRadius("rect");
    if (target.tool === "spotlight" && useToolStore.getState().spotlightShape === "rect")
      return toolCornerRadius("spotlight");
    return null;
  }
  if (a.kind === "rect" || (a.kind === "spotlight" && a.shape === "rect"))
    return a.cornerRadius ?? 0;
  return null;
}

function styleValues(target: StyleTarget, doc: Doc): Omit<TargetValues, "corner"> {
  const a = doc.annotations.find((x) => x.id === target.ids[0]);
  const tools = useToolStore.getState();
  if (!a) {
    const t = target.tool;
    return {
      color: toolColor(t),
      width:
        t === "text" || t === "redact" || t === "spotlight" || t === "step" ? null : toolWidth(t),
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
      redact: t === "redact" ? toolRedact() : null,
      spotlight: t === "spotlight" ? toolSpotlight() : null,
      step: t === "step" ? { ...toolStepStyle(), ...stepNumbering(doc) } : null,
    };
  }
  if (a.kind === "step") {
    return {
      color: a.color,
      width: null,
      fill: null,
      fillColor: null,
      head: null,
      ends: null,
      text: null,
      redact: null,
      spotlight: null,
      step: {
        shape: a.shape,
        size: a.size,
        color: a.color,
        textColor: a.textColor,
        fontFamily: a.fontFamily,
        format: a.format,
        start: a.start,
      },
    };
  }
  if (a.kind === "spotlight") {
    return {
      color: toolColor("spotlight"),
      width: null,
      fill: null,
      fillColor: null,
      head: null,
      ends: null,
      text: null,
      redact: null,
      spotlight: { shape: a.shape, dim: a.dim },
      step: null,
    };
  }
  if (a.kind === "redact") {
    return {
      color: toolColor("redact"),
      width: null,
      fill: null,
      fillColor: null,
      head: null,
      ends: null,
      text: null,
      redact: { mode: a.mode, strength: a.strength },
      spotlight: null,
      step: null,
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
    redact: null,
    spotlight: null,
    step: null,
  };
}

/** Which sections the options show for a target. */
export function targetSections(target: StyleTarget) {
  const all = (pred: (k: AnnotationKind) => boolean) => target.kinds.every(pred);
  return {
    color: target.kinds.some((k) => k !== "redact" && k !== "spotlight"),
    width: target.kinds.some(
      (k) => k !== "text" && k !== "redact" && k !== "spotlight" && k !== "step",
    ),
    fill: all((k) => k === "rect" || k === "ellipse"),
    head: all((k) => k === "arrow"),
    text: all((k) => k === "text"),
    redact: all((k) => k === "redact"),
    spotlight: all((k) => k === "spotlight"),
    step: all((k) => k === "step"),
    // Also needs a rectangle's shape (see TargetValues.corner).
    corner: all((k) => k === "rect" || k === "spotlight"),
  };
}

/** A color the controls can set, by its key in {@link StylePatch}. */
export type ColorKey = "color" | "fillColor" | "backgroundColor" | "textColor";

export interface ColorSlot {
  key: ColorKey;
  value: string;
}

/**
 * The colors the swatches set (PLAN 3D.14): one, or two picked with the chip.
 * The first is the text's (text, a step marker's label) or a shape's fill;
 * the second the box, the marker, or the shape's border. Ctrl+digit sets the
 * first, Ctrl+Shift+digit the second.
 */
export interface ColorSlots {
  /**
   * What the colors are, which decides how they draw: "text" (text, with or
   * without its box, or a step marker) marks the first with an "A".
   */
  kind: "single" | "text" | "shape";
  first: ColorSlot;
  second: ColorSlot | null;
}

export function colorSlots(
  values: TargetValues,
  sections: ReturnType<typeof targetSections>,
): ColorSlots {
  if (sections.step && values.step) {
    return {
      kind: "text",
      first: { key: "textColor", value: values.step.textColor },
      second: { key: "color", value: values.step.color },
    };
  }
  if (sections.text && values.text?.background) {
    return {
      kind: "text",
      first: { key: "color", value: values.color },
      second: { key: "backgroundColor", value: values.text.backgroundColor },
    };
  }
  if (sections.text) {
    // One color, but still text's: its dropdown keeps the "A".
    return { kind: "text", first: { key: "color", value: values.color }, second: null };
  }
  if (sections.fill && values.fill === "both") {
    return {
      kind: "shape",
      first: { key: "fillColor", value: values.fillColor ?? values.color },
      second: { key: "color", value: values.color },
    };
  }
  return { kind: "single", first: { key: "color", value: values.color }, second: null };
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
  redactMode?: RedactMode;
  /** Redact: for the mode it ends up in. */
  strength?: number;
  spotlightShape?: SpotlightShape;
  /** Spotlight darkness (%): applies to every spotlight in the document. */
  dim?: number;
  stepShape?: StepShape;
  stepSize?: number;
  /** A step marker's label color. */
  textColor?: string;
  /** Step markers' labels: apply to every marker in the document. */
  stepFormat?: StepFormat;
  stepStart?: number;
  /** Rectangles and spotlights (PLAN 3D.17), in source px. */
  cornerRadius?: number;
}

function patchAnnotation(a: Annotation, p: StylePatch): Annotation {
  if (p.cornerRadius !== undefined && (a.kind === "rect" || a.kind === "spotlight"))
    a = { ...a, cornerRadius: p.cornerRadius };
  if (a.kind === "step") {
    return {
      ...a,
      shape: p.stepShape ?? a.shape,
      size: p.stepSize ?? a.size,
      color: p.color ?? a.color,
      textColor: p.textColor ?? a.textColor,
      fontFamily: p.fontFamily ?? a.fontFamily,
      format: p.stepFormat ?? a.format,
      start: p.stepStart ?? a.start,
    };
  }
  if (a.kind === "spotlight") {
    return { ...a, shape: p.spotlightShape ?? a.shape, dim: p.dim ?? a.dim };
  }
  if (a.kind === "redact") {
    const mode = p.redactMode ?? a.mode;
    // A new mode brings its own strength (a block size isn't a blur radius).
    const strength = p.strength ?? (mode === a.mode ? a.strength : toolRedact(mode).strength);
    return { ...a, mode, strength };
  }
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
export function applyStyle(patch: StylePatch, target = styleTarget()): void {
  if (!target) return;

  // The tools involved remember it for their next object.
  const tools = new Set(target.kinds.map((k) => TOOL_FOR_KIND[k]));
  for (const tool of tools) {
    if (patch.color !== undefined) rememberColor(tool, patch.color);
    if (patch.width !== undefined && widthTool(tool)) rememberWidth(tool, patch.width);
    if (patch.cornerRadius !== undefined && (tool === "rect" || tool === "spotlight"))
      useToolStore.setState((t) => ({
        cornerRadii: { ...t.cornerRadii, [tool]: patch.cornerRadius },
      }));
    if (tool === "step") {
      const t = useToolStore.getState();
      useToolStore.setState({
        stepShape: patch.stepShape ?? t.stepShape,
        stepSize: patch.stepSize ?? t.stepSize,
        stepTextColor: patch.textColor ?? t.stepTextColor,
        stepFont: patch.fontFamily ?? t.stepFont,
        stepFormat: patch.stepFormat ?? t.stepFormat,
        stepStart: patch.stepStart ?? t.stepStart,
      });
    }
    if (tool === "spotlight") {
      const t = useToolStore.getState();
      useToolStore.setState({
        spotlightShape: patch.spotlightShape ?? t.spotlightShape,
        spotlightDim: patch.dim ?? t.spotlightDim,
      });
    }
    if (tool === "redact") rememberRedact(target, patch);
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

  const store = docStore.getState();
  // The darkness is shared by every spotlight, and the labels' format and
  // start by every step marker, selected or not.
  const shared = [
    ...(patch.dim === undefined ? [] : store.doc.annotations.filter((a) => a.kind === "spotlight")),
    ...(patch.stepFormat === undefined && patch.stepStart === undefined ? [] : stepsOf(store.doc)),
  ];
  const ids = [...new Set([...target.ids, ...shared.map((a) => a.id)])];
  if (!ids.length) return;
  const own = !store.gestureStart;
  if (own) store.beginGesture();
  for (const id of ids) store.update(id, (a) => patchAnnotation(a, patch));
  if (own) store.endGesture();
}

/**
 * Swap the chip's two colors (PLAN 3D.15): on each selected object that has
 * two, as one undo step, or on the tool's next object. False if there's
 * nothing with two colors to swap.
 */
export function swapColors(): boolean {
  const target = styleTarget();
  if (!target) return false;
  const doc = docStore.getState().doc;
  const swapped = (t: StyleTarget): StylePatch | null => {
    const { first, second } = colorSlots(targetValues(t, doc), targetSections(t));
    return second ? { [first.key]: second.value, [second.key]: first.value } : null;
  };
  if (!target.ids.length) {
    const patch = swapped(target);
    if (patch) applyStyle(patch, target);
    return !!patch;
  }
  // Each object swaps its own colors. The first goes last, so the tools
  // remember its result, as they would for any restyle.
  const each = target.ids
    .map((id) => {
      const kind = doc.annotations.find((a) => a.id === id)?.kind;
      if (!kind) return null;
      const one: StyleTarget = { tool: TOOL_FOR_KIND[kind], ids: [id], kinds: [kind] };
      const patch = swapped(one);
      return patch && { one, patch };
    })
    .filter((x) => x !== null)
    .reverse();
  if (!each.length) return false;
  const store = docStore.getState();
  store.beginGesture();
  for (const { one, patch } of each) applyStyle(patch, one);
  store.endGesture();
  return true;
}

/** Tools with a line width. */
function widthTool(tool: ToolId): boolean {
  return tool !== "text" && tool !== "redact" && tool !== "spotlight" && tool !== "step";
}

/**
 * Sync style (PLAN 3D.11): give every step marker `style`, in one undo
 * step. It becomes the tool's style too.
 */
export function resetStepStyles(style: StepStyle): void {
  rememberColor("step", style.color);
  useToolStore.setState({
    stepShape: style.shape,
    stepSize: style.size,
    stepTextColor: style.textColor,
    stepFont: style.fontFamily,
  });
  const store = docStore.getState();
  const steps = stepsOf(store.doc);
  if (!steps.length) return;
  store.beginGesture();
  for (const s of steps) {
    store.update(s.id, (a) =>
      a.kind === "step"
        ? {
            ...a,
            shape: style.shape,
            size: style.size,
            color: style.color,
            textColor: style.textColor,
            fontFamily: style.fontFamily,
          }
        : a,
    );
  }
  store.endGesture();
}

/** Redact remembers its mode, and the strength for the mode it applies to. */
function rememberRedact(target: StyleTarget, patch: StylePatch): void {
  const first = docStore.getState().doc.annotations.find((a) => target.ids.includes(a.id));
  const mode =
    patch.redactMode ??
    (first?.kind === "redact" ? first.mode : useToolStore.getState().redactMode);
  useToolStore.setState((t) => ({
    redactMode: mode,
    redactStrengths:
      patch.strength !== undefined
        ? { ...t.redactStrengths, [mode]: patch.strength }
        : t.redactStrengths,
  }));
}
