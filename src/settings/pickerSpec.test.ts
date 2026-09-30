import { describe, expect, it } from "vitest";
import { cleanValues, nextValue, parseValue, rangeError, withControl } from "./pickerSpec";

describe("parseValue", () => {
  it("accepts positive numbers, rounded to one decimal", () => {
    expect(parseValue(" 4 ")).toBe(4);
    expect(parseValue("2.54")).toBe(2.5);
    expect(parseValue("1,5")).toBe(1.5);
  });

  it("rejects zero, negatives and junk", () => {
    for (const t of ["0", "-3", "", "abc", "Infinity"]) expect(parseValue(t)).toBeNull();
  });
});

describe("cleanValues", () => {
  it("sorts, drops duplicates and caps at 10", () => {
    expect(cleanValues([6, 2, 4, 2])).toEqual([2, 4, 6]);
    expect(cleanValues([...Array(12).keys()].map((i) => i + 1))).toHaveLength(10);
    expect(cleanValues([0, -1, 3])).toEqual([3]);
  });
});

describe("withControl", () => {
  const buttons = { control: "buttons" as const, values: [2, 4, 6, 10] };

  it("keeps the list between list types", () => {
    expect(withControl(buttons, "dropdown")).toEqual({
      control: "dropdown",
      values: [2, 4, 6, 10],
    });
    expect(withControl(buttons, "stepped")).toEqual({ control: "stepped", values: [2, 4, 6, 10] });
  });

  it("spans the list with a slider", () => {
    expect(withControl(buttons, "slider")).toEqual({ control: "slider", min: 2, max: 10 });
    // A single value still makes a usable range.
    expect(withControl({ control: "buttons", values: [5] }, "slider")).toEqual({
      control: "slider",
      min: 5,
      max: 6,
    });
  });

  it("brings the remembered list back from a slider, or spreads the range", () => {
    const slider = { control: "slider" as const, min: 8, max: 40 };
    expect(withControl(slider, "buttons", [3, 5])).toEqual({ control: "buttons", values: [3, 5] });
    expect(withControl(slider, "buttons")).toEqual({ control: "buttons", values: [8, 19, 29, 40] });
  });
});

describe("nextValue", () => {
  it("continues the list's spacing", () => {
    expect(nextValue([2, 4, 6])).toBe(8);
    expect(nextValue([4])).toBe(5);
    expect(nextValue([])).toBe(2);
  });
});

describe("rangeError", () => {
  it("needs two numbers with max above min", () => {
    expect(rangeError(8, 40)).toBeNull();
    expect(rangeError(8, 8)).not.toBeNull();
    expect(rangeError(null, 40)).not.toBeNull();
  });
});

describe("keeping 0 (corner radii)", () => {
  it("keeps 0 first and always", () => {
    expect(cleanValues([8, 4, 0, 4], true)).toEqual([0, 4, 8]);
    expect(cleanValues([8, 4], true)).toEqual([0, 4, 8]);
    expect(
      cleanValues(
        [...Array(15).keys()].map((n) => n + 1),
        true,
      ),
    ).toHaveLength(10);
  });

  it("starts a slider at 0 and brings 0 back into a list", () => {
    expect(
      withControl({ control: "dropdown", values: [0, 4, 16] }, "slider", undefined, true),
    ).toEqual({
      control: "slider",
      min: 0,
      max: 16,
    });
    const list = withControl({ control: "slider", min: 0, max: 30 }, "stepped", undefined, true);
    expect(list).toEqual({ control: "stepped", values: [0, 10, 20, 30] });
  });
});
