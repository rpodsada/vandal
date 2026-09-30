import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CustomColor } from "./CustomColor";
import { Dropdown } from "./Dropdown";
import { hint } from "./HintLine";
import type { ControlHint } from "./hints";
import { PresetEditor } from "./PresetEditor";
import { slotKey } from "./pickers";
import {
  applyStyle,
  colorSlots,
  swapColors,
  type ColorSlot,
  type ColorSlots,
  type StyleTarget,
  type TargetValues,
  type targetSections,
} from "./restyle";
import { contrastingText } from "./steps";
import { colorControlFor, paletteFor, useStyleConfig, type ColorSlotPosition } from "./styles";
import { useToolStore, type ToolId } from "./toolStore";
import type { HeldKeys } from "./useHeldKeys";
import styles from "./options.module.css";

/** The "A" on the text color's circle, in its 20-unit viewBox. */
const LETTER_SIZE = 12;

interface Props {
  target: StyleTarget;
  values: TargetValues;
  show: ReturnType<typeof targetSections>;
  held: HeldKeys;
}

/**
 * The colors in the options bar: the palette as swatches, with the two-color
 * chip when there are two (PLAN 3D.14), or a dropdown button per color
 * (PLAN 3D.16), by `styles.colorControl` and the tool's own choice.
 */
export function ColorControls({ target, values, show, held }: Props) {
  const config = useStyleConfig();
  const colorSlot = useToolStore((s) => s.colorSlot);
  const hints = config.showShortcutHints;
  const palette = paletteFor(target.tool, config);
  const slots = colorSlots(values, show);
  const { second } = slots;
  const labels = show.step
    ? ["Label color", "Marker color"]
    : show.callout
      ? [
          "Text color",
          { box: "Callout color", outline: "Outline color", underline: "Line color" }[
            values.callout?.shape ?? "box"
          ],
        ]
      : show.text
        ? ["Text color", "Box color"]
        : ["Fill color", "Border color"];
  const badges = hints && held.ctrl;
  const pick = (slot: ColorSlot) => (c: string) => applyStyle({ [slot.key]: c });

  if (colorControlFor(target.tool, config) === "dropdown") {
    return (
      <div className={`${styles.section} ${styles.colorButtons}`}>
        <ColorMenu
          tool={target.tool}
          palette={palette}
          slot={slots.first}
          position="first"
          face={<ColorDot slots={slots} position="first" />}
          label={second ? labels[0] : "Color"}
          shortcut="Ctrl+1…0"
          hintId="colorMenu"
          hints={hints}
          badges={badges}
          onPick={pick(slots.first)}
        />
        {second && (
          <>
            <ColorMenu
              tool={target.tool}
              palette={palette}
              slot={second}
              position="second"
              face={<ColorDot slots={slots} position="second" />}
              label={labels[1]}
              shortcut="Ctrl+Shift+1…0"
              hintId="colorMenu.second"
              hints={hints}
              badges={badges}
              onPick={pick(second)}
            />
            {/* After both, so the two colors sit side by side. */}
            <SwapButton hints={hints} horizontal />
          </>
        )}
      </div>
    );
  }

  // Swatches: with two colors, the chip picks which one they set.
  const editingSecond = !!second && colorSlot === "second";
  const active = second && editingSecond ? second : slots.first;
  const [chipHint, swatchHint] = show.step
    ? (["chip.label", "swatch.label"] as const)
    : show.callout
      ? (["chip.callout", "swatch.callout"] as const)
      : show.text
        ? (["chip.box", "swatch.box"] as const)
        : (["chip.fill", "swatch.fill"] as const);
  const setSlot = (slot: ColorSlotPosition) => useToolStore.setState({ colorSlot: slot });
  return (
    // Last in the bar, so the chip appearing (border + fill, text box) moves
    // nothing else from under the pointer.
    <div className={`${styles.section} ${styles.swatches}`}>
      {second && (
        <div className={styles.chip} {...hint(chipHint)}>
          <button
            type="button"
            className={`${styles.chipDot} ${styles.chipFirst}`}
            style={dotStyle(slots, "first")}
            data-hollow={isHollow(slots, "first") || undefined}
            aria-pressed={!editingSecond}
            aria-label={labels[0]}
            title={`${labels[0]}${hints ? " (Ctrl+1…0)" : ""}`}
            onClick={() => setSlot("first")}
          >
            <DotLetter slots={slots} position="first" />
          </button>
          <button
            type="button"
            className={`${styles.chipDot} ${styles.chipSecond}`}
            style={dotStyle(slots, "second")}
            data-hollow={isHollow(slots, "second") || undefined}
            aria-pressed={editingSecond}
            aria-label={labels[1]}
            title={`${labels[1]}${hints ? " (Shift+click a color, Ctrl+Shift+1…0)" : ""}`}
            onClick={() => setSlot("second")}
          />
          <SwapButton hints={hints} className={styles.chipSwap} />
        </div>
      )}
      <SwatchRow
        tool={target.tool}
        palette={palette}
        slot={active}
        position={editingSecond ? "second" : "first"}
        hintId={second ? swatchHint : "swatch"}
        hints={hints}
        badges={badges}
        // Shift+click sets the second color without switching the chip.
        onPick={(c, shift) => applyStyle({ [(shift && second ? second : active).key]: c })}
      />
    </div>
  );
}

