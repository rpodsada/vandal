import type { ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { useDoc } from "./model/store";
import type { ArrowHead, ShapeFill } from "./model/types";
import { NumberPickerControl } from "./NumberPickerControl";
import { slotKey } from "./pickers";
import {
  applyStyle,
  beginStyleDrag,
  endStyleDrag,
  styleTarget,
  targetSections,
  targetValues,
} from "./restyle";
import { paletteFor, useStyleConfig, widthPickerFor } from "./styles";
import { useToolStore } from "./toolStore";
import { useHeldKeys } from "./useHeldKeys";
import styles from "./options.module.css";

const HEADS: { id: ArrowHead; label: string; icon: ReactNode }[] = [
  {
    id: "filled",
    label: "Filled",
    icon: (
      <>
        <path d="M3 12h13" />
        <path d="M14 7l6 5-6 5z" className={styles.solid} />
      </>
    ),
  },
  {
    id: "open",
    label: "Open",
    icon: (
      <>
        <path d="M3 12h17" />
        <path d="M14 7l6 5-6 5" />
      </>
    ),
  },
];

const FILLS: { id: ShapeFill; label: string; icon: ReactNode }[] = [
  { id: "none", label: "Border", icon: <rect x="4" y="6" width="16" height="12" rx="1" /> },
  {
    id: "solid",
    label: "Filled",
    icon: <rect x="4" y="6" width="16" height="12" rx="1" className={styles.solid} />,
  },
  {
    id: "both",
    label: "Border and fill",
    icon: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="1" className={styles.tint} />
        <rect x="4" y="6" width="16" height="12" rx="1" />
      </>
    ),
  },
];

/**
 * The options for what's being drawn or selected (mockup: ToolOptions):
 * colors, line width, fill and arrow head. Shared by quick edit and the editor.
 */
export function ToolOptions() {
  const doc = useDoc((s) => s.doc);
  const selection = useDoc((s) => s.selection);
  const tool = useToolStore((s) => s.tool);
  const editing = useToolStore((s) => s.editing?.id ?? null);
  // Re-render when a tool's remembered style or the settings change.
  useToolStore((s) => s.sharedColor);
  useToolStore((s) => s.colors);
  useToolStore((s) => s.widths);
  useToolStore((s) => s.fills);
  useToolStore((s) => s.fillColors);
  const colorSlot = useToolStore((s) => s.colorSlot);
  useToolStore((s) => s.arrowHead);
  useToolStore((s) => s.arrowEnds);
  const config = useStyleConfig();
  const held = useHeldKeys();
  const hints = config.showShortcutHints;

  const target = styleTarget(doc, selection, tool, editing);
  if (!target) {
    return (
      <div className={styles.options}>
        <span className={styles.hint}>
          Click an object to select it · Shift+click adds · Del deletes · Ctrl+D duplicates
        </span>
      </div>
    );
  }

  const values = targetValues(target, doc);
  const show = targetSections(target);
  const palette = paletteFor(target.tool, config);
  const widthPicker = widthPickerFor(target.tool, config);
  // With border + fill, the chip picks which color the swatches set.
  const twoColors = show.fill && values.fill === "both";
  const editingFill = twoColors && colorSlot === "fill";
  const current = (editingFill ? values.fillColor! : values.color).toLowerCase();
  const pickColor = (c: string, toFill: boolean) =>
    applyStyle(toFill && twoColors ? { fillColor: c } : { color: c });
  const setSlot = (slot: "border" | "fill") => useToolStore.setState({ colorSlot: slot });

  return (
    // Clicks here must not take focus: text being typed keeps it, and Space
    // keeps panning instead of pressing a button.
    <div className={styles.options} onMouseDown={(e) => e.preventDefault()}>
      <div className={styles.swatches}>
        {twoColors && (
          <div className={styles.chip}>
            <button
              type="button"
              className={styles.chipBorder}
              style={{ borderColor: values.color }}
              aria-pressed={!editingFill}
              aria-label="Border color"
              title={`Border color${hints ? " (Ctrl+1…0)" : ""}`}
              onClick={() => setSlot("border")}
            />
            <button
              type="button"
              className={styles.chipFill}
              style={{ background: values.fillColor! }}
              aria-pressed={editingFill}
              aria-label="Fill color"
              title={`Fill color${hints ? " (Shift+click a color, Ctrl+Shift+1…0)" : ""}`}
              onClick={() => setSlot("fill")}
            />
          </div>
        )}
        {palette.map((c, i) => (
          <button
            key={c}
            type="button"
            className={styles.swatch}
            style={{ background: c }}
            aria-pressed={c.toLowerCase() === current}
            aria-label={`Color ${i + 1}`}
            title={`Color ${i + 1}${hints ? ` (Ctrl+${slotKey(i)})` : ""}`}
            // Shift+click sets the fill without switching the chip.
            onClick={(e) => pickColor(c, e.shiftKey || editingFill)}
          >
            {hints && held.ctrl && <span className={styles.badge}>{slotKey(i)}</span>}
          </button>
        ))}
      </div>

      {show.width && values.width !== null && (
        <>
          <span className={styles.sep} />
          <NumberPickerControl
            picker={widthPicker}
            value={values.width}
            unit="px"
            label="Line width"
            lines
            showKeys={hints && held.digit}
            hints={hints}
            onPick={(width) => applyStyle({ width })}
            onDragStart={beginStyleDrag}
            onDragEnd={endStyleDrag}
          />
        </>
      )}

      {show.fill && values.fill !== null && (
        <>
          <span className={styles.sep} />
          <div className={styles.group}>
            {FILLS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={styles.toggle}
                aria-pressed={values.fill === f.id}
                aria-label={f.label}
                title={f.label}
                onClick={() => applyStyle({ fill: f.id })}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  {f.icon}
                </svg>
              </button>
            ))}
          </div>
        </>
      )}

      {show.head && values.head !== null && (
        <>
          <span className={styles.sep} />
          <HeadPicker head={values.head} />
          <div className={styles.group}>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={values.ends !== "both"}
              aria-label="Head on one end"
              title={
                values.ends === "both" ? "Head on one end" : "Head on one end (click again to flip)"
              }
              // Clicking it again moves the head to the other end.
              onClick={() => applyStyle({ ends: values.ends === "end" ? "start" : "end" })}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                style={values.ends === "start" ? { transform: "scaleX(-1)" } : undefined}
              >
                <path d="M4 12h15M14 7l5 5-5 5" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={values.ends === "both"}
              aria-label="Heads on both ends"
              title="Heads on both ends"
              onClick={() => applyStyle({ ends: "both" })}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M4 12h16M15 7l5 5-5 5M9 7l-5 5 5 5" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HeadPicker({ head }: { head: ArrowHead }) {
  const current = HEADS.find((h) => h.id === head) ?? HEADS[0];
  return (
    <Dropdown
      className={styles.dropdown}
      title="Arrow head"
      button={
        <>
          <svg className={styles.headIcon} viewBox="0 0 24 24" aria-hidden>
            {current.icon}
          </svg>
          <span>{current.label}</span>
        </>
      }
    >
      {(close) =>
        HEADS.map((h) => (
          <button
            key={h.id}
            type="button"
            role="menuitemradio"
            aria-checked={h.id === head}
            className={styles.menuRow}
            onClick={() => {
              applyStyle({ head: h.id });
              close();
            }}
          >
            <svg className={styles.headIcon} viewBox="0 0 24 24" aria-hidden>
              {h.icon}
            </svg>
            <span className={styles.menuLabel}>{h.label}</span>
          </button>
        ))
      }
    </Dropdown>
  );
}
