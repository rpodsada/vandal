// Step markers' labels and shared settings (PLAN 3D.11): pure functions over
// the document.

import type { AnnotationId, Doc, StepAnnotation, StepFormat, StepShape } from "./model/types";

/** What makes a marker look the way it does (not where it is or what it says). */
export interface StepStyle {
  shape: StepShape;
  size: number;
  color: string;
  textColor: string;
  fontFamily: string;
}

export function stepsOf(doc: Doc): StepAnnotation[] {
  return doc.annotations.filter((a): a is StepAnnotation => a.kind === "step");
}

/** The `n`th label: "1", "2"… or "A"… "Z", "AA", "AB"… (`n` from 1). */
export function stepLabel(n: number, format: StepFormat): string {
  const i = Math.max(1, Math.floor(n));
  if (format === "numbers") return String(i);
  let rest = i;
  let s = "";
  while (rest > 0) {
    rest -= 1;
    s = String.fromCharCode(65 + (rest % 26)) + s;
    rest = Math.floor(rest / 26);
  }
  return s;
}

/** The start value typed in the options bar ("5", "C", "aa"), or null if it isn't one. */
export function parseStepStart(text: string, format: StepFormat): number | null {
  const t = text.trim();
  if (format === "numbers") {
    if (!/^\d{1,4}$/.test(t)) return null;
    const n = Number(t);
    return n >= 1 ? n : null;
  }
  if (!/^[a-z]{1,3}$/i.test(t)) return null;
  return [...t.toUpperCase()].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
}

/** Longest label that can be typed for a marker. */
export const STEP_LABEL_MAX = 3;

/**
 * Every marker's label: its own if one was typed, else counting up in
 * creation order, skipping the markers with their own.
 */
export function stepLabels(doc: Doc): Map<AnnotationId, string> {
  const steps = stepsOf(doc);
  const labels = new Map<AnnotationId, string>();
  if (!steps.length) return labels;
  const { format, start } = steps[0];
  let n = start;
  for (const s of [...steps].sort((a, b) => a.seq - b.seq)) {
    labels.set(s.id, s.label ?? stepLabel(n++, format));
  }
  return labels;
}

/** How many markers have a label of their own. */
export function customLabelCount(doc: Doc): number {
  return stepsOf(doc).filter((s) => s.label !== undefined).length;
}

/**
 * A marker after its label was edited to `typed`: trimmed and cut to
 * {@link STEP_LABEL_MAX}; empty goes back to counting. Unchanged if the text
 * is what it already shows.
 */
export function withTypedLabel(s: StepAnnotation, typed: string, shown: string): StepAnnotation {
  const label = typed.trim().slice(0, STEP_LABEL_MAX);
  if (label === "") return s.label === undefined ? s : { ...s, label: undefined };
  return label === shown ? s : { ...s, label };
}

/** A `seq` after every marker's. */
export function nextStepSeq(doc: Doc): number {
  return stepsOf(doc).reduce((max, s) => Math.max(max, s.seq), 0) + 1;
}

export function stepStyleOf(s: StepAnnotation): StepStyle {
  return {
    shape: s.shape,
    size: s.size,
    color: s.color,
    textColor: s.textColor,
    fontFamily: s.fontFamily,
  };
}

export function sameStepStyle(a: StepStyle, b: StepStyle): boolean {
  return (
    a.shape === b.shape &&
    a.size === b.size &&
    a.color.toLowerCase() === b.color.toLowerCase() &&
    a.textColor.toLowerCase() === b.textColor.toLowerCase() &&
    a.fontFamily === b.fontFamily
  );
}

/**
 * What Sync style would do with `style`: nothing (every marker has it
 * already), or restyle markers that all look alike (no warning), or overwrite
 * markers styled differently from each other (warn first).
 */
export function stepResetEffect(doc: Doc, style: StepStyle): "none" | "uniform" | "mixed" {
  const steps = stepsOf(doc);
  if (steps.every((s) => sameStepStyle(stepStyleOf(s), style))) return "none";
  const first = stepStyleOf(steps[0]);
  return steps.every((s) => sameStepStyle(stepStyleOf(s), first)) ? "uniform" : "mixed";
}

/** Black or white, whichever reads better on `background` (#rrggbb). */
export function contrastingText(background: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background);
  if (!m) return "#ffffff";
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Leans to white (black and white contrast equally at 0.18): bold white
  // reads well on saturated colors like the palette's red, orange and blue.
  return lum > 0.45 ? "#000000" : "#ffffff";
}
