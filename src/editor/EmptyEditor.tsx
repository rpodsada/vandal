import logo from "../../assets/vandal-icon-tray.png";
import styles from "./EditorApp.module.css";

interface Props {
  onNewCapture: () => void;
  onOpen: () => void;
}

/**
 * An editor with no image yet (PLAN 3G): how to get one. Whatever is opened
 * from here (Open, a dropped file, Ctrl+V) loads into this window.
 */
export function EmptyEditor({ onNewCapture, onOpen }: Props) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyCard}>
        <img className={styles.emptyLogo} src={logo} alt="" />
        <p className={styles.emptyTitle}>Open an image or take a capture</p>
        <div className={styles.emptyButtons}>
          <button
            type="button"
            className={`${styles.button} ${styles.emptyButton}`}
            onClick={onNewCapture}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 2.5" />
              <path d="M12 9v6M9 12h6" />
            </svg>
            Capture
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.emptyButton}`}
            onClick={onOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            Open image
          </button>
        </div>
        <p className={styles.emptyHint}>
          Or drop an image file here, or paste one with <kbd>Ctrl</kbd>+<kbd>V</kbd>.
        </p>
      </div>
    </div>
  );
}
