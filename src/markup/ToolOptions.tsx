import { hint } from "./HintLine";
import type { ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { useDoc } from "./model/store";
import { FontPickerControl } from "./FontPickerControl";
import type { ArrowHead, ShapeFill, TextAlign } from "./model/types";
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
import { fontChoices, paletteFor, useStyleConfig, widthPickerFor } from "./styles";
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

const ALIGNS: { id: TextAlign; label: string; path: string }[] = [
  { id: "left", label: "Align left", path: "M4 6h16M4 10h10M4 14h16M4 18h10" },
  { id: "center", label: "Align center", path: "M4 6h16M7 10h10M4 14h16M7 18h10" },
  { id: "right", label: "Align right", path: "M4 6h16M10 10h10M4 14h16M10 18h10" },
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
  useToolStore((s) => s.fontFamily);
  useToolStore((s) => s.fontSize);
  useToolStore((s) => s.textAlign);
  useToolStore((s) => s.textBold);
  useToolStore((s) => s.textItalic);
  useToolStore((s) => s.textBackground);
  useToolStore((s) => s.textBackgroundColor);
  const config = useStyleConfig();
  const held = useHeldKeys();
  const hints = config.showShortcutHints;

  const target = styleTarget(doc, selection, tool, editing);
  if (!target) {
    // Nothing to style: the status bar's hint line says what to do.
    return <div className={styles.options} />;
  }

  const values = targetValues(target, doc);
  const show = targetSections(target);
  const palette = paletteFor(target.tool, config);
  const widthPicker = widthPickerFor(target.tool, config);
  const text = values.text;
  // With border + fill, or text on a box, the chip picks which color the
  // swatches set.
  const twoColors = (show.fill && values.fill === "both") || (show.text && !!text?.background);
  const secondColor = (show.text ? text?.backgroundColor : values.fillColor) ?? values.color;
  const editingFill = twoColors && colorSlot === "fill";
  const current = (editingFill ? secondColor : values.color).toLowerCase();
  const pickColor = (c: string, toSecond: boolean) =>
    applyStyle(
      !(toSecond && twoColors)
        ? { color: c }
        : show.text
          ? { backgroundColor: c }
          : { fillColor: c },
    );
  const labels = show.text ? ["Text color", "Box color"] : ["Border color", "Fill color"];
  const setSlot = (slot: "border" | "fill") => useToolStore.setState({ colorSlot: slot });

  return (
    // Clicks here must not take focus: text being typed keeps it, and Space
    // keeps panning instead of pressing a button.
    <div
      className={styles.options}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {show.text && text && (
        <>
          <span className={styles.hintArea} {...hint("font")}>
            <FontPickerControl
              picker={config.styles.font}
              fonts={fontChoices(config)}
              value={text.fontFamily}
              showKeys={hints && held.alt}
              hints={hints}
              onPick={(fontFamily) => applyStyle({ fontFamily })}
            />
          </span>
          <span className={styles.hintArea} {...hint("size")}>
            <NumberPickerControl
              picker={config.styles.fontSize}
              value={text.fontSize}
              unit="pt"
              label="Size"
              showKeys={hints && held.digit}
              hints={hints}
              onPick={(fontSize) => applyStyle({ fontSize })}
              onDragStart={beginStyleDrag}
              onDragEnd={endStyleDrag}
            />
          </span>
        </>
      )}

      {show.width && values.width !== null && (
        <>
          <span className={styles.sep} />
          <span className={styles.hintArea} {...hint("width")}>
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
          </span>
        </>
      )}

      {show.fill && values.fill !== null && (
        <>
          <span className={styles.sep} />
          <div className={styles.group} {...hint("fill")}>
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

      {show.text && text && (
        <>
          <span className={styles.sep} />
          <div className={styles.group}>
            <button
              type="button"
              className={`${styles.toggle} ${styles.letter}`}
              aria-pressed={text.bold}
              {...hint("bold")}
              aria-label="Bold"
              title={`Bold${hints ? " (Ctrl+B)" : ""}`}
              onClick={() => applyStyle({ bold: !text.bold })}
            >
              <b>B</b>
            </button>
            <button
              type="button"
              className={`${styles.toggle} ${styles.letter}`}
              aria-pressed={text.italic}
              {...hint("italic")}
              aria-label="Italic"
              title={`Italic${hints ? " (Ctrl+I)" : ""}`}
              onClick={() => applyStyle({ italic: !text.italic })}
            >
              <i>I</i>
            </button>
          </div>
          <span className={styles.sep} />
          <div className={styles.group}>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={text.background}
              {...hint("box")}
              aria-label="Background box"
              title="Background box"
              onClick={() => applyStyle({ background: !text.background })}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" className={styles.tint} />
                <path d="M8 16l4-9 4 9M9.5 13h5" />
              </svg>
            </button>
            {ALIGNS.map((al) => (
              <button
                key={al.id}
                type="button"
                className={styles.toggle}
                aria-pressed={text.align === al.id}
                {...hint("align")}
                aria-label={al.label}
                title={al.label}
                onClick={() => applyStyle({ align: al.id })}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d={al.path} />
                </svg>
              </button>
            ))}
          </div>
        </>
      )}

      {show.head && values.head !== null && (
        <>
          <span className={styles.sep} />
          <span className={styles.hintArea} {...hint("head")}>
            <HeadPicker head={values.head} />
          </span>
          <div className={styles.group}>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={values.ends !== "both"}
              {...hint("ends.one")}
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
              {...hint("ends.both")}
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

      {/* Last, so the chip appearing (border + fill, text box) moves nothing
          else from under the pointer. */}
      <span className={styles.sep} />
      <div className={styles.swatches}>
        {twoColors && (
          <div className={styles.chip} {...hint(show.text ? "chip.box" : "chip.fill")}>
            <button
              type="button"
              className={styles.chipBorder}
              style={{ borderColor: values.color }}
              aria-pressed={!editingFill}
              aria-label={labels[0]}
              title={`${labels[0]}${hints ? " (Ctrl+1…0)" : ""}`}
              onClick={() => setSlot("border")}
            />
            <button
              type="button"
              className={styles.chipFill}
              style={{ background: secondColor }}
              aria-pressed={editingFill}
              aria-label={labels[1]}
              title={`${labels[1]}${hints ? " (Shift+click a color, Ctrl+Shift+1…0)" : ""}`}
              onClick={() => setSlot("fill")}
            />
          </div>
        )}
        {palette.map((c, i) => (
          <button
            key={c}
            type="button"
            className={styles.swatch}
            {...hint(twoColors ? (show.text ? "swatch.box" : "swatch.fill") : "swatch")}
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
