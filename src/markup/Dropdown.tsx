import { useEffect, useRef, useState, type ReactNode } from "react";
import { boxOf, useMenuPlacement } from "./menuPlacement";
import styles from "./options.module.css";

interface Props {
  className: string;
  title: string;
  /** The button's content (a chevron is added). */
  button: ReactNode;
  /** The menu rows; call `close` after a pick. */
  children: (close: () => void) => ReactNode;
  /** Extra class for the menu (e.g. a scrolling list). */
  menuClassName?: string;
  /** After the menu closes, however it closed. */
  onClose?: () => void;
}

/**
 * A button that opens a menu under it (or above, near the bottom of the
 * window). Esc or a click elsewhere closes it.
 */
export function Dropdown({ className, title, button, children, menuClassName, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuPlacement(open, menuRef, () => boxOf(buttonRef.current));
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) onCloseRef.current?.();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Esc closes the menu only, not a step of the editor's Esc ladder.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A picker open inside the menu (the colors' custom color) takes Esc first.
      if (menuRef.current?.querySelector('[role="dialog"]')) return;
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
        ref={buttonRef}
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
        <div ref={menuRef} className={`${styles.menu} ${menuClassName ?? ""}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
