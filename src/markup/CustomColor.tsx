import { useEffect, useRef, useState } from "react";
import { commands } from "../shared/ipc";
import { ColorPicker } from "./ColorPicker";
import { hint } from "./HintLine";
import { beginStyleDrag, cancelStyleDrag, endStyleDrag } from "./restyle";
import { KEEPS_TEXT_EDITING, refocusTextEditor } from "./TextEditor";
import type { ColorKey } from "./restyle";
import { paletteKey, setCustomColor, type ColorSlotPosition } from "./styles";
import { useToolStore, type ToolId, type ToolState } from "./toolStore";
import { boxOf, useMenuPlacement } from "./menuPlacement";
import { usePopover } from "./usePopover";
import { MAX_PRESETS } from "./pickers";
import styles from "./options.module.css";

interface Props {
  /** The color the swatches currently set (border, fill, text or box). */
  value: string;
  /** Which of the chip's colors that is: each has its own custom color (PLAN 3D.14). */
  slot: ColorSlotPosition;
  /** What `value` is on the target (the shared current color follows only `color`). */
  colorKey: ColorKey;
  /** The presets on show: the custom swatch is "on" when `value` isn't one. */
  palette: string[];
  /** Whose presets "Save as preset" adds to. */
  tool: ToolId;
  /** Overrides whether the swatch shows as selected (off while a preset is edited). */
  selected?: boolean;
  /** Apply a color (live, while the picker is open). */
  onPick: (hex: string) => void;
}

/**
 * The custom swatch after the presets and the full picker it opens (PLAN
 * 2A.6c). It keeps the palette's last custom color, so it works like a preset:
 * a click uses that color, and a click while it's in use (or a right-click)
 * opens the picker. Colors apply as they're picked, and the whole visit is one
 * undo step: Done, Enter or a click elsewhere keeps it, Esc puts things back.
 * Picked colors join the presets only through "Save as preset".
 */
export function CustomColor({ value, slot, colorKey, palette, tool, selected, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuPlacement(open, menuRef, () => boxOf(swatchRef.current));
  const original = useRef(value);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  const isPreset = palette.some((c) => c.toLowerCase() === value.toLowerCase());
  // What the swatch holds: the color in use if it isn't a preset, else the
  // palette's last custom color for this chip color, if it has one. Like the
  // presets, it's shared by the tools on the shared palette.
  const key = paletteKey(tool);
  const remembered = useToolStore((s) =>
    slot === "first" ? s.customColors[key] : s.customSecondColors[key],
  );
  const custom = isPreset ? remembered : value;
  const rememberCustom = (c: string | undefined) => setCustomColor(key, c, slot, colorKey);
  // The tools' colors before the picker opened, for Esc.
  const before = useRef<Partial<ToolState>>({});

  const show = () => {
    original.current = value;
    const t = useToolStore.getState();
    before.current = {
      customColors: t.customColors,
      customSecondColors: t.customSecondColors,
      colors: t.colors,
      fillColors: t.fillColors,
      sharedColor: t.sharedColor,
      textBackgroundColor: t.textBackgroundColor,
      stepTextColor: t.stepTextColor,
    };
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
      useToolStore.setState(before.current);
    }
    setOpen(false);
    if (useToolStore.getState().editing) refocusTextEditor();
  };
  usePopover(open, rootRef, close, "keep");

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
      // It's a preset now; the custom swatch doesn't need to hold it too.
      rememberCustom(undefined);
      close(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.dropdownRoot} ${styles.customRoot}`}
      {...{ [KEEPS_TEXT_EDITING]: "" }}
    >
      <button
        ref={swatchRef}
        type="button"
        className={styles.customSwatch}
        {...hint("customColor")}
        // The custom color shows inside the rainbow.
        data-custom={custom ? "" : undefined}
        style={custom ? ({ "--custom": custom } as React.CSSProperties) : undefined}
        aria-pressed={selected ?? !isPreset}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Custom color"
        title={custom && isPreset ? "Custom color (click again to change it)" : "Custom color"}
        // Like a preset while it isn't in use; once it is, a click opens the picker.
        onClick={() => {
          if (open) close(true);
          else if (custom && isPreset) onPickRef.current(custom);
          else show();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!open) show();
        }}
      />
      {open && (
        <div
          ref={menuRef}
          className={`${styles.menu} ${styles.colorMenu}`}
          role="dialog"
          aria-label="Custom color"
        >
          <ColorPicker
            value={value}
            onChange={(c) => {
              onPickRef.current(c);
              rememberCustom(c);
            }}
          />
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
