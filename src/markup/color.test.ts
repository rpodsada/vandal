import { describe, expect, it } from "vitest";
import { hexToHsv, hexToRgb, hsvToHex, parseHex, rgbToHex } from "./color";

describe("color", () => {
  it("parses hex in its usual spellings", () => {
    expect(parseHex("#1E88E5")).toBe("#1e88e5");
    expect(parseHex("1e88e5")).toBe("#1e88e5");
    expect(parseHex(" #abc ")).toBe("#aabbcc");
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("blue")).toBeNull();
  });

  it("converts to and from rgb", () => {
    expect(hexToRgb("#1e88e5")).toEqual({ r: 30, g: 136, b: 229 });
    expect(rgbToHex({ r: 30, g: 136, b: 229 })).toBe("#1e88e5");
    expect(rgbToHex({ r: 300, g: -4, b: 12.4 })).toBe("#ff000c");
  });

  it("round-trips through hsv", () => {
    for (const c of ["#1e88e5", "#e53935", "#000000", "#ffffff", "#808080", "#fdd835", "#8e24aa"])
      expect(hsvToHex(hexToHsv(c))).toBe(c);
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#00ff00").h).toBe(120);
    expect(hexToHsv("#0000ff").h).toBe(240);
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
  });
});
