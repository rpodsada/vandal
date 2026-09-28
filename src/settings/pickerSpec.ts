// Editing a number picker spec in Settings (PLAN 2C.1): switching its control
// type and keeping its values sane. Rust normalizes too; this keeps the
// editor from sending anything it would have to throw away.

import type { NumberPicker } from "../shared/ipc";

export const MAX_VALUES = 10;

export type PickerControl = NumberPicker["control"];

/** A typed value: positive, finite, at most one decimal. `null` if not. */
export function parseValue(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

/** Positive, ascending, without duplicates, at most MAX_VALUES. */
export function cleanValues(values: readonly number[]): number[] {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || v !== sorted[i - 1]).slice(0, MAX_VALUES);
}

/** The list a picker offers, or the slider's range spread over a few values. */
export function valuesOf(picker: NumberPicker): number[] {
  if (picker.control !== "slider") return picker.values;
  const { min, max } = picker;
  const steps = 4;
  return cleanValues(
    Array.from({ length: steps }, (_, i) => Math.round(min + ((max - min) * i) / (steps - 1))),
  );
}

/**
 * `picker` shown as `control`. Lists carry over between list types; a
 * slider spans the list; a list from a slider is `remembered` (the list the
 * user had before switching to the slider) or the range spread out.
 */
export function withControl(
  picker: NumberPicker,
  control: PickerControl,
  remembered?: readonly number[],
): NumberPicker {
  if (control === picker.control) return picker;
  if (control === "slider") {
    const values = valuesOf(picker);
    const min = values[0];
    const max = Math.max(values[values.length - 1], min + 1);
    return { control, min, max };
  }
  const values =
    picker.control === "slider" && remembered?.length ? [...remembered] : valuesOf(picker);
  return { control, values };
}

/** A value to add after the last one: one step further, keeping the list's spacing. */
export function nextValue(values: readonly number[]): number {
  const last = values[values.length - 1] ?? 1;
  const step = values.length > 1 ? last - values[values.length - 2] : 1;
  return Math.round((last + Math.max(step, 1)) * 10) / 10;
}

/** Why a slider range can't be saved, if it can't. */
export function rangeError(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return "Enter numbers above 0.";
  if (max <= min) return "The largest value must be above the smallest.";
  return null;
}
