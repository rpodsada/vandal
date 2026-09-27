import { useEffect, useLayoutEffect, useRef } from "react";
import { TEXT_LINE_HEIGHT, textPx } from "./geometry";
import { docStore } from "./model/store";
import type { Point, TextAnnotation } from "./model/types";
import { finishTextEdit } from "./textEditing";
import styles from "./markup.module.css";

let measureCtx: CanvasRenderingContext2D | null = null;

/** Width in px of the longest line, measured the way Konva's canvas text does. */
function measureWidth(text: string, px: number, family: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 0;
  measureCtx.font = `${px}px "${family}"`;
  return Math.max(0, ...text.split("\n").map((line) => measureCtx!.measureText(line).width));
}

interface Props {
  a: TextAnnotation;
  /** CSS px per source px. */
  scale: number;
  /** CSS position of source pixel (0, 0). */
  offset: Point;
}

/**
 * A real textarea over the stage while typing (PLAN §4.6), matching the
 * canvas text's font, size, wrapping and rotation. Every keystroke updates
 * the document; the session is one undo step (see textEditing.ts).
 */
export function TextEditor({ a, scale, offset }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const px = textPx(a.fontSize);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Grow to fit the text.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  });

  const onChange = (text: string) => {
    docStore
      .getState()
      .update(a.id, (t) =>
        t.kind === "text"
          ? { ...t, text, width: t.autoWidth ? measureWidth(text, px, t.fontFamily) : t.width }
          : t,
      );
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Esc steps back to "text selected" (PLAN Phase 2); Enter types a new line.
    if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) {
      e.preventDefault();
      finishTextEdit();
    }
  };

  // Room for the caret after the last character of a growing box.
  const width = a.autoWidth ? a.width + px * 0.6 : a.width;
  return (
    <textarea
      ref={ref}
      className={styles.textEditor}
      value={a.text}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      // Switching to another app keeps the session; clicking elsewhere here ends it.
      onBlur={() => {
        if (document.hasFocus()) finishTextEdit();
      }}
      style={{
        left: offset.x + a.x * scale,
        top: offset.y + a.y * scale,
        width: width * scale,
        transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined,
        fontFamily: `"${a.fontFamily}"`,
        fontSize: px * scale,
        lineHeight: TEXT_LINE_HEIGHT,
        color: a.color,
        textAlign: a.align,
        whiteSpace: a.autoWidth ? "pre" : "pre-wrap",
      }}
    />
  );
}
