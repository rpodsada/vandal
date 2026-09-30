import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { FontPickerControl } from "../../markup/FontPickerControl";
import { DEFAULT_FONT } from "../../markup/styles";
import { commands, type StyleSettings } from "../../shared/ipc";
import { availableFonts, MAX_STEPPED_FONTS, missingFonts } from "../fontSpec";
import { dropIndex, moveItem } from "../paletteSpec";
import type { FontPickerItem } from "../schema";
import { useSettingsStore } from "../store";
import type { ControlProps } from "./index";
import { Segmented } from "./Segmented";
import markup from "../../markup/options.module.css";
import styles from "./controls.module.css";

type FontPicker = StyleSettings["font"];

const SOURCES = [
  { value: "system", label: "All installed fonts" },
  { value: "custom", label: "Custom list" },
] as const;

/** The step markers' fonts can also follow the text tool's. */
const STEP_SOURCES = [
  { value: "system", label: "All installed fonts" },
  { value: "text", label: "Same as Text tool" },
  { value: "custom", label: "Custom list" },
] as const;

const CONTROLS = [
  { value: "dropdown", label: "Dropdown" },
  { value: "stepped", label: "Stepped slider" },
] as const;

/**
 * A tool's fonts (PLAN 2C.3): every installed font, or the user's own list
 * (kept while unused), shown as a dropdown or a stepped slider. The step
 * markers' can instead follow the text tool's (PLAN 3D.13).
 */
export function FontPickerSetting({ item, id, disabled }: ControlProps<FontPickerItem>) {
  const styleSettings = useSettingsStore((s) => s.settings!.styles);
  const picker = item.path === "styles.stepFont" ? styleSettings.stepFont : styleSettings.font;
  const set = useSettingsStore((s) => s.set);
  // The picker spec is an object, which typed leaf paths don't reach.
  const update = (next: FontPicker) => void set(item.path as never, next as never);
  const [installed, setInstalled] = useState<string[]>([]);
  useEffect(() => {
    void commands.listFonts().then(setInstalled);
  }, []);

  const followsText = picker.source === "text";
  // What the picker does: with "Same as Text tool", the text tool's picker.
  const shown = followsText ? styleSettings.font : picker;
  const custom = shown.source === "custom";
  const offered = custom ? shown.fonts : installed.length ? installed : [DEFAULT_FONT];
  const [preview, setPreview] = useState<string | null>(null);
  const previewFont = preview && offered.includes(preview) ? preview : offered[0];
  const steppedFallback =
    !followsText &&
    picker.control === "stepped" &&
    (!custom || picker.fonts.length > MAX_STEPPED_FONTS);

  return (
    <div className={styles.controlGroup}>
      <Segmented
        id={id}
        label={`${item.label}: which fonts`}
        options={item.path === "styles.stepFont" ? STEP_SOURCES : SOURCES}
        value={picker.source}
        disabled={disabled}
        onChange={(source) =>
          update({
            ...picker,
            source,
            // An empty list would mean every installed font: start it with one.
            fonts: source === "custom" && picker.fonts.length === 0 ? [DEFAULT_FONT] : picker.fonts,
          })
        }
      />
      {followsText && (
        <p className={styles.help}>The fonts and control chosen for the Text tool.</p>
      )}
      {picker.source === "custom" && (
        <FontListEditor
          installed={installed}
          fonts={picker.fonts}
          disabled={disabled}
          onChange={(fonts) => update({ ...picker, fonts })}
        />
      )}
      {!followsText && (
        <div className={styles.valueList}>
          <span className={styles.help}>Show as</span>
          <Segmented
            label={`${item.label}: control`}
            options={CONTROLS}
            value={picker.control}
            disabled={disabled}
            onChange={(control) => update({ ...picker, control })}
          />
        </div>
      )}
      {steppedFallback && (
        <p className={styles.help}>
          The stepped slider needs your own list of {MAX_STEPPED_FONTS} fonts or fewer; until then
          the dropdown is shown.
        </p>
      )}
      {/* The options bar's context, which the editor's pickers are styled for. */}
      <div className={`${styles.pickerPreview} ${markup.options}`}>
        <span className={styles.help}>Preview</span>
        <FontPickerControl
          picker={shown}
          fonts={offered}
          value={previewFont}
          showKeys={false}
          hints={false}
          onPick={setPreview}
        />
      </div>
    </div>
  );
}

interface Drag {
  from: number;
  pointerId: number;
  startY: number;
  y: number;
  centers: number[];
  moved: boolean;
  to: number;
}

/**
 * Installed fonts on the left (searchable), the user's list on the right in
 * their order. Double-click or Add moves a font across; drag, the arrow
 * buttons or Alt+↑/↓ reorder; Delete removes. The list keeps at least one.
 */
