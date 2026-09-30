import { useRef, useState, type MouseEvent } from "react";
import { NumberPickerControl } from "../../markup/NumberPickerControl";
import type { NumberPicker } from "../../shared/ipc";
import type { NumberPickerItem } from "../schema";
import {
  cleanValues,
  MAX_VALUES,
  nextValue,
  parseValue,
  rangeError,
  valuesOf,
  withControl,
  type PickerControl,
} from "../pickerSpec";
import { useSettingsStore } from "../store";
import { getIn } from "../path";
import type { ControlProps } from "./index";
import { Segmented, type ChoiceOption } from "./Segmented";
import { useDraft } from "./useDraft";
import markup from "../../markup/options.module.css";
import { PlusIcon, RemoveIcon } from "../icons";
import styles from "./controls.module.css";

const CONTROLS: ChoiceOption<PickerControl>[] = [
  { value: "buttons", label: "Buttons" },
  { value: "dropdown", label: "Dropdown" },
  { value: "stepped", label: "Stepped slider" },
  { value: "slider", label: "Slider" },
];

/** A number picker setting (line width, font size): its spec at `item.path`. */
export function NumberPickerSetting({ item, id, disabled }: ControlProps<NumberPickerItem>) {
  // Picker specs are objects, which typed leaf paths don't reach.
  const picker = useSettingsStore((s) => getIn(s.settings!, item.path as never)) as NumberPicker;
  const set = useSettingsStore((s) => s.set);
  return (
    <NumberPickerEditor
      id={id}
      picker={picker}
      label={item.label}
      unit={item.unit}
      lines={item.lines}
      disabled={disabled}
      onChange={(p) => void set(item.path as never, p as never)}
    />
  );
}

interface EditorProps {
  id?: string;
  picker: NumberPicker;
  /** What the values are, e.g. "Line width". */
  label: string;
  unit: string;
  /** Preview values as lines of that thickness. */
  lines?: boolean;
  disabled?: boolean;
  onChange: (picker: NumberPicker) => void;
}

/**
 * Edits a picker spec (PLAN 2C.1): the control type, then its values (a
 * list of up to 10, kept ascending) or its range, with the real picker as a
 * preview. Reused for font sizes and per-tool widths.
 */
export function NumberPickerEditor({
  id,
  picker,
  label,
  unit,
  lines,
  disabled,
  onChange,
}: EditorProps) {
  // The list in use before switching to the slider, to bring it back.
  const remembered = useRef<number[] | undefined>(undefined);
  const [previewValue, setPreviewValue] = useState(() => valuesOf(picker)[0]);
  // The preview shows units as the options bar would.
  const showUnits = useSettingsStore((s) => s.settings?.editor.showButtonUnits ?? false);

  const setControl = (control: PickerControl) => {
    if (picker.control !== "slider") remembered.current = picker.values;
    onChange(withControl(picker, control, remembered.current));
  };

  return (
    <div className={styles.controlGroup}>
      <Segmented
        id={id}
        label={`${label}: control`}
        options={CONTROLS}
        value={picker.control}
        disabled={disabled}
        onChange={setControl}
      />
      {picker.control === "slider" ? (
        <RangeFields
          min={picker.min}
          max={picker.max}
          unit={unit}
          label={label}
          disabled={disabled}
          onChange={(min, max) => onChange({ control: "slider", min, max })}
        />
      ) : (
        <ValueList
          values={picker.values}
          unit={unit}
          label={label}
          disabled={disabled}
          onChange={(values) => onChange({ control: picker.control, values })}
        />
      )}
      {/* The options bar's context, which the editor's pickers are styled for. */}
      <div className={`${styles.pickerPreview} ${markup.options}`}>
        <span className={styles.help}>Preview</span>
        <NumberPickerControl
          picker={picker}
          value={previewValue}
          unit={unit}
          label={label}
          showKeys={false}
          hints={false}
          lines={lines}
          showUnits={showUnits}
          onPick={setPreviewValue}
          onDragStart={() => {}}
          onDragEnd={() => {}}
        />
      </div>
    </div>
  );
}

