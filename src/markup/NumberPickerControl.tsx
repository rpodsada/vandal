import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { NumberPicker } from "../shared/ipc";
import { Dropdown } from "./Dropdown";
import { nearestValue, pickerFraction, slotKey, valueAtFraction } from "./pickers";
import styles from "./options.module.css";

interface Props {
  picker: NumberPicker;
  value: number;
  /** "px" or "pt". */
  unit: string;
  /** For tooltips, e.g. "Line width". */
  label: string;
  /** Show slot-number badges (the digit key is held). */
  showKeys: boolean;
  /** Mention the digit keys in tooltips. */
  hints: boolean;
  /** Draw each value as a line of that thickness (line width). */
  lines?: boolean;
  onPick: (value: number) => void;
  /** A slider drag starts / ends: its steps are one undo entry. */
  onDragStart: () => void;
  onDragEnd: () => void;
}

const TRACK_WIDTH = 150;
/** Lines are drawn at most this thick in the controls. */
const MAX_LINE = 12;

/** One number picker in whichever control its spec asks for (PLAN "Style controls"). */
export function NumberPickerControl(props: Props) {
  const { picker } = props;
  switch (picker.control) {
    case "buttons":
      return <Buttons {...props} values={picker.values} />;
    case "dropdown":
      return <NumberDropdown {...props} values={picker.values} />;
    case "stepped":
    case "slider":
      return <Slider {...props} />;
  }
}

function keyHint(props: Props, i: number): string {
  return props.hints ? ` (${slotKey(i)})` : "";
}

function Line({ width, length }: { width: number; length: number }) {
  return (
    <span
      className={styles.line}
      style={{ width: length, height: Math.max(1, Math.min(width, MAX_LINE)) }}
    />
  );
}

function Buttons(props: Props & { values: number[] }) {
  const current = nearestValue(props.picker, props.value);
  return (
    <div className={styles.group}>
      {props.values.map((v, i) => (
        <button
          key={v}
          type="button"
          className={styles.toggle}
          aria-pressed={v === current}
          aria-label={`${v} ${props.unit}`}
          title={`${v} ${props.unit}${keyHint(props, i)}`}
          onClick={() => props.onPick(v)}
        >
          {props.lines ? <Line width={v} length={20} /> : v}
          {props.showKeys && <span className={styles.badge}>{slotKey(i)}</span>}
        </button>
      ))}
    </div>
  );
}

function NumberDropdown(props: Props & { values: number[] }) {
  const current = nearestValue(props.picker, props.value);
  return (
    <Dropdown
      className={styles.dropdown}
      title={`${props.label}${props.hints ? " (1…0)" : ""}`}
      button={
        <>
          {props.lines && <Line width={current} length={18} />}
          <span>
            {current} {props.unit}
          </span>
        </>
      }
    >
      {(close) =>
        props.values.map((v, i) => (
          <button
            key={v}
            type="button"
            role="menuitemradio"
            aria-checked={v === current}
            className={styles.menuRow}
            onClick={() => {
              props.onPick(v);
              close();
            }}
          >
            {props.lines && <Line width={v} length={28} />}
            <span className={styles.menuLabel}>
              {v} {props.unit}
            </span>
            {props.hints && <span className={styles.menuKey}>{slotKey(i)}</span>}
          </button>
        ))
      }
    </Dropdown>
  );
}

/** A free slider, or a stepped one that snaps to the listed values. */
function Slider(props: Props) {
  const { picker } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const f = pickerFraction(picker, props.value);
  const stops = picker.control === "stepped" ? picker.values : [];
  const shown =
    picker.control === "slider" ? Math.round(props.value) : nearestValue(picker, props.value);

  const valueAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return valueAtFraction(picker, (clientX - r.left) / r.width);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    props.onDragStart();
    let last = valueAt(e.clientX);
    props.onPick(last);
    const move = (m: PointerEvent) => {
      const v = valueAt(m.clientX);
      if (v !== last) props.onPick((last = v));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      props.onDragEnd();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div className={styles.sliderRow}>
      <div
        ref={trackRef}
        className={styles.track}
        style={{ width: TRACK_WIDTH }}
        role="slider"
        aria-label={props.label}
        aria-valuenow={shown}
        title={`${props.label}${props.hints ? " (1…0)" : ""}`}
        onPointerDown={onPointerDown}
      >
        <span className={styles.trackBg} />
        <span className={styles.trackFill} style={{ width: f * TRACK_WIDTH }} />
        {stops.map((v, i) => {
          const x = stops.length > 1 ? (i / (stops.length - 1)) * TRACK_WIDTH : 0;
          return (
            <span key={v}>
              <span
                className={styles.stop}
                data-passed={x <= f * TRACK_WIDTH + 0.5}
                style={{ left: x - 2 }}
              />
              {props.showKeys && (
                <span className={styles.stopKey} style={{ left: x - 7 }}>
                  {slotKey(i)}
                </span>
              )}
            </span>
          );
        })}
        <span className={styles.thumb} style={{ left: f * TRACK_WIDTH - 9 }}>
          <span className={styles.thumbDot} />
        </span>
      </div>
      <span className={styles.value}>
        {shown} {props.unit}
      </span>
    </div>
  );
}
