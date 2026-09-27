import { useState } from "react";
import { useDoc } from "../markup/model/store";
import { inFrame, resizeCrop, type Rect } from "./cropGeometry";
import { applyCrop, cancelCrop, resetCrop, showFullCapture, useCropStore } from "./cropStore";
import styles from "../markup/options.module.css";

/**
 * Crop mode's options bar (mockup "ToolOptions", crop): the box's size, Reset,
 * Show full capture, and Cancel / Apply for mouse users (Esc / Enter).
 */
export function CropOptions() {
  const draft = useCropStore((s) => s.draft);
  const frame = useCropStore((s) => s.frame);
  const start = useCropStore((s) => s.start);
  const source = useDoc((s) => s.doc.source);
  if (!draft || !frame || !start) return null;
  const set = useCropStore.getState().setDraft;
  const resize = (w: number, h: number) =>
    set(inFrame(frame, (size, local) => resizeCrop(local.rect(draft), w, h, size)));
  const same = (a: Rect, b: Rect) =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  const full = frame.width === source.width && frame.height === source.height;

  return (
    <div className={styles.options}>
      <SizeField label="W" value={draft.width} onChange={(w) => resize(w, draft.height)} />
      <SizeField label="H" value={draft.height} onChange={(h) => resize(draft.width, h)} />
      <span className={styles.sep} />
      <button
        type="button"
        className={styles.ghostButton}
        title="Back to the image as it was, with the box around all of it"
        disabled={same(draft, start) && same(frame, start)}
        onClick={resetCrop}
      >
        Reset
      </button>
      <button
        type="button"
        className={styles.ghostButton}
        title="Show everything the capture holds, to grow the crop back out"
        disabled={full}
        onClick={showFullCapture}
      >
        Show full capture
      </button>
      <span className={styles.optionsSpacer} />
      <button
        type="button"
        className={styles.ghostButton}
        title="Cancel (Esc)"
        onClick={cancelCrop}
      >
        Cancel
      </button>
      <button
        type="button"
        className={styles.accentButton}
        title="Apply (Enter)"
        onClick={applyCrop}
      >
        Apply
      </button>
    </div>
  );
}

/** A px field that applies on Enter or when it loses focus. */
function SizeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number(draft);
    if (draft !== null && Number.isFinite(n) && n >= 1) onChange(n);
    setDraft(null);
  };
  return (
    <label className={styles.sizeField}>
      <span>{label}</span>
      <input
        className={styles.colorField}
        inputMode="numeric"
        aria-label={label === "W" ? "Width" : "Height"}
        value={draft ?? String(value)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter sets the size; it doesn't apply the crop from here.
          if (e.key === "Enter") {
            e.stopPropagation();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span>px</span>
    </label>
  );
}
