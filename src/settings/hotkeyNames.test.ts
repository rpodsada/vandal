import { describe, expect, it } from "vitest";
import { combo, isModifier, keyName, modsLabel, NO_MODS } from "./hotkeyNames";

const mods = (ctrl: boolean, win: boolean, alt: boolean, shift: boolean) => ({
  ctrl,
  win,
  alt,
  shift,
});

describe("keyName", () => {
  it("uses the shortcut parser's names", () => {
    expect(keyName("F12")).toBe("F12");
    expect(keyName("F24")).toBe("F24");
    expect(keyName("KeyS")).toBe("S");
    expect(keyName("Digit5")).toBe("5");
    expect(keyName("Numpad3")).toBe("Numpad3");
    expect(keyName("ArrowUp")).toBe("Up");
    expect(keyName("Comma")).toBe(",");
    expect(keyName("PrintScreen")).toBe("PrintScreen");
  });

  it("has none for keys a shortcut can't use", () => {
    expect(keyName("ContextMenu")).toBeNull();
    expect(keyName("F25")).toBeNull();
    expect(keyName("")).toBeNull();
  });
});

describe("modifiers", () => {
  it("are recognised on either side and written in Windows' order", () => {
    expect(isModifier("MetaRight")).toBe(true);
    expect(isModifier("KeyA")).toBe(false);
    expect(modsLabel(mods(true, true, false, true))).toBe("Ctrl+Win+Shift");
  });
});

describe("combo", () => {
  it("joins modifiers and key", () => {
    expect(combo(mods(true, true, false, true), "F12")).toEqual({ combo: "Ctrl+Win+Shift+F12" });
    expect(combo(mods(false, true, false, false), "F12")).toEqual({ combo: "Win+F12" });
  });

  it("needs a modifier except for keys nobody types", () => {
    expect(combo(NO_MODS, "S")).toHaveProperty("error");
    expect(combo(NO_MODS, "Space")).toHaveProperty("error");
    expect(combo(NO_MODS, "PrintScreen")).toEqual({ combo: "PrintScreen" });
    expect(combo(NO_MODS, "F9")).toEqual({ combo: "F9" });
    expect(combo(NO_MODS, "Pause")).toEqual({ combo: "Pause" });
  });
});
