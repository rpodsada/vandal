import { CustomColor } from "./CustomColor";
import { hint } from "./HintLine";
import { useRef, useState, type ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { useDoc } from "./model/store";
import { FontPickerControl } from "./FontPickerControl";
import type { ArrowHead, RedactMode, ShapeFill, SpotlightShape, TextAlign } from "./model/types";
import { NumberPickerControl } from "./NumberPickerControl";
import { PresetEditor } from "./PresetEditor";
import { StepOptions } from "./StepOptions";
import { slotKey } from "./pickers";
import {
  applyStyle,
  beginStyleDrag,
  endStyleDrag,
  styleTarget,
  targetSections,
  targetValues,
} from "./restyle";
import {
  fontChoices,
  paletteFor,
  strengthPickerFor,
  useStyleConfig,
  widthPickerFor,
} from "./styles";
import { useToolStore, type ToolId } from "./toolStore";
import { useHeldKeys } from "./useHeldKeys";
import { useLineStarts } from "./useLineStarts";
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

const REDACT_MODES: { id: RedactMode; label: string; icon: ReactNode }[] = [
  {
    id: "pixelate",
    label: "Pixelate",
    icon: (
      <>
        <path
          d="M4 4h5.3v5.3H4zM14.7 4H20v5.3h-5.3zM9.3 9.3h5.4v5.4H9.3zM4 14.7h5.3V20H4zM14.7 14.7H20V20h-5.3z"
          className={styles.solid}
        />
        <rect x="4" y="4" width="16" height="16" />
      </>
    ),
  },
  {
    id: "blur",
    label: "Blur",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" className={styles.tint} />
        <circle cx="12" cy="12" r="4.5" className={styles.solid} opacity="0.6" />
      </>
    ),
  },
];

const SPOTLIGHT_SHAPES: { id: SpotlightShape; label: string; icon: ReactNode }[] = [
  { id: "rect", label: "Rectangle", icon: <rect x="4" y="6" width="16" height="12" rx="1" /> },
  { id: "ellipse", label: "Ellipse", icon: <ellipse cx="12" cy="12" rx="8" ry="6" /> },
];

/**
 * The options for what's being drawn or selected (mockup: ToolOptions):
 * colors, line width, fill and arrow head. Shared by quick edit and the editor.
 */
/** A preset being changed (right-click on a swatch): its draft color and where it sits. */
interface PresetEdit {
  tool: ToolId;
  index: number;
  color: string;
  /** The swatch's offset in the swatch row, to put the editor under it. */
  left: number;
}

