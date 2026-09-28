import { describe, expect, it } from "vitest";
import { dropIndex, moveItem, paletteError } from "./paletteSpec";

describe("moveItem", () => {
  it("moves forwards and backwards", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("clamps the target", () => {
    expect(moveItem(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
  });
});

describe("dropIndex", () => {
  // Swatches a, b, c, d centred at 10, 40, 70, 100.
  const centers = [10, 40, 70, 100];
  it("lands after the other swatches the pointer is past", () => {
    // a dragged between b and c: after b.
    expect(dropIndex(centers, 0, 45)).toBe(1);
    // d dragged between b and c: after b.
    expect(dropIndex(centers, 3, 45)).toBe(2);
    expect(dropIndex(centers, 2, 0)).toBe(0);
    expect(dropIndex(centers, 0, 500)).toBe(3);
    // Not moved past anything: stays.
    expect(dropIndex(centers, 1, 42)).toBe(1);
  });
});

describe("paletteError", () => {
  const colors = ["#ff0000", "#00ff00"];
  it("refuses duplicates, except the color being edited itself", () => {
    expect(paletteError(colors, "#00FF00", 0)).not.toBeNull();
    expect(paletteError(colors, "#00ff00", 1)).toBeNull();
    expect(paletteError(colors, "#0000ff", null)).toBeNull();
  });

  it("refuses an 11th color", () => {
    const full = Array.from({ length: 10 }, (_, i) => `#00000${i}`);
    expect(paletteError(full, "#123456", null)).not.toBeNull();
    expect(paletteError(full, "#123456", 3)).toBeNull();
  });
});