function FontListEditor({
  installed,
  fonts,
  disabled,
  onChange,
}: {
  installed: string[];
  fonts: string[];
  disabled?: boolean;
  onChange: (fonts: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const available = availableFonts(installed, fonts, query);
  const missing = missingFonts(installed, fonts);
  const selected = right !== null && right < fonts.length ? right : null;

  const add = (font: string | null) => {
    if (!font || disabled) return;
    onChange([...fonts, font]);
    setRight(fonts.length);
    // Keep a selection on the left, on the next font down.
    const i = available.indexOf(font);
    setLeft(available[i + 1] ?? available[i - 1] ?? null);
  };
  const remove = (i: number | null) => {
    if (i === null || fonts.length === 1 || disabled) return;
    onChange(fonts.filter((_, j) => j !== i));
    setRight(Math.min(i, fonts.length - 2));
  };
  const move = (i: number | null, by: number) => {
    if (i === null || disabled) return;
    const to = i + by;
    if (to < 0 || to >= fonts.length) return;
    onChange(moveItem(fonts, i, to));
    setRight(to);
  };

  const onLeftKey = (e: KeyboardEvent) => {
    const i = left ? available.indexOf(left) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        available[
          Math.max(0, Math.min(available.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))
        ];
      setLeft(next ?? null);
    }
    if (e.key === "Enter") add(left);
  };
  const onRightKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const by = e.key === "ArrowDown" ? 1 : -1;
      if (e.altKey) move(selected, by);
      else setRight(Math.max(0, Math.min(fonts.length - 1, (selected ?? -1) + by)));
    }
    if (e.key === "Delete") remove(selected);
  };

  // Dragging a row: the rows keep their DOM order and slide into place.
  const order = drag?.moved ? moveItem([...fonts.keys()], drag.from, drag.to) : null;
  const offset = (i: number) => {
    if (!drag || !order) return 0;
    if (i === drag.from) return drag.y - drag.startY;
    return drag.centers[order.indexOf(i)] - drag.centers[i];
  };
  const onPointerDown = (e: PointerEvent<HTMLLIElement>, i: number) => {
    if (e.button !== 0 || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setRight(i);
    const rows = [...(listRef.current?.children ?? [])];
    const centers = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2;
    });
    setDrag({
      from: i,
      pointerId: e.pointerId,
      startY: e.clientY,
      y: e.clientY,
      centers,
      moved: false,
      to: i,
    });
  };
  const onPointerMove = (e: PointerEvent<HTMLLIElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved || Math.abs(e.clientY - drag.startY) > 4;
    if (moved)
      setDrag({ ...drag, moved, y: e.clientY, to: dropIndex(drag.centers, drag.from, e.clientY) });
  };
  const onPointerUp = () => {
    if (!drag) return;
    setDrag(null);
    if (drag.moved && drag.to !== drag.from) {
      onChange(moveItem(fonts, drag.from, drag.to));
      setRight(drag.to);
    }
  };

  return (
    <div className={styles.fontLists}>
      <div className={styles.fontColumn}>
        <input
          className={styles.input}
          value={query}
          placeholder="Search installed fonts"
          aria-label="Search installed fonts"
          spellCheck={false}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul
          className={styles.fontListBox}
          role="listbox"
          aria-label="Installed fonts"
          tabIndex={0}
          onKeyDown={onLeftKey}
        >
          {available.map((f) => (
            <li
              key={f}
              role="option"
              aria-selected={f === left}
              className={styles.fontRow}
              style={{ fontFamily: `"${f}"` }}
              onClick={() => setLeft(f)}
              onDoubleClick={() => add(f)}
            >
              {f}
            </li>
          ))}
          {available.length === 0 && (
            <li className={styles.fontEmpty}>
              {installed.length ? "No other fonts match." : "Loading fonts…"}
            </li>
          )}
        </ul>
      </div>
      <div className={styles.fontButtons}>
        <button
          type="button"
          className={styles.button}
          disabled={disabled || !left || !available.includes(left)}
          onClick={() => add(left)}
        >
          Add →
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={disabled || selected === null || fonts.length === 1}
          title={fonts.length === 1 ? "The list needs at least one font" : undefined}
          onClick={() => remove(selected)}
        >
          ← Remove
        </button>
      </div>
      <div className={styles.fontColumn}>
        <div className={styles.fontListHead}>
          <span className={styles.help}>My fonts ({fonts.length}) · the first is the default</span>
          <span className={styles.fontOrder}>
            <button
              type="button"
              className={styles.orderButton}
              aria-label="Move up (Alt+↑)"
              title="Move up (Alt+↑)"
              disabled={disabled || selected === null || selected === 0}
              onClick={() => move(selected, -1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 15l6-6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.orderButton}
              aria-label="Move down (Alt+↓)"
              title="Move down (Alt+↓)"
              disabled={disabled || selected === null || selected === fonts.length - 1}
              onClick={() => move(selected, 1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </span>
        </div>
        <ul
          ref={listRef}
          className={styles.fontListBox}
          role="listbox"
          aria-label="My fonts"
          tabIndex={0}
          onKeyDown={onRightKey}
        >
          {fonts.map((f, i) => (
            <li
              key={f}
              role="option"
              aria-selected={i === selected}
              className={styles.fontRow}
              data-dragging={(drag?.moved && i === drag.from) || undefined}
              style={{
                fontFamily: `"${f}"`,
                transform: order ? `translateY(${offset(i)}px)` : undefined,
              }}
              onPointerDown={(e) => onPointerDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDrag(null)}
              onDoubleClick={() => remove(i)}
            >
              <span className={styles.fontSlot}>{i < MAX_STEPPED_FONTS ? (i + 1) % 10 : ""}</span>
              {f}
              {missing.includes(f) && <span className={styles.fontMissing}>not installed</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
