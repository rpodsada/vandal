import { describe, expect, it } from "vitest";
import { textFontStyle } from "./textMeasure";

describe("textFontStyle", () => {
  it("gives Konva's font style for bold and italic", () => {
    expect(textFontStyle(false, false)).toBe("normal");
    expect(textFontStyle(true, false)).toBe("bold");
    expect(textFontStyle(false, true)).toBe("italic");
    expect(textFontStyle(true, true)).toBe("italic bold");
  });
});
