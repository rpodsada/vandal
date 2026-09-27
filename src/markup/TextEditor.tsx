import { useEffect, useLayoutEffect, useRef } from "react";
import { TEXT_LINE_HEIGHT, textPx } from "./geometry";
import { docStore } from "./model/store";
import type { Point, TextAnnotation } from "./model/types";
import { finishTextEdit } from "./textEditing";
import { measureTextWidth, textBoxPadding } from "./textMeasure";
import styles from "./markup.module.css";

/** Elements that can take focus without ending the typing session (the font filter). */
export const KEEPS_TEXT_EDITING = "data-keeps-text-editing";

let current: HTMLTextAreaElement | null = null;

/** Put the caret back in the text being typed (after the font filter had focus). */
export function refocusTextEditor(): void {
  current?.focus();
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
 * canvas text's font, size, wrapping, rotation and background box. Every
 * keystroke updates the document; the session is one undo step (see
 * textEditing.ts).
 */
export function TextEditor({ a, scale, offset }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const px = textPx(a.fontSize);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    current = el;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    return () => {
      if (current === el) current = null;
    };
  }, []);

  // Grow to fit the text.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  });

  const onChange = (text: string) => {
    docStore.getState().update(a.id, (t) =>
      t.kind === "text"
        ? {
            ...t,
            text,
            width: t.autoWidth
              ? measureTextWidth(text, textPx(t.fontSize), t.fontFamily, t.bold, t.italic)
              : t.width,
          }
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

  const onBlur = (e: React.FocusEvent) => {
    // Switching to another app keeps the session, and so does the font filter;
    // clicking elsewhere here ends it.
    if (!document.hasFocus()) return;
    const to = e.relatedTarget as Element | null;
    if (to?.closest(`[${KEEPS_TEXT_EDITING}]`)) return;
    finishTextEdit();
  };

  // Room for the caret after the last character of a growing box.
  const width = a.autoWidth ? a.width + px * 0.6 : a.width;
  const pad = textBoxPadding(px) * scale;
  return (
    <textarea
      ref={ref}
      className={styles.textEditor}
      value={a.text}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={{
        left: offset.x + a.x * scale,
        top: offset.y + a.y * scale,
        width: width * scale,
        transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined,
        fontFamily: `"${a.fontFamily}"`,
        fontSize: px * scale,
        fontWeight: a.bold ? "bold" : "normal",
        fontStyle: a.italic ? "italic" : "normal",
        lineHeight: TEXT_LINE_HEIGHT,
        color: a.color,
        textAlign: a.align,
        whiteSpace: a.autoWidth ? "pre" : "pre-wrap",
        // The box as the canvas draws it, without moving the text.
        ...(a.background && {
          background: a.backgroundColor,
          boxShadow: `0 0 0 ${pad}px ${a.backgroundColor}`,
          // A spread shadow's corners are this radius plus the spread: the
          // canvas box's radius is the padding.
          borderRadius: 1,
          outlineOffset: pad + 3,
        }),
      }}
    />
  );
}
