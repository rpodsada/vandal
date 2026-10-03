import { describe, expect, it } from "vitest";
import { lettersDrop, textFontStyle } from "./textMeasure";

describe("textFontStyle", () => {
  it("gives Konva's font style for bold and italic", () => {
    expect(textFontStyle(false, false)).toBe("normal");
    expect(textFontStyle(true, false)).toBe("bold");
    expect(textFontStyle(false, true)).toBe("italic");
    expect(textFontStyle(true, true)).toBe("italic bold");
  });
});

describe("lettersDrop", () => {
  // Metrics from the fonts' files (the OS/2 table's ascent and descent, and the H and x glyphs).
  it("drops Segoe UI's and Instruction's letters about a tenth of their size", () => {
    const segoe = { ascent: 1.079, descent: 0.251, capHeight: 0.7, xHeight: 0.5 };
    const instruction = { ascent: 1.123, descent: 0.195, capHeight: 0.732, xHeight: 0.732 };
    expect(lettersDrop(segoe)).toBeCloseTo(0.11, 2);
    expect(lettersDrop(instruction)).toBeCloseTo(0.1, 2);
  });

  it("drops Arial's about half as much", () => {
    const arial = { ascent: 0.905, descent: 0.212, capHeight: 0.716, xHeight: 0.519 };
    expect(lettersDrop(arial)).toBeCloseTo(0.04, 2);
  });
});
