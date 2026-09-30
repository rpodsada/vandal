import { useEffect, useRef, useState } from "react";
import type { Point, StepAnnotation } from "./model/types";
import { finishStepLabel } from "./stepEditing";
import { STEP_LABEL_MAX } from "./steps";
import styles from "./markup.module.css";

interface Props {
  a: StepAnnotation;
  /** What the marker shows now. */
  label: string;
  /** CSS px per source px. */
  scale: number;
  /** CSS position of source pixel (0, 0). */
  offset: Point;
}

/** Font size as a share of the marker, by label length (the canvas shrinks long ones to fit). */
const FONT_BY_LENGTH = [0.56, 0.56, 0.44, 0.34];

/**
 * A field over a step marker for typing its own label (PLAN 3D.12), shaped
 * and colored like the marker. Enter or a click elsewhere keeps it, Esc
 * leaves the label as it was, and an empty label goes back to counting.
 */
export function StepLabelEditor({ a, label, scale, offset }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(label);
  // Enter or Esc already finished: the blur that follows must not again.
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (typed: string | null) => {
    if (finished.current) return;
    finished.current = true;
    finishStepLabel(typed);
  };

  const size = a.size * scale;
  return (
    <input
      ref={ref}
      className={styles.stepLabelEditor}
      aria-label="Marker label"
      value={draft}
      maxLength={STEP_LABEL_MAX}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== "Escape") return;
        // Not the host's Enter (done) or Esc ladder.
        e.preventDefault();
        e.stopPropagation();
        finish(e.key === "Enter" ? draft : null);
      }}
      // Switching to another app keeps typing; clicking elsewhere here keeps the label.
      onBlur={() => {
        if (document.hasFocus()) finish(draft);
      }}
      style={{
        left: offset.x + (a.x - a.size / 2) * scale,
        top: offset.y + (a.y - a.size / 2) * scale,
        width: size,
        height: size,
        borderRadius: a.shape === "circle" ? "50%" : a.shape === "rounded" ? size * 0.225 : 0,
        background: a.color,
        color: a.textColor,
        fontFamily: `"${a.fontFamily}"`,
        fontSize: size * FONT_BY_LENGTH[Math.min(draft.length, 3)],
      }}
    />
  );
}