function ValueList({
  values,
  unit,
  label,
  disabled,
  onChange,
}: {
  values: number[];
  unit: string;
  label: string;
  disabled?: boolean;
  onChange: (values: number[]) => void;
}) {
  return (
    <div className={styles.valueList}>
      {values.map((v, i) => (
        // By position: after sorting, each field shows whatever value is there now.
        <ValueField
          key={i}
          value={v}
          unit={unit}
          label={`${label} ${i + 1}`}
          disabled={disabled}
          onCommit={(n) => onChange(cleanValues(values.map((x, j) => (j === i ? n : x))))}
          onRemove={
            values.length > 1 ? () => onChange(values.filter((_, j) => j !== i)) : undefined
          }
        />
      ))}
      {values.length < MAX_VALUES && (
        <button
          type="button"
          className={styles.addValue}
          aria-label={`Add a ${label.toLowerCase()} value`}
          title="Add a value"
          disabled={disabled}
          onClick={() => onChange(cleanValues([...values, nextValue(values)]))}
        >
          <PlusIcon />
        </button>
      )}
      <span className={styles.help}>
        {values.length} of {MAX_VALUES}
      </span>
    </div>
  );
}

/**
 * A press on a value box outside its number (the unit, the space around)
 * puts the caret after the number, without selecting it.
 */
function focusAtEnd(e: MouseEvent<HTMLElement>) {
  const input = e.currentTarget.querySelector("input");
  if (!input || e.target === input || input.disabled) return;
  e.preventDefault();
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

/** One value: edits locally, commits on blur or Enter (sorted in), Escape reverts. */
function ValueField({
  value,
  unit,
  label,
  disabled,
  onCommit,
  onRemove,
}: {
  value: number;
  unit: string;
  label: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
  onRemove?: () => void;
}) {
  const [draft, setDraft] = useDraft(String(value));
  const commit = () => {
    const n = parseValue(draft);
    if (n === null || n === value) setDraft(String(value));
    else onCommit(n);
  };
  return (
    <span className={styles.valueChip}>
      <span className={styles.chipValue} onMouseDown={focusAtEnd}>
        <input
          className={styles.valueInput}
          value={draft}
          inputMode="decimal"
          aria-label={label}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(String(value));
          }}
        />
        <span className={styles.unit}>{unit}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          className={styles.chipRemove}
          aria-label={`Remove ${value} ${unit}`}
          title="Remove"
          disabled={disabled}
          onClick={onRemove}
        >
          <RemoveIcon />
        </button>
      )}
    </span>
  );
}

/** A slider's smallest and largest value; saved once both are valid. */
function RangeFields({
  min,
  max,
  unit,
  label,
  disabled,
  onChange,
}: {
  min: number;
  max: number;
  unit: string;
  label: string;
  disabled?: boolean;
  onChange: (min: number, max: number) => void;
}) {
  const [minText, setMinText] = useDraft(String(min));
  const [maxText, setMaxText] = useDraft(String(max));
  const [lo, hi] = [parseValue(minText), parseValue(maxText)];
  const error = rangeError(lo, hi);
  const commit = () => {
    if (!error && (lo !== min || hi !== max)) onChange(lo!, hi!);
  };
  const revert = () => {
    setMinText(String(min));
    setMaxText(String(max));
  };
  const field = (text: string, set: (t: string) => void, name: string) => (
    <span className={styles.valueChip}>
      <span className={styles.chipValue} onMouseDown={focusAtEnd}>
        <input
          className={styles.valueInput}
          value={text}
          inputMode="decimal"
          aria-label={`${label}: ${name}`}
          disabled={disabled}
          onChange={(e) => set(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") revert();
          }}
        />
        <span className={styles.unit}>{unit}</span>
      </span>
    </span>
  );
  return (
    <div className={styles.stack}>
      <div className={styles.valueList}>
        <span className={styles.help}>From</span>
        {field(minText, setMinText, "smallest")}
        <span className={styles.help}>to</span>
        {field(maxText, setMaxText, "largest")}
      </div>
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}
