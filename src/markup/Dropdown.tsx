import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./options.module.css";

interface Props {
  className: string;
  title: string;
  /** The button's content (a chevron is added). */
  button: ReactNode;
  /** The menu rows; call `close` after a pick. */
  children: (close: () => void) => ReactNode;
}

/** A button that opens a menu under it. Esc or a click elsewhere closes it. */
export function Dropdown({ className, title, button, children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Esc closes the menu only, not a step of the editor's Esc ladder.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.dropdownRoot}>
      <button
        type="button"
        className={className}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {button}
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
