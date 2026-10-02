import { ColorControls } from "./ColorControls";
import { hint } from "./HintLine";
import { useRef, type ReactNode } from "react";
import { Dropdown } from "./Dropdown";
import { useDoc } from "./model/store";
import { FontPickerControl } from "./FontPickerControl";
import type {
  ArrowHead,
  CalloutEnd,
  CalloutShape,
  RedactMode,
  ShapeFill,
  SpotlightShape,
  TextAlign,
} from "./model/types";
import { NumberPickerControl } from "./NumberPickerControl";
import {
  BLOCK_SIZE_ICON,
  BLUR_RADIUS_ICON,
  CORNER_ICON,
  DARKNESS_ICON,
  LINE_WIDTH_ICON,
  TEXT_SIZE_ICON,
} from "./pickerIcons";
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
    id: "solid",
    label: "Solid",
    icon: <rect x="4" y="4" width="16" height="16" className={styles.solid} />,
  },
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

/** A callout's shapes (PLAN 3E.3, 3E.11). */
// Each with its pointer down to the right (Richard's mockup); the text is left off.
const CALLOUT_SHAPES: { id: CalloutShape; label: string; icon: ReactNode }[] = [
  {
    id: "outline",
    label: "Outlined box",
    icon: (
      <>
        <rect x="2.5" y="3" width="12" height="8" rx="2" />
        <path d="M9 11l9.5 9.5M14 20.5h4.5V16" />
      </>
    ),
  },
  {
    id: "box",
    label: "Filled box",
    icon: (
      <>
        <rect x="2.5" y="3" width="12" height="8" rx="2" className={styles.solid} />
        <path d="M9 11l9.5 9.5M14 20.5h4.5V16" />
      </>
    ),
  },
  {
    id: "underline",
    label: "Underline",
    icon: <path d="M2 7h11l8 8M16.5 15H21v-4.5" />,
  },
];

/** A callout pointer's ends (PLAN 3E.2), pointing up and to the right like the tool's own. */
const POINTER_ENDS: { id: CalloutEnd; label: string; icon: ReactNode }[] = [
  { id: "line", label: "Plain end", icon: <path d="M4 20L19 5" /> },
  {
    id: "arrow",
    label: "Arrow",
    icon: (
      <>
        <path d="M4 20l11-11" />
        <path d="M20 4l-2.5 8.5-6-6z" className={styles.solid} />
      </>
    ),
  },
  {
    id: "dot",
    label: "Dot",
    icon: (
      <>
        <path d="M4 20l12-12" />
        <circle cx="17" cy="7" r="3.5" className={styles.solid} />
      </>
    ),
  },
];

/**
 * The options for what's being drawn or selected (mockup: ToolOptions):
 * colors, line width, fill and arrow head. Shared by quick edit and the editor.
 * `compact`: quick edit's bar, where a callout's text styling always starts a
 * new line.
 */
export function ToolOptions({ compact = false }: { compact?: boolean }) {
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
  const strengthPicker = values.redact && strengthPickerFor(values.redact.mode, config);
  const text = values.text;
  const step = show.step ? values.step : null;
  // Rectangles, after the width, and rectangular spotlights, after the shape (PLAN 3D.17).
  // A callout's digits are its text size, Shift+digits its thickness and
  // Alt+digits its font (PLAN 3E), so its corners have no key.
  const callout = show.callout;
  const corner = show.corner && values.corner !== null && (
    <span className={styles.hintArea} {...hint(callout ? "corner.callout" : "corner")}>
      <NumberPickerControl
        icon={CORNER_ICON}
        iconAlways
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

  const colors = <ColorControls target={target} values={values} show={show} held={held} />;
  // Text's font and size, and its bold, italic and alignment.
  const textPickers = text && (
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
      <span className={styles.hintArea} {...hint(callout ? "callout.size" : "size")}>
        <NumberPickerControl
          icon={TEXT_SIZE_ICON}
          picker={config.styles.fontSize}
          value={text.fontSize}
          unit="pt"
          label="Text size"
          showKeys={hints && held.digit && !held.shiftDigit}
          hints={hints}
          onPick={(fontSize) => applyStyle({ fontSize })}
          onDragStart={beginStyleDrag}
          onDragEnd={endStyleDrag}
        />
      </span>
    </div>
  );
  const textStyle = text && (
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
  );

  // A callout: shape and end, thickness and corners, then its text (Richard's order).
  const shapeAndWidth = (
    <>
      {callout && values.callout && (
        <div className={styles.section}>
          <div className={styles.group} {...hint("callout.shape")}>
            {CALLOUT_SHAPES.map((sh) => (
              <button
                key={sh.id}
                type="button"
                className={styles.toggle}
                aria-pressed={values.callout?.shape === sh.id}
                aria-label={sh.label}
                title={sh.label}
                onClick={() => applyStyle({ calloutShape: sh.id })}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  {sh.icon}
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
      {callout && values.callout && (
        <div className={styles.section}>
          <div className={styles.group} {...hint("callout.end")}>
            {POINTER_ENDS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={styles.toggle}
                aria-pressed={values.callout?.end === e.id}
                aria-label={e.label}
                title={e.label}
                onClick={() => applyStyle({ pointerEnd: e.id })}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  {e.icon}
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {show.width && values.width !== null && (
        <div className={styles.section}>
          <span className={styles.hintArea} {...hint(callout ? "callout.width" : "width")}>
            <NumberPickerControl
              icon={LINE_WIDTH_ICON}
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
    </>
  );
  // In quick edit a callout's text styling always starts a second line, and
  // the bar is only as wide as its wider line (one long row felt
  // overwhelming there). A wrapping row is sized as if it were one line, so
  // the lines are stacked instead.
  const stacked = compact && callout && show.text;

  return (
    // Clicks here must not take focus: text being typed keeps it, and Space
    // keeps panning instead of pressing a button.
    <div
      ref={rootRef}
      className={`${styles.options} ${stacked ? styles.stacked : ""}`}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {stacked ? <div className={styles.stackedLine}>{shapeAndWidth}</div> : shapeAndWidth}

      {show.text &&
        (callout ? (
          // A callout's styling (text, then colors) wraps to the next line as
          // one, under its shape controls (Richard: it looks more organized).
          // In quick edit it always does (see `stacked`).
          <div className={`${styles.section} ${styles.run}`}>
            {textPickers}
            {textStyle}
            {show.color && colors}
          </div>
        ) : (
          textPickers
        ))}

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
          <span className={styles.hintArea} {...hint("dim")}>
            <NumberPickerControl
              icon={DARKNESS_ICON}
              iconAlways
              picker={config.styles.spotlight}
              value={values.spotlight.dim}
              unit="%"
              label="Darkness outside"
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
          {strengthPicker && (
            <span className={styles.hintArea} {...hint("strength")}>
              <NumberPickerControl
                icon={values.redact.mode === "pixelate" ? BLOCK_SIZE_ICON : BLUR_RADIUS_ICON}
                picker={strengthPicker}
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
          )}
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

      {show.text && !callout && textStyle}

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

      {show.color && !callout && colors}
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
