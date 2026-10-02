// Text redaction (PLAN 3J): with Redact's Detect text toggle on, the words Rust's OCR
// found in the image can be selected (click a word, triple-click a line, drag
// from word to word), and the selection becomes ordinary redactions, one per
// line. The geometry here is pure; the store holds the current image's words.

import { create } from "zustand";
import type { OcrError, OcrLine } from "../shared/ipc";
import type { Point, Rect } from "./model/types";
import { useRedactSource } from "./redact";

/** Around each line's redaction, in source px: the boxes hug the ink. */
export const LINE_PAD = 2;

export interface TextWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Index into {@link TextLayout.lines}. */
  line: number;
  /** Reading order across the whole image (lines in OCR order, columns together). */
  order: number;
}

export interface TextLine {
  /** The line's full height, padded: every word on it is redacted this tall. */
  top: number;
  bottom: number;
  words: TextWord[];
}

export interface TextLayout {
  words: TextWord[];
  lines: TextLine[];
}

export function layoutText(lines: OcrLine[]): TextLayout {
  const out: TextLayout = { words: [], lines: [] };
  for (const line of lines) {
    if (!line.words.length) continue;
    const index = out.lines.length;
    const words = line.words.map(({ text, rect }) => ({
      text,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      line: index,
      order: 0,
    }));
    const top = Math.min(...words.map((w) => w.y));
    const bottom = Math.max(...words.map((w) => w.y + w.height));
    for (const w of words) {
      w.order = out.words.length;
      out.words.push(w);
    }
    out.lines.push({ top: top - LINE_PAD, bottom: bottom + LINE_PAD, words });
  }
  return out;
}

/** The word under `p`: its span, the line's height, `slack` source px around. */
export function wordAt(layout: TextLayout, p: Point, slack: number): TextWord | null {
  for (const w of layout.words) {
    const line = layout.lines[w.line];
    if (
      p.x >= w.x - slack &&
      p.x <= w.x + w.width + slack &&
      p.y >= line.top - slack &&
      p.y <= line.bottom + slack
    )
      return w;
  }
  return null;
}

/** The word nearest `p` (for a drag between words): lines count more than columns. */
export function nearestWord(layout: TextLayout, p: Point): TextWord | null {
  let best: TextWord | null = null;
  let bestD = Infinity;
  for (const w of layout.words) {
    const line = layout.lines[w.line];
    const dx = p.x < w.x ? w.x - p.x : p.x > w.x + w.width ? p.x - w.x - w.width : 0;
    const dy = p.y < line.top ? line.top - p.y : p.y > line.bottom ? p.y - line.bottom : 0;
    const d = dx + dy * 3;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** Every word from `a` to `b` in reading order, either way round. */
export function wordRange(layout: TextLayout, a: TextWord, b: TextWord): TextWord[] {
  const [lo, hi] = a.order <= b.order ? [a.order, b.order] : [b.order, a.order];
  return layout.words.slice(lo, hi + 1);
}

/** One rect per line: the words' span plus padding, the line's full height. */
export function lineRects(layout: TextLayout, words: TextWord[]): Rect[] {
  const spans = new Map<number, { x0: number; x1: number }>();
  for (const w of words) {
    const s = spans.get(w.line) ?? { x0: Infinity, x1: -Infinity };
    s.x0 = Math.min(s.x0, w.x);
    s.x1 = Math.max(s.x1, w.x + w.width);
    spans.set(w.line, s);
  }
  return [...spans].map(([index, s]) => {
    const line = layout.lines[index];
    return {
      x: s.x0 - LINE_PAD,
      y: line.top,
      width: s.x1 - s.x0 + 2 * LINE_PAD,
      height: line.bottom - line.top,
    };
  });
}

// ---------- the current image's words ----------

export type TextStatus =
  | { kind: "idle" }
  | { kind: "finding" }
  | { kind: "ready"; layout: TextLayout }
  | { kind: "error"; error: OcrError };

type Recognize = () => Promise<
  { status: "ok"; data: OcrLine[] } | { status: "error"; error: OcrError }
>;

/** How the host recognizes its image (the editor's, quick edit's selection). */
let recognize: Recognize | null = null;

export const useTextRedact = create<{ status: TextStatus }>(() => ({
  status: { kind: "idle" },
}));

/** Set by the host once its image is loaded; forgets the last image's words. */
export function setTextRecognizer(fn: Recognize | null): void {
  recognize = fn;
  useTextRedact.setState({ status: { kind: "idle" } });
}

// Another image: its words are unknown until asked for again.
useRedactSource.subscribe((s, prev) => {
  if (s.image !== prev.image) useTextRedact.setState({ status: { kind: "idle" } });
});

/** Recognize the image's text, once (Detect text turned on); again after a failure. */
export async function findText(): Promise<void> {
  const { status } = useTextRedact.getState();
  if ((status.kind !== "idle" && status.kind !== "error") || !recognize) return;
  const asked = recognize;
  useTextRedact.setState({ status: { kind: "finding" } });
  let next: TextStatus;
  try {
    const result = await asked();
    next =
      result.status === "ok"
        ? { kind: "ready", layout: layoutText(result.data) }
        : { kind: "error", error: result.error };
  } catch (e) {
    next = { kind: "error", error: { kind: "failed", message: String(e) } };
  }
  // The image changed while it ran: these words belong to the old one.
  if (recognize === asked && useTextRedact.getState().status.kind === "finding") {
    useTextRedact.setState({ status: next });
  }
}

/** The words to select, if the image's text is known. */
export function textLayout(status: TextStatus): TextLayout | null {
  return status.kind === "ready" && status.layout.words.length ? status.layout : null;
}