/** The chip's circles and the dropdown buttons draw each color the same way. */
function isHollow(slots: ColorSlots, position: ColorSlotPosition): boolean {
  // A shape's border is a ring, like the outline it draws, and so are a
  // callout's outline and underline.
  return position === "second" && (slots.kind === "shape" || !!slots.secondIsLine);
}

function dotStyle(slots: ColorSlots, position: ColorSlotPosition): CSSProperties {
  const slot = position === "first" ? slots.first : slots.second;
  if (!slot) return {};
  return isHollow(slots, position)
    ? { borderColor: slot.value, background: "transparent" }
    : { background: slot.value };
}

/**
 * Text's color (text, a step marker's label) carries an "A", black or white
 * to read on it. SVG text so the capital itself is centred: CSS centres the
 * line box, which leaves room for descenders an "A" hasn't got.
 */
function DotLetter({ slots, position }: { slots: ColorSlots; position: ColorSlotPosition }) {
  if (slots.kind !== "text" || position !== "first") return null;
  return (
    <svg
      className={styles.chipLetter}
      viewBox="0 0 20 20"
      aria-hidden
      style={{ color: contrastingText(slots.first.value) }}
    >
      {/* Baseline: the middle plus half a cap height (0.7 em). */}
      <text x="10" fontSize={LETTER_SIZE} y={10 + (0.7 * LETTER_SIZE) / 2} textAnchor="middle">
        A
      </text>
    </svg>
  );
}

/** One color as a circle, for a dropdown button. */
function ColorDot({ slots, position }: { slots: ColorSlots; position: ColorSlotPosition }) {
  return (
    <span
      className={styles.colorDot}
      style={dotStyle(slots, position)}
      data-hollow={isHollow(slots, position) || undefined}
    >
      <DotLetter slots={slots} position={position} />
    </span>
  );
}

/**
 * Swaps the two colors (PLAN 3D.15): a curved arrow at the chip's corner,
 * or two opposed arrows after the dropdowns (`horizontal`).
 */
function SwapButton({
  hints,
  className,
  horizontal = false,
}: {
  hints: boolean;
  className?: string;
  horizontal?: boolean;
}) {
  return (
    <button
      type="button"
      className={className ?? styles.swapButton}
      {...hint("chip.swap")}
      aria-label="Swap colors"
      title={`Swap colors${hints ? " (X)" : ""}`}
      onClick={() => swapColors()}
    >
      {horizontal ? (
        <svg viewBox="0 0 12 12" aria-hidden>
          <path d="M1.5 4h9M8.5 2l2 2-2 2" />
          <path d="M10.5 8.5h-9M3.5 6.5l-2 2 2 2" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" aria-hidden>
          <path d="M3 3.5h3.5a3 3 0 0 1 3 3V9" />
          <path d="M5 1.5l-2 2 2 2M7.5 7l2 2 2-2" />
        </svg>
      )}
    </button>
  );
}

/** A preset being changed (right-click on a swatch): its draft color and where it sits. */
interface PresetEdit {
  tool: ToolId;
  index: number;
  color: string;
  /** The swatch's offset in the swatch row, to put the editor under it. */
  left: number;
}

