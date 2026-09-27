import { useEffect, useRef, useState } from "react";
import { Toolbar } from "../markup/Toolbar";
import styles from "./EditorApp.module.css";

interface Props {
  busy: boolean;
  onNewCapture: () => void;
  onCopy: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

/** The editor's top row: tools on the left, actions on the right. */
export function CommandBar({ busy, onNewCapture, onCopy, onSave, onSaveAs }: Props) {
  return (
    <div className={styles.commandBar}>
      <Toolbar />
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.button}
        title="New capture (Ctrl+N)"
        onClick={onNewCapture}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 2.5" />
          <path d="M12 9v6M9 12h6" />
        </svg>
        New capture
      </button>
      <button
        type="button"
        className={styles.button}
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
    <div ref={ref} className={styles.split}>
      <button
        type="button"
        className={styles.splitMain}
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
