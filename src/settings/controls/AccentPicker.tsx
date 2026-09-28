import { useEffect, useRef, useState } from "react";
import { ColorPicker } from "../../markup/ColorPicker";
import { boxOf, useMenuPlacement } from "../../markup/menuPlacement";
import { usePopover } from "../../markup/usePopover";
import markup from "../../markup/options.module.css";
import { commands, events, type WindowsAccent } from "../../shared/ipc";
import type { AccentItem } from "../schema";
import { useSetting } from "../store";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

/** Windows 11's accent palette, a few of each hue family. */
const PRESETS = [
  { color: "#1f6fe5", name: "Blue" },
  { color: "#8764b8", name: "Purple" },
  { color: "#c239b3", name: "Pink" },
  { color: "#d13438", name: "Red" },
  { color: "#ca5010", name: "Orange" },
  { color: "#107c10", name: "Green" },
  { color: "#038387", name: "Teal" },
  { color: "#69797e", name: "Graphite" },
];

/**
 * The accent color (PLAN 3A.2): the Windows accent (default), a preset, or
 * any color from the picker.
 */
export function AccentPicker({ item, id, disabled }: ControlProps<AccentItem>) {
  const [accent, setAccent] = useSetting(item.path);
  const [windows, setWindows] = useState<WindowsAccent | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const customRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void commands.windowsAccent().then(setWindows);
    const off = events.windowsAccentChanged.listen(({ payload }) => setWindows(payload));
    return () => void off.then((f) => f());
  }, []);

  const preset = PRESETS.find((p) => p.color === accent);
  const custom = accent !== "windows" && !preset ? accent : null;
  const caption =
    accent === "windows"
      ? windows
        ? "Windows accent color"
        : "Windows accent color (not available: using blue)"
      : (preset?.name ?? `Custom ${accent}`);

  return (
    <div className={styles.stack}>
      <div id={id} className={styles.palette} role="radiogroup" aria-label={item.label}>
        <button
          type="button"
          role="radio"
          aria-checked={accent === "windows"}
          className={`${styles.paletteSwatch} ${styles.accentWindows}`}
          style={{ background: windows?.light ?? "#1f6fe5" }}
          title="Windows accent color"
          aria-label="Windows accent color"
          disabled={disabled}
          onClick={() => setAccent("windows")}
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M2 3.5l5-.7v4.7H2zM7.8 2.7L14 2v5.5H7.8zM2 8.5h5v4.7l-5-.7zM7.8 8.5H14V14l-6.2-.8z" />
          </svg>
        </button>
        <span className={styles.accentGap} />
        {PRESETS.map((p) => (
          <button
            key={p.color}
            type="button"
            role="radio"
            aria-checked={accent === p.color}
            className={styles.paletteSwatch}
            style={{ background: p.color }}
            title={p.name}
            aria-label={p.name}
            disabled={disabled}
            onClick={() => setAccent(p.color)}
          />
        ))}
        <button
          ref={customRef}
          type="button"
          role="radio"
          aria-checked={!!custom}
          className={markup.customSwatch}
          data-custom={custom ? "" : undefined}
          style={custom ? ({ "--custom": custom } as React.CSSProperties) : undefined}
          title="Custom color"
          aria-label="Custom color"
          disabled={disabled}
          onClick={() => setEditing(custom ?? windows?.light ?? "#1f6fe5")}
        />
      </div>
      <span className={styles.help}>{caption}</span>
      {editing && (
        <AccentPopover
          color={editing}
          anchor={() => boxOf(customRef.current)}
          onDraft={setEditing}
          onDone={(keep) => {
            if (keep) setAccent(editing);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function AccentPopover({
  color,
  anchor,
  onDraft,
  onDone,
}: {
  color: string;
  anchor: () => ReturnType<typeof boxOf>;
  onDraft: (color: string) => void;
  onDone: (keep: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuPlacement(true, ref, anchor);
  // Enter or a click elsewhere keeps; Esc cancels.
  usePopover(true, ref, onDone, "keep");
  return (
    <div
      ref={ref}
      className={`${markup.menu} ${markup.colorMenu}`}
      role="dialog"
      aria-label="Custom accent color"
    >
      <ColorPicker value={color} onChange={onDraft} />
      <div className={markup.colorActions}>
        <span className={markup.spacer} />
        <button type="button" className={markup.ghostButton} onClick={() => onDone(false)}>
          Cancel
        </button>
        <button type="button" className={markup.accentButton} onClick={() => onDone(true)}>
          Done
        </button>
      </div>
    </div>
  );
}
