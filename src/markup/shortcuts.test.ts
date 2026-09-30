import { describe, expect, it } from "vitest";
import { withShortcuts } from "./hints";
import { DEFAULT_SHORTCUTS, comboOf, shortcutOf } from "./shortcuts";

const press = (
  code: string,
  mods: Partial<Record<"ctrl" | "alt" | "shift" | "meta", boolean>> = {},
) => ({
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

describe("comboOf", () => {
  it("spells a letter with its modifiers as settings store it", () => {
    expect(comboOf(press("KeyV"))).toBe("V");
    expect(comboOf(press("KeyL", { shift: true, ctrl: true }))).toBe("Ctrl+Shift+L");
    expect(comboOf(press("KeyX", { alt: true }))).toBe("Alt+X");
  });

  it("is nothing for other keys, or with Win", () => {
    expect(comboOf(press("Digit1"))).toBeNull();
    expect(comboOf(press("Enter"))).toBeNull();
    expect(comboOf(press("KeyL", { meta: true }))).toBeNull();
  });
});

describe("shortcutOf", () => {
  it("matches the exact combination", () => {
    expect(shortcutOf(press("KeyO"), DEFAULT_SHORTCUTS)).toBe("callout");
    expect(shortcutOf(press("KeyO", { shift: true }), DEFAULT_SHORTCUTS)).toBeNull();
    const keys = { ...DEFAULT_SHORTCUTS, pen: "Ctrl+Shift+P" };
    expect(shortcutOf(press("KeyP", { ctrl: true, shift: true }), keys)).toBe("pen");
    expect(shortcutOf(press("KeyP"), keys)).toBeNull();
  });
});

describe("withShortcuts", () => {
  it("fills in the keys", () => {
    expect(withShortcuts("{pen} Draw freehand · [Shift] straight line", DEFAULT_SHORTCUTS)).toBe(
      "[P] Draw freehand · [Shift] straight line",
    );
    expect(withShortcuts("{tools} tools", { ...DEFAULT_SHORTCUTS, pen: null })).toBe(
      "[V] [H] [L] [A] [R] [E] [T] [O] [B] [S] [N] tools",
    );
  });

  it("leaves a cleared key out, and drops an optional part", () => {
    const keys = { ...DEFAULT_SHORTCUTS, pen: null, swapColors: null };
    expect(withShortcuts("{pen} Draw freehand", keys)).toBe("Draw freehand");
    expect(withShortcuts("Choose · {swapColors?} swaps them · more", keys)).toBe("Choose · more");
  });
});
