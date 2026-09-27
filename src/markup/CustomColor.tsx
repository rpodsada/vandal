import { useEffect, useRef, useState } from "react";
import { commands } from "../shared/ipc";
import { ColorPicker } from "./ColorPicker";
import { hint } from "./HintLine";
import { beginStyleDrag, cancelStyleDrag, endStyleDrag } from "./restyle";
import { KEEPS_TEXT_EDITING, refocusTextEditor } from "./TextEditor";
import { useToolStore, type ToolId } from "./toolStore";
import { MAX_PRESETS } from "./pickers";
import styles from "./options.module.css";

interface Props {
  /** The color the swatches currently set (border, fill, text or box). */
  value: string;
  /** The presets on show: the custom swatch is "on" when `value` isn't one. */
  palette: string[];
  /** Whose presets "Save as preset" adds to. */
  tool: ToolId;
  /** Apply a color (live, while the picker is open). */
  onPick: (hex: string) => void;
}

/**
 * The dashed swatch after the presets and the full picker it opens (PLAN
 * 2A.6c). Colors apply as they're picked, and the whole visit is one undo
 * step: Done, Enter or a click elsewhere keeps it, Esc puts things back.
 * Picked colors join the presets only through "Save as preset".
 */
export function CustomColor({ value, palette, tool, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const original = useRef(value);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  const isPreset = palette.some((c) => c.toLowerCase() === value.toLowerCase());

  const show = () => {
    original.current = value;
    setError(null);
    beginStyleDrag();
    setOpen(true);
  };

  const close = (keep: boolean) => {
    if (keep) {
      endStyleDrag();
    } else {
      // The tools' memory first (it isn't part of the undo history), then the objects.
      onPickRef.current(original.current);
      cancelStyleDrag();
    }
    setOpen(false);
    if (useToolStore.getState().editing) refocusTextEditor();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeRef.current(true);
    };
    // Esc and Enter end the visit, not a step of the editor's Esc ladder.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      // A field being typed in applies its text first.
      if (e.key === "Enter" && document.activeElement instanceof HTMLInputElement)
        document.activeElement.blur();
      closeRef.current(e.key === "Enter");
    };
    // The window losing focus keeps what's picked.
    const onBlur = () => closeRef.current(true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [open]);

  const full = palette.length >= MAX_PRESETS;
  const saveTitle = isPreset
    ? "This color is already a preset"
    : full
      ? `The palette is full (${MAX_PRESETS} colors)`
      : "Add this color to the presets";

  const save = async () => {
    try {
      await commands.addColorPreset(tool, value).then((r) => {
        if (r.status === "error") throw new Error(r.error);
      });
      close(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div ref={rootRef} className={styles.dropdownRoot} {...{ [KEEPS_TEXT_EDITING]: "" }}>
      <button
        type="button"
        className={styles.customSwatch}
        {...hint("customColor")}
        style={isPreset ? undefined : { background: value }}
        aria-pressed={!isPreset}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Custom color"
        title="Custom color"
        onClick={() => (open ? close(true) : show())}
      />
      {open && (
        <div
          className={`${styles.menu} ${styles.colorMenu}`}
          role="dialog"
          aria-label="Custom color"
        >
          <ColorPicker value={value} onChange={(c) => onPickRef.current(c)} />
          {error && <div className={styles.colorError}>{error}</div>}
          <div className={styles.colorActions}>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={isPreset || full}
              title={saveTitle}
              onClick={() => void save()}
            >
              Save as preset
            </button>
            <button type="button" className={styles.accentButton} onClick={() => close(true)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
