import { useEffect, useRef, useState } from "react";
import { zoomLabel } from "./view";
import { useViewStore } from "./viewStore";
import styles from "./EditorApp.module.css";

/** A short-lived message in the status bar (result of copy/save, errors). */
export interface Notice {
  text: string;
  /** A saved file, offered as "Show in folder". */
  path?: string;
  error?: boolean;
}

/** Zoom levels offered in the menu. */
const MENU_ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8];

export function StatusBar({
  notice,
  onReveal,
}: {
  notice: Notice | null;
  onReveal: (path: string) => void;
}) {
  const image = useViewStore((s) => s.image);
  const zoom = useViewStore((s) => s.view.zoom);
  const fitted = useViewStore((s) => s.fitted);
  const { zoomStep, zoomTo, fit } = useViewStore.getState();

  return (
    <footer className={styles.status}>
      {notice ? (
        <span className={notice.error ? styles.noticeError : styles.notice} role="status">
          {notice.text}
          {notice.path && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onReveal(notice.path!)}
            >
              Show in folder
            </button>
          )}
        </span>
      ) : (
        image && (
          <span>
            {image.width} × {image.height} px
          </span>
        )
      )}
      {image && (
        <>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Zoom out"
            title="Zoom out (Ctrl+−)"
            onClick={() => zoomStep(-1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M5 12h14" />
            </svg>
          </button>
          <ZoomMenu
            label={fitted ? `${zoomLabel(zoom)} (fit)` : zoomLabel(zoom)}
            zoom={zoom}
            onPick={(z) => (z === "fit" ? fit() : zoomTo(z))}
          />
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Zoom in"
            title="Zoom in (Ctrl+=)"
            onClick={() => zoomStep(1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M5 12h14M12 5v14" />
            </svg>
          </button>
          <span className={styles.divider} />
          <button
            type="button"
            className={styles.textButton}
            title="Fit to window (Ctrl+0)"
            onClick={fit}
          >
            Fit
          </button>
          <button
            type="button"
            className={styles.textButton}
            title="Actual size (Ctrl+Shift+0)"
            onClick={() => zoomTo(1)}
          >
            100%
          </button>
        </>
      )}
    </footer>
  );
}

function ZoomMenu({
  label,
  zoom,
  onPick,
}: {
  label: string;
  zoom: number;
  onPick: (zoom: number | "fit") => void;
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

  const pick = (z: number | "fit") => {
    setOpen(false);
    onPick(z);
  };

  return (
    <div ref={ref} className={styles.zoomMenu}>
      <button
        type="button"
        className={styles.zoomButton}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Zoom"
        onClick={() => setOpen(!open)}
      >
        {label}
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button type="button" role="menuitem" onClick={() => pick("fit")}>
            Fit to window
          </button>
          {MENU_ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              role="menuitem"
              aria-current={Math.abs(z - zoom) < 1e-3 ? "true" : undefined}
              onClick={() => pick(z)}
            >
              {zoomLabel(z)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
