import { useRef, useState } from "react";
import { commands } from "../shared/ipc";
import { ColorPicker } from "./ColorPicker";
import { hasOwnPalette } from "./styles";
import { KEEPS_TEXT_EDITING, refocusTextEditor } from "./TextEditor";
import { useToolStore, type ToolId } from "./toolStore";
import { boxOf, useMenuPlacement } from "./menuPlacement";
import { usePopover } from "./usePopover";
import styles from "./options.module.css";

interface Props {
  palette: string[];
  index: number;
  /** Whose palette this is (its own, or the shared one). */
  tool: ToolId;
  /** The draft (the swatch shows it too). */
  color: string;
  onChange: (color: string) => void;
  /** Where the swatch sits in the swatch row. */
  left: number;
  onClose: () => void;
}

const capitalized = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Right-click on a preset: change or delete it. This edits the palette only,
 * not what's selected; Enter or Save keeps the change, Esc or a click
 * elsewhere drops it.
 */
export function PresetEditor({ palette, index, tool, color, onChange, left, onClose }: Props) {
  const original = palette[index];
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Under the preset: `left` into the swatch row.
  useMenuPlacement(true, rootRef, () => {
    const row = boxOf(rootRef.current?.parentElement);
    return row && { ...row, left: row.left + left, width: 0 };
  });

  const finish = () => {
    onClose();
    if (useToolStore.getState().editing) refocusTextEditor();
  };

  const run = async (next: string | null) => {
    const r = await commands.editColorPreset(tool, index, next);
    if (r.status === "error") setError(r.error);
    else finish();
  };

  const changed = color !== original;
  usePopover(true, rootRef, (keep) => (keep && changed ? void run(color) : finish()), "cancel");

  const own = hasOwnPalette(tool);
  return (
    <div
      ref={rootRef}
      className={`${styles.menu} ${styles.colorMenu}`}
      role="dialog"
      aria-label={`Preset ${index + 1}`}
      {...{ [KEEPS_TEXT_EDITING]: "" }}
    >
      <div className={styles.colorCaption}>
        Preset {index + 1} · {own ? `${capitalized(tool)} palette` : "Shared palette"}
      </div>
      <ColorPicker
        value={color}
        onChange={(c) => {
          onChange(c);
          setError(null);
        }}
      />
      {error && <div className={styles.colorError}>{error}</div>}
      <div className={styles.colorActions}>
        <button
          type="button"
          className={`${styles.ghostButton} ${styles.deleteButton}`}
          disabled={palette.length <= 1}
          title={
            palette.length <= 1 ? "The palette needs at least one color" : "Delete this preset"
          }
          onClick={() => void run(null)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
          </svg>
          Delete
        </button>
        <span className={styles.spacer} />
        <button type="button" className={styles.ghostButton} onClick={finish}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.accentButton}
          disabled={!changed}
          onClick={() => void run(color)}
        >
          Save
        </button>
      </div>
    </div>
  );
}
