// Picker specs → values (PLAN Phase 2, "Style controls"): which value a digit
// key picks, and where a value sits on a picker. Pure, shared by the options
// panel, the shortcuts and (Phase 2C) the Settings preview.

import type { NumberPicker } from "../shared/ipc";

/** The slot (1–10) a digit key stands for: 1–9, and 0 = 10. Number row or numpad. */
export function digitSlot(code: string): number | null {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (!m) return null;
  const d = Number(m[1]);
  return d === 0 ? 10 : d;
}

/** The key label for slot index `i` (0-based): "1"…"9", "0". */
export function slotKey(i: number): string {
  return String((i + 1) % 10);
}

/**
 * Index into a list of `length` for slot `n`: by position for 10 or fewer
 * items (null past the end), otherwise `n`/10 of the way along.
 */
export function slotIndex(length: number, n: number): number | null {
  if (length <= 0) return null;
  if (length <= 10) return n <= length ? n - 1 : null;
  return Math.round((n / 10) * (length - 1));
}

/**
 * The value digit slot `n` picks: a list slot by position; on a slider up to
 * 10 the value `n` itself (null if out of range); on a wider slider `n`/10 of
 * the way along.
 */
export function pickByDigit(picker: NumberPicker, n: number): number | null {
  if (picker.control === "slider") {
    const { min, max } = picker;
    if (max <= 10) return n >= min && n <= max ? n : null;
    return Math.round(min + ((max - min) * n) / 10);
  }
  const i = slotIndex(picker.values.length, n);
  return i === null ? null : picker.values[i];
}

/** `value` as the picker can show it: the nearest preset, or clamped to the range. */
export function nearestValue(picker: NumberPicker, value: number): number {
  if (picker.control === "slider") return Math.min(picker.max, Math.max(picker.min, value));
  return picker.values.reduce((best, v) =>
    Math.abs(v - value) < Math.abs(best - value) ? v : best,
  );
}

/** Where `value` sits along a picker, 0–1 (for slider thumbs). */
export function pickerFraction(picker: NumberPicker, value: number): number {
  if (picker.control === "slider") {
    return (
      (Math.min(picker.max, Math.max(picker.min, value)) - picker.min) / (picker.max - picker.min)
    );
  }
  const n = picker.values.length;
  if (n < 2) return 0;
  const i = picker.values.indexOf(nearestValue(picker, value));
  return i / (n - 1);
}

/** The value at fraction `f` (0–1) along a picker: snapped to a preset or rounded. */
export function valueAtFraction(picker: NumberPicker, f: number): number {
  const t = Math.min(1, Math.max(0, f));
  if (picker.control === "slider") return Math.round(picker.min + t * (picker.max - picker.min));
  return picker.values[Math.round(t * (picker.values.length - 1))];
}