export function ToolOptions() {
  const doc = useDoc((s) => s.doc);
  const selection = useDoc((s) => s.selection);
  const tool = useToolStore((s) => s.tool);
  const editing = useToolStore((s) => s.editing?.id ?? null);
  // The groups wrap to more rows when the bar is narrow (PLAN 2C).
  const rootRef = useRef<HTMLDivElement>(null);
  useLineStarts(rootRef);
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
  useToolStore((s) => s.redactMode);
  useToolStore((s) => s.redactStrengths);
  useToolStore((s) => s.spotlightShape);
  useToolStore((s) => s.spotlightDim);
  useToolStore((s) => s.stepShape);
  useToolStore((s) => s.stepSize);
  useToolStore((s) => s.stepTextColor);
  useToolStore((s) => s.stepFormat);
  useToolStore((s) => s.stepStart);
  const config = useStyleConfig();
  const held = useHeldKeys();
  // The preset being edited (right-click on a swatch).
  const [presetEdit, setPresetEdit] = useState<PresetEdit | null>(null);
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
  const step = show.step ? values.step : null;
  // With border + fill, text on a box, or a step marker, the chip picks which
  // color the swatches set. A step marker's label comes first, like text's.
  const twoColors =
    (show.fill && values.fill === "both") || (show.text && !!text?.background) || !!step;
  const firstColor = step ? step.textColor : values.color;
  const secondColor =
    (step ? step.color : show.text ? text?.backgroundColor : values.fillColor) ?? values.color;
  const editingFill = twoColors && colorSlot === "fill";
  const current = (editingFill ? secondColor : firstColor).toLowerCase();
  // Only while that tool's palette is on show and the preset still exists.
  const edit =
    presetEdit?.tool === target.tool && presetEdit.index < palette.length ? presetEdit : null;
  const pickColor = (c: string, toSecond: boolean) =>
    applyStyle(
      step
        ? toSecond
          ? { color: c }
          : { textColor: c }
        : !(toSecond && twoColors)
          ? { color: c }
          : show.text
            ? { backgroundColor: c }
            : { fillColor: c },
    );
  const labels = step
    ? ["Label color", "Marker color"]
    : show.text
      ? ["Text color", "Box color"]
      : ["Border color", "Fill color"];
  const colorHints = step
    ? (["chip.label", "swatch.label"] as const)
    : show.text
      ? (["chip.box", "swatch.box"] as const)
      : (["chip.fill", "swatch.fill"] as const);
  const setSlot = (slot: "border" | "fill") => useToolStore.setState({ colorSlot: slot });

  return (
    // Clicks here must not take focus: text being typed keeps it, and Space
    // keeps panning instead of pressing a button.
    <div
      ref={rootRef}
      className={styles.options}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {show.text && text && (
        <div className={styles.section}>
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
        </div>
      )}

      {show.width && values.width !== null && (
        <div className={styles.section}>
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
        </div>
      )}

      {step && <StepOptions step={step} hints={hints} showKeys={hints && held.digit} />}

      {show.spotlight && values.spotlight && (
        <div className={styles.section}>
          <div className={styles.group} {...hint("spotlight.shape")}>
            {SPOTLIGHT_SHAPES.map((sh) => (
              <button
                key={sh.id}
                type="button"
                className={styles.toggle}
                aria-pressed={values.spotlight?.shape === sh.id}
                aria-label={sh.label}
                title={sh.label}
                onClick={() => applyStyle({ spotlightShape: sh.id })}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  {sh.icon}
                </svg>
              </button>
            ))}
          </div>
          <span className={styles.hintArea} {...hint("dim")}>
            <NumberPickerControl
              picker={config.styles.spotlight}
              value={values.spotlight.dim}
              unit="%"
              label="Darkness"
              showKeys={hints && held.digit}
              hints={hints}
              onPick={(dim) => applyStyle({ dim })}
              onDragStart={beginStyleDrag}
              onDragEnd={endStyleDrag}
            />
          </span>
        </div>
      )}

      {show.redact && values.redact && (
        <div className={styles.section}>
          <div className={styles.group} {...hint("redact.mode")}>
            {REDACT_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`${styles.toggle} ${styles.labelled}`}
                aria-pressed={values.redact?.mode === m.id}
                title={m.label}
                onClick={() => applyStyle({ redactMode: m.id })}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  {m.icon}
                </svg>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
          <span className={styles.hintArea} {...hint("strength")}>
            <NumberPickerControl
              picker={strengthPickerFor(values.redact.mode, config)}
              value={values.redact.strength}
              unit="px"
              label={values.redact.mode === "pixelate" ? "Block size" : "Blur radius"}
              showKeys={hints && held.digit}
              hints={hints}
              onPick={(strength) => applyStyle({ strength })}
              onDragStart={beginStyleDrag}
              onDragEnd={endStyleDrag}
            />
          </span>
        </div>
      )}

      {show.fill && values.fill !== null && (
        <div className={styles.section}>
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
        </div>
      )}

      {show.text && text && (
        <>
          <div className={styles.section}>
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
          </div>
          <div className={styles.section}>
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
          </div>
        </>
      )}

      {show.head && values.head !== null && (
        <div className={styles.section}>
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
        </div>
      )}

      {/* Last, so the chip appearing (border + fill, text box) moves nothing
          else from under the pointer. */}
      {show.color && (
        <div className={`${styles.section} ${styles.swatches}`}>
          {twoColors && (
            <div className={styles.chip} {...hint(colorHints[0])}>
              <button
                type="button"
                className={styles.chipBorder}
                style={{ borderColor: firstColor }}
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
          {palette.map((preset, i) => {
            // The preset being edited shows its draft, and is the only one ringed.
            const editingThis = edit?.index === i;
            const c = editingThis ? edit.color : preset;
            return (
              <button
                key={i}
                type="button"
                className={styles.swatch}
                {...hint(twoColors ? colorHints[1] : "swatch")}
                style={{ background: c }}
                aria-pressed={edit ? editingThis : c.toLowerCase() === current}
                aria-label={`Color ${i + 1}`}
                title={`Color ${i + 1}${hints ? ` (Ctrl+${slotKey(i)})` : ""}`}
                // Shift+click sets the fill without switching the chip.
                onClick={(e) => pickColor(c, e.shiftKey || editingFill)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setPresetEdit({
                    tool: target.tool,
                    index: i,
                    color: preset,
                    left: e.currentTarget.offsetLeft,
                  });
                }}
              >
                {hints && held.ctrl && <span className={styles.badge}>{slotKey(i)}</span>}
              </button>
            );
          })}
          {edit && (
            <PresetEditor
              palette={palette}
              index={edit.index}
              tool={target.tool}
              color={edit.color}
              left={edit.left}
              onChange={(color) => setPresetEdit({ ...edit, color })}
              onClose={() => setPresetEdit(null)}
            />
          )}
          <CustomColor
            value={current}
            palette={palette}
            selected={edit ? false : undefined}
            tool={target.tool}
            onPick={(c) => pickColor(c, editingFill)}
          />
        </div>
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
