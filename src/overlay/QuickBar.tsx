import { forwardRef } from "react";
import { useDoc } from "../markup/model/store";
import { Toolbar } from "../markup/Toolbar";
import { ToolOptions } from "../markup/ToolOptions";
import { useToolStore } from "../markup/toolStore";
import styles from "./OverlayApp.module.css";

interface Props {
  x: number;
  y: number;
  /** An action is running: the buttons wait. */
  busy: boolean;
  /** A short message (a saved file, an error). */
  notice: { text: string; error?: boolean } | null;
  onCopy: () => void;
  onSave: () => void;
  onExit: () => void;
}

/**
 * Quick edit's toolbar card on the selection (PLAN 2B.1–2, mockup "Main"):
 * the tools and undo/redo, Copy, Save (the accent button) and Exit, with the
 * current tool's options as a second row ("Open in editor" joins in 2B.3).
 */
export const QuickBar = forwardRef<HTMLDivElement, Props>(function QuickBar(
  { x, y, busy, notice, onCopy, onSave, onExit },
  ref,
) {
  // The options row shows when there's something to style (hidden with Select
  // and nothing selected, as in the mockup).
  const tool = useToolStore((s) => s.tool);
  const typing = useToolStore((s) => s.editing !== null);
  const selected = useDoc((s) => s.selection.length > 0);
  const showOptions = tool !== "select" || selected || typing;
  return (
    <div
      ref={ref}
      className={styles.quickBar}
      style={{ left: x, top: y }}
      // The card isn't part of the selection screen: no new selection, no Done.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className={styles.quickRow}>
        <Toolbar />
        <span className={styles.quickDivider} />
        <button
          type="button"
          className={styles.quickButton}
          title="Copy (Ctrl+C)"
          disabled={busy}
          onClick={onCopy}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
          Copy
        </button>
        <button
          type="button"
          className={`${styles.quickButton} ${styles.quickAccent}`}
          title="Save (Ctrl+S)"
          disabled={busy}
          onClick={onSave}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 4h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
            <path d="M8 4v5h7V4" />
            <path d="M8 20v-6h8v6" />
          </svg>
          Save
        </button>
        <span className={styles.quickDivider} />
        <button
          type="button"
          className={styles.quickIcon}
          aria-label="Exit (Esc)"
          title="Exit (Esc)"
          onClick={onExit}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {showOptions && (
        <div className={styles.quickOptions}>
          <ToolOptions />
        </div>
      )}
      {notice && (
        <div className={notice.error ? styles.quickNoticeError : styles.quickNotice} role="status">
          {notice.text}
        </div>
      )}
    </div>
  );
});
