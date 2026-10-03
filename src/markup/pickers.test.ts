import { describe, expect, it } from "vitest";
import type { NumberPicker } from "../shared/ipc";
import {
  colorKey,
  digitSlot,
  nearestValue,
  pickByDigit,
  pickerFraction,
  slotIndex,
  slotKey,
  valueAtFraction,
} from "./pickers";

const buttons: NumberPicker = { control: "buttons", values: [2, 4, 6, 10] };
const small: NumberPicker = { control: "slider", min: 1, max: 8 };
const wide: NumberPicker = { control: "slider", min: 1, max: 20 };

describe("digitSlot, slotKey and colorKey", () => {
  it("maps 1–9 and 0 to slots 1–10 on both key blocks", () => {
    expect(digitSlot("Digit1")).toBe(1);
    expect(digitSlot("Numpad9")).toBe(9);
    expect(digitSlot("Digit0")).toBe(10);
    expect(digitSlot("KeyA")).toBeNull();
    expect(digitSlot("Backquote")).toBe(0);
    expect(slotKey(0)).toBe("1");
    expect(slotKey(9)).toBe("0");
  });

  it("gives colors keys 1–9 only (Ctrl+0 is Fit)", () => {
    expect(colorKey(0)).toBe("1");
    expect(colorKey(8)).toBe("9");
    expect(colorKey(9)).toBeNull();
  });
});

describe("pickByDigit", () => {
  it("picks list slots by position", () => {
    expect(pickByDigit(buttons, 3)).toBe(6);
    expect(pickByDigit(buttons, 5)).toBeNull();
  });

  it("uses the digit as the value on a slider up to 10", () => {
    expect(pickByDigit(small, 3)).toBe(3);
    expect(pickByDigit(small, 9)).toBeNull();
  });

  it("jumps in tenths along a wider slider (PLAN examples)", () => {
    expect(pickByDigit(wide, 5)).toBe(11);
    expect(pickByDigit(wide, 10)).toBe(20);
    expect(pickByDigit({ control: "slider", min: 1, max: 100 }, 2)).toBe(21);
  });

  it("jumps in tenths along a long list", () => {
    expect(slotIndex(101, 2)).toBe(20);
    expect(slotIndex(101, 10)).toBe(100);
    expect(slotIndex(0, 1)).toBeNull();
  });

  it("picks the lowest for slot 0 (the ` key)", () => {
    expect(pickByDigit(buttons, 0)).toBe(2);
    expect(pickByDigit(small, 0)).toBe(1);
    expect(pickByDigit(wide, 0)).toBe(1);
    expect(pickByDigit({ control: "slider", min: 0, max: 8 }, 0)).toBe(0);
    expect(slotIndex(101, 0)).toBe(0);
    expect(slotIndex(0, 0)).toBeNull();
  });
});

describe("positions on a picker", () => {
  it("snaps to the nearest preset or clamps to the range", () => {
    expect(nearestValue(buttons, 5.2)).toBe(6);
    expect(nearestValue(wide, 50)).toBe(20);
  });

  it("maps values to fractions and back", () => {
    expect(pickerFraction(buttons, 6)).toBeCloseTo(2 / 3);
    expect(valueAtFraction(buttons, 0.7)).toBe(6);
    expect(pickerFraction(wide, 1)).toBe(0);
    expect(valueAtFraction(wide, 0.5)).toBe(11);
  });
});
