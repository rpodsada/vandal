import { useEffect, useRef, useState } from "react";
import { markupClipboard } from "./markupClipboard";
import { useMenuPlacement } from "./menuPlacement";
import { docStore, useDoc } from "./model/store";
import type { Reorder } from "./model/commands";
import { canArrange, duplicateSelection } from "./objectActions";
import styles from "./options.module.css";

interface Props {
  /** Where the right-click was, in window (client) px. */
  at: { x: number; y: number };
  /** Opened on an object (else on empty canvas: the object rows are greyed). */
  onObject: boolean;
  onClose: () => void;
}

const ARRANGE: { how: Reorder; label: string; keys: string }[] = [
  { how: "front", label: "To Front", keys: "Ctrl+Shift+]" },
  { how: "forward", label: "Forward One", keys: "Ctrl+]" },
  { how: "backward", label: "Back One", keys: "Ctrl+[" },
  { how: "back", label: "To Back", keys: "Ctrl+Shift+[" },
];

/**
 * The right-click menu: copy and paste markup (where the host offers it,
 * PLAN 3R), then the selected objects' actions, as their keyboard
 * shortcuts. Esc, a click elsewhere, a key, the wheel or the window losing
 * focus closes it.
 */
export function ObjectMenu({ at, onObject, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const arrange = useDoc((s) => canArrange(s.doc, s.selection));
  const hasObjects = useDoc((s) => s.doc.annotations.length > 0);
  const clipboard = markupClipboard();
  // Greyed until the clipboard has been read.
  const [canPaste, setCanPaste] = useState(false);
  useEffect(() => {
    let live = true;
    void clipboard?.canPaste().then((ok) => {
      if (live) setCanPaste(ok);
    });
    return () => {
      live = false;
    };
  }, [clipboard]);
  useMenuPlacement(true, menuRef, () => ({ left: at.x, top: at.y, width: 0, height: 0 }));

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const close = () => onCloseRef.current();
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      // Tab and Enter/Space work the menu's buttons.
      if (e.key === "Tab" || e.key === "Enter" || e.key === " ") return;
      // Esc closes the menu only, not a step of the editor's Esc ladder.
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      close();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, []);

  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  const store = docStore.getState;

  return (
    <div ref={menuRef} className={`${styles.menu} ${styles.contextMenu}`} role="menu">
      {clipboard && (
        <>
          <Row
            label="Copy All Markup"
            disabled={!hasObjects}
            onClick={run(() => clipboard.copyAll())}
          />
          <Row label="Paste Markup" disabled={!canPaste} onClick={run(() => clipboard.paste())} />
          <div className={styles.menuSep} role="separator" />
        </>
      )}
      <Row label="Duplicate" keys="Ctrl+D" disabled={!onObject} onClick={run(duplicateSelection)} />
      <div className={styles.menuSep} role="separator" />
      {ARRANGE.map(({ how, label, keys }) => (
        <Row
          key={how}
          label={label}
          keys={keys}
          disabled={!onObject || !arrange}
          onClick={run(() => store().reorder(store().selection, how))}
        />
      ))}
      <div className={styles.menuSep} role="separator" />
      <Row
        label="Delete"
        keys="Del"
        disabled={!onObject}
        onClick={run(() => store().remove(store().selection))}
      />
    </div>
  );
}

function Row(props: { label: string; keys?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.menuRow}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className={styles.menuLabel}>{props.label}</span>
      {props.keys && <span className={styles.menuKey}>{props.keys}</span>}
    </button>
  );
}
