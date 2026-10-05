import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { boxOf, useMenuPlacement, type MenuAlign } from "./menuPlacement";
import styles from "./options.module.css";

interface Props {
  /** The button's id, for a `<label htmlFor>` (Settings). */
  id?: string;
  className: string;
  title: string;
  /** The button's content (a chevron is added). */
  button: ReactNode;
  /**
   * The menu rows; call `close` after a pick. `byRightClick`: opened with a
   * right-click on the button (only with `rightClickOpens`).
   */
  children: (close: () => void, byRightClick: boolean) => ReactNode;
  /** A right-click on the button opens the menu too, telling `children` so. */
  rightClickOpens?: boolean;
  /** Extra class for the menu (e.g. a scrolling list). */
  menuClassName?: string;
  /** After the menu closes, however it closed. */
  onClose?: () => void;
  disabled?: boolean;
  /** Line the menu up with the button's left edge (default) or right edge. */
  align?: MenuAlign;
}

/**
 * A button that opens a menu under it (or above, near the bottom of the
 * window). Esc or a click elsewhere closes it.
 */
export function Dropdown({
  id,
  className,
  title,
  button,
  children,
  menuClassName,
  onClose,
  disabled,
  align = "start",
  rightClickOpens = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [byRightClick, setByRightClick] = useState(false);
  // Each right-click starts the menu's contents afresh, even if it's open.
  const [visit, setVisit] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuPlacement(open, menuRef, () => boxOf(buttonRef.current), align);
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
        id={id}
        type="button"
        disabled={disabled}
        className={className}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setByRightClick(false);
          setOpen((o) => !o);
        }}
        onContextMenu={
          rightClickOpens
            ? (e) => {
                e.preventDefault();
                setByRightClick(true);
                setVisit((v) => v + 1);
                setOpen(true);
              }
            : undefined
        }
      >
        {button}
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div ref={menuRef} className={`${styles.menu} ${menuClassName ?? ""}`} role="menu">
          <Fragment key={visit}>{children(() => setOpen(false), byRightClick)}</Fragment>
        </div>
      )}
    </div>
  );
}
