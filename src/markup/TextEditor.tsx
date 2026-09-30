import { useEffect, useLayoutEffect, useRef } from "react";
import { TEXT_LINE_HEIGHT, textPx } from "./geometry";
import { docStore } from "./model/store";
import type { CalloutAnnotation, Point, TextAnnotation } from "./model/types";
import { growCallout } from "./callout";
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
  /** A callout's box and pointer stay on the canvas; only its text is typed here. */
  a: TextAnnotation | CalloutAnnotation;
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
    docStore.getState().update(a.id, (t) => {
      if (t.kind !== "text" && t.kind !== "callout") return t;
      const next = { ...t, text };
      if (!t.autoWidth) return next;
      const width = measureTextWidth(text, textPx(t.fontSize), t.fontFamily, t.bold, t.italic);
      // A callout grows away from what it points at (PLAN 3E.5).
      return next.kind === "callout" ? growCallout(next, width) : { ...next, width };
    });
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

  // Room for the caret after the last character of a growing box, on the
  // side the aligned text grows toward, so the text itself doesn't move:
  // after it (left), before it (right), or half each side (centred).
  const room = a.autoWidth ? px * 0.6 : 0;
  const width = a.width + room;
  const before = a.align === "right" ? room : a.align === "center" ? room / 2 : 0;
  const pad = textBoxPadding(px) * scale;
  const text = a.kind === "text" ? a : null;
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
        // Shifted along the text's own (maybe rotated) line.
        transform:
          [
            text?.rotation ? `rotate(${text.rotation}deg)` : "",
            before ? `translateX(${-before * scale}px)` : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        fontFamily: `"${a.fontFamily}"`,
        fontSize: px * scale,
        fontWeight: a.bold ? "bold" : "normal",
        fontStyle: a.italic ? "italic" : "normal",
        lineHeight: TEXT_LINE_HEIGHT,
        color: a.kind === "text" ? a.color : a.textColor,
        textAlign: a.align,
        whiteSpace: a.autoWidth ? "pre" : "pre-wrap",
        // The box as the canvas draws it, without moving the text.
        ...(text?.background && {
          background: text.backgroundColor,
          boxShadow: `0 0 0 ${pad}px ${text.backgroundColor}`,
          // A spread shadow's corners are this radius plus the spread: the
          // canvas box's radius is the padding.
          borderRadius: 1,
          outlineOffset: pad + 3,
        }),
        // Outside the callout's box, which the canvas draws.
        ...(!text && { outlineOffset: pad + 3 }),
      }}
    />
  );
}
