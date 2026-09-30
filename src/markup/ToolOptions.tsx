import { ColorControls } from "./ColorControls";
import { hint } from "./HintLine";
import { useRef, type ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { useDoc } from "./model/store";
import { FontPickerControl } from "./FontPickerControl";
import type { ArrowHead, RedactMode, ShapeFill, SpotlightShape, TextAlign } from "./model/types";
import { NumberPickerControl } from "./NumberPickerControl";
import { StepOptions } from "./StepOptions";
import {
  applyStyle,
  beginStyleDrag,
  endStyleDrag,
  styleTarget,
  targetSections,
  targetValues,
} from "./restyle";
import { fontChoices, strengthPickerFor, useStyleConfig, widthPickerFor } from "./styles";
import { useToolStore } from "./toolStore";
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
export function ToolOptions() {
  const doc = useDoc((s) => s.doc);
  const selection = useDoc((s) => s.selection);
  const tool = useToolStore((s) => s.tool);
  const editing = useToolStore((s) => s.editing?.id ?? null);
  // The groups wrap to more rows when the bar is narrow (PLAN 2C).
  const rootRef = useRef<HTMLDivElement>(null);
  useLineStarts(rootRef);
  // Re-render when a tool's remembered style changes: the whole store, so a
  // new remembered style can't be missed (the step font and the corner radii
  // once were, and their pickers didn't follow).
  useToolStore();
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
  const widthPicker = widthPickerFor(target.tool, config);
  const text = values.text;
  const step = show.step ? values.step : null;
  // Rectangles, after the width, and rectangular spotlights, after the shape (PLAN 3D.17).
  // A callout's digits are its text size, Shift+digits its thickness and
  // Alt+digits its font (PLAN 3E), so its corners have no key.
  const callout = show.callout;
  const corner = show.corner && values.corner !== null && (
    <span
      className={styles.iconPicker}
      {...hint(callout ? "corner.callout" : "corner")}
      title="Corner radius"
    >
      {/* A rounded corner with an arrow pushing it in from outside (Richard's
          idea), so it doesn't read as another shape button. */}
      <svg className={`${styles.pickerIcon} ${styles.cornerIcon}`} viewBox="0 0 16 16" aria-hidden>
        <path d="M5 15.5a10.5 10.5 0 0 1 10.5-10.5" />
        <path d="M1.5 1.5l5.3 5.3M6.8 3.3v3.5H3.3" />
      </svg>
      <NumberPickerControl
        picker={config.styles.cornerRadius}
        value={values.corner}
        unit="px"
        label="Corner radius"
        showKeys={hints && held.alt && !callout}
        hints={hints}
        onPick={(cornerRadius) => applyStyle({ cornerRadius })}
        onDragStart={beginStyleDrag}
        onDragEnd={endStyleDrag}
      />
    </span>
  );

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
          <span
            className={callout ? styles.iconPicker : styles.hintArea}
            {...hint(callout ? "callout.size" : "size")}
            title={callout ? "Text size" : undefined}
          >
            {callout && (
              // A small and a large A.
              <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
                <path d="M1 13l2.5-6 2.5 6M1.9 11h3.2" />
                <path d="M7.5 13l3.5-10 3.5 10M8.8 9.7h4.4" />
              </svg>
            )}
            <NumberPickerControl
              picker={config.styles.fontSize}
              value={text.fontSize}
              unit="pt"
              label={callout ? "Text size" : "Size"}
              showKeys={hints && held.digit && !held.shiftDigit}
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
          <span
            className={callout ? styles.iconPicker : styles.hintArea}
            {...hint(callout ? "callout.width" : "width")}
            title={callout ? "Pointer thickness" : undefined}
          >
            {callout && (
              // Lines getting thicker.
              <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
                <path d="M2 3.5h12" strokeWidth="1" />
                <path d="M2 7.5h12" strokeWidth="2" />
                <path d="M2 12.5h12" strokeWidth="3" />
              </svg>
            )}
            <NumberPickerControl
              picker={widthPicker}
              value={values.width}
              unit="px"
              label={callout ? "Pointer thickness" : "Line width"}
              lines
              showKeys={hints && held.digit && (callout ? held.shiftDigit : !held.shiftDigit)}
              hints={hints}
              onPick={(width) => applyStyle({ width })}
              onDragStart={beginStyleDrag}
              onDragEnd={endStyleDrag}
            />
          </span>
          {corner}
        </div>
      )}

      {step && (
        <StepOptions
          step={step}
          hints={hints}
          showKeys={hints && held.digit}
          showFontKeys={hints && held.alt}
        />
      )}

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
          {corner}
          <span className={styles.iconPicker} {...hint("dim")} title="Darkness outside">
            {/* Half light, half dark. */}
            <svg className={styles.pickerIcon} viewBox="0 0 16 16" aria-hidden>
              <circle cx="8" cy="8" r="5.5" />
              <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" className={styles.solid} />
            </svg>
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
              {show.textBox && (
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
              )}
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

      {show.color && <ColorControls target={target} values={values} show={show} held={held} />}
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
