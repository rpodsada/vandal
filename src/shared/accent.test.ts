import { describe, expect, it } from "vitest";
import { accentShades, contrast, onAccent } from "./accent";

describe("contrast", () => {
  it("is 21 for black on white and 1 for a color on itself", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#1f6fe5", "#1f6fe5")).toBe(1);
  });
});

describe("accentShades", () => {
  it("keeps a color that already reads well in both themes' direction", () => {
    // The app's own blue is fine on light backgrounds as it is.
    expect(accentShades("#1f6fe5").light).toBe("#1f6fe5");
  });

  it("darkens a pale color for light mode and lightens a deep one for dark mode", () => {
    const yellow = accentShades("#ffd400");
    expect(contrast(yellow.light, "#fbfbfb")).toBeGreaterThanOrEqual(3.5);
    const navy = accentShades("#102060");
    expect(contrast(navy.dark, "#202020")).toBeGreaterThanOrEqual(6);
  });
});

describe("onAccent", () => {
  it("puts white on dark accents and near-black on light ones", () => {
    expect(onAccent("#1f6fe5")).toBe("#ffffff");
    expect(onAccent("#6aa7ff")).toBe("#111111");
  });
});