interface RowProps {
  tool: ToolId;
  palette: string[];
  /** The color the swatches set. */
  slot: ColorSlot;
  position: ColorSlotPosition;
  hintId: ControlHint;
  hints: boolean;
  /** Slot-number badges (Ctrl is held). */
  badges: boolean;
  /** `custom`: from the custom color's picker, live as it's dragged. */
  onPick: (color: string, shift: boolean, custom: boolean) => void;
  /** Start editing the color in use: its preset, or the custom color. */
  editCurrent?: boolean;
}

/**
 * The presets, then the custom swatch (PLAN 2A.6c). Right-click a preset to
 * change or delete it.
 */
function SwatchRow({
  tool,
  palette,
  slot,
  position,
  hintId,
  hints,
  badges,
  onPick,
  editCurrent = false,
}: RowProps) {
  const [presetEdit, setPresetEdit] = useState<PresetEdit | null>(null);
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inUse = palette.findIndex((c) => c.toLowerCase() === slot.value.toLowerCase());
  useEffect(() => {
    // The custom color opens its own picker (startOpen below).
    if (!editCurrent || inUse < 0) return;
    const left = swatchRefs.current[inUse]?.offsetLeft ?? 0;
    setPresetEdit({ tool, index: inUse, color: palette[inUse], left });
    // Once, when the row is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Only while that tool's palette is on show and the preset still exists.
  const edit = presetEdit?.tool === tool && presetEdit.index < palette.length ? presetEdit : null;
  const current = slot.value.toLowerCase();
  return (
    <>
      {palette.map((preset, i) => {
        // The preset being edited shows its draft, and is the only one ringed.
        const editingThis = edit?.index === i;
        const c = editingThis ? edit.color : preset;
        return (
          <button
            key={i}
            ref={(el) => {
              swatchRefs.current[i] = el;
            }}
            type="button"
            className={styles.swatch}
            {...hint(hintId)}
            style={{ background: c }}
            aria-pressed={edit ? editingThis : c.toLowerCase() === current}
            aria-label={`Color ${i + 1}`}
            title={`Color ${i + 1}${hints ? ` (Ctrl+${slotKey(i)})` : ""}`}
            onClick={(e) => onPick(c, e.shiftKey, false)}
            onContextMenu={(e) => {
              e.preventDefault();
              setPresetEdit({ tool, index: i, color: preset, left: e.currentTarget.offsetLeft });
            }}
          >
            {badges && <span className={styles.badge}>{slotKey(i)}</span>}
          </button>
        );
      })}
      {edit && (
        <PresetEditor
          palette={palette}
          index={edit.index}
          tool={tool}
          color={edit.color}
          left={edit.left}
          onChange={(color) => setPresetEdit({ ...edit, color })}
          onClose={() => setPresetEdit(null)}
        />
      )}
      <CustomColor
        value={current}
        slot={position}
        colorKey={slot.key}
        palette={palette}
        selected={edit ? false : undefined}
        tool={tool}
        onPick={(c) => onPick(c, false, true)}
        startOpen={editCurrent && inUse < 0}
      />
    </>
  );
}

/**
 * Dropdown mode (PLAN 3D.16): a button showing one color, opening the
 * palette. Picking a preset closes it; the custom color's picker opens
 * inside it.
 */
function ColorMenu({
  tool,
  palette,
  slot,
  position,
  face,
  label,
  shortcut,
  hintId,
  hints,
  badges,
  onPick,
}: {
  tool: ToolId;
  palette: string[];
  slot: ColorSlot;
  position: ColorSlotPosition;
  face: ReactNode;
  label: string;
  shortcut: string;
  hintId: ControlHint;
  hints: boolean;
  badges: boolean;
  onPick: (color: string) => void;
}) {
  return (
    <span className={styles.hintArea} {...hint(hintId)}>
      <Dropdown
        className={styles.colorButton}
        menuClassName={styles.colorGridMenu}
        title={`${label}${hints ? ` (${shortcut})` : ""}`}
        button={face}
        rightClickOpens
      >
        {(close, byRightClick) => (
          <div className={`${styles.swatches} ${styles.swatchGrid}`}>
            <SwatchRow
              tool={tool}
              palette={palette}
              slot={slot}
              position={position}
              hintId="swatch"
              hints={hints}
              badges={badges}
              editCurrent={byRightClick}
              onPick={(c, _shift, custom) => {
                onPick(c);
                // A preset is a choice made; the picker stays open while it's used.
                if (!custom) close();
              }}
            />
          </div>
        )}
      </Dropdown>
    </span>
  );
}
