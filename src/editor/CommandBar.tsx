import { hint } from "../markup/HintLine";
import { useEffect, useRef, useState } from "react";
import { keySuffix } from "../markup/shortcuts";
import { useStyleConfig } from "../markup/styles";
import { Toolbar } from "../markup/Toolbar";
import markupStyles from "../markup/markup.module.css";
import styles from "./EditorApp.module.css";

interface Props {
  busy: boolean;
  /** Crop mode is on (the crop button shows pressed, the tools don't). */
  cropping: boolean;
  onCrop: () => void;
  /** Picking a tool while cropping applies the crop first. */
  onPickTool: () => void;
  onNewCapture: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

/** The editor's top row: tools on the left, actions on the right. */
export function CommandBar({
  busy,
  cropping,
  onCrop,
  onPickTool,
  onNewCapture,
  onOpen,
  onCopy,
  onSave,
  onSaveAs,
}: Props) {
  const cropKey = keySuffix(useStyleConfig((s) => s.shortcuts.crop));
  return (
    <div className={styles.commandBar}>
      <Toolbar
        toolsActive={!cropping}
        onPickTool={onPickTool}
        extra={
          <button
            type="button"
            className={markupStyles.tool}
            {...hint("tool.crop")}
            aria-label={`Crop${cropKey}`}
            aria-pressed={cropping}
            title={`Crop${cropKey}`}
            onClick={onCrop}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 2v16h16" />
              <path d="M2 6h16v16" />
            </svg>
          </button>
        }
      />
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.button}
        {...hint("newCapture")}
        aria-label="New capture (Ctrl+N)"
        title="New capture (Ctrl+N)"
        onClick={onNewCapture}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 2.5" />
          <path d="M12 9v6M9 12h6" />
        </svg>
        <span className={styles.label}>New capture</span>
      </button>
      <button
        type="button"
        className={styles.button}
        {...hint("open")}
        aria-label="Open image (Ctrl+O)"
        title="Open image (Ctrl+O)"
        onClick={onOpen}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <span className={styles.label}>Open</span>
      </button>
      <button
        type="button"
        className={styles.button}
        {...hint("copy")}
        aria-label="Copy (Ctrl+C)"
        title="Copy (Ctrl+C)"
        disabled={busy}
        onClick={onCopy}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
        <span className={styles.label}>Copy</span>
      </button>
      <SaveButton busy={busy} onSave={onSave} onSaveAs={onSaveAs} />
    </div>
  );
}

function SaveButton({
  busy,
  onSave,
  onSaveAs,
}: {
  busy: boolean;
  onSave: () => void;
  onSaveAs: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className={styles.split} {...hint("save")}>
      <button
        type="button"
        className={styles.splitMain}
        aria-label="Save (Ctrl+S)"
        title="Save (Ctrl+S)"
        disabled={busy}
        onClick={onSave}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M5 4h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
          <path d="M8 4v5h7V4" />
          <path d="M8 20v-6h8v6" />
        </svg>
        <span className={styles.label}>Save</span>
      </button>
      <button
        type="button"
        className={styles.splitMore}
        aria-label="More save options"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={`${styles.menu} ${styles.menuBelow}`} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSaveAs();
            }}
          >
            Save as… <span className={styles.shortcut}>Ctrl+Shift+S</span>
          </button>
        </div>
      )}
    </div>
  );
}
