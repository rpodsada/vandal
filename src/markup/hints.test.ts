import { describe, expect, it } from "vitest";
import { CONTROL_HINTS, chooseHint, parseHint, type HintState } from "./hints";

const base: HintState = {
  hover: null,
  drag: null,
  mode: null,
  tool: "select",
  selected: 0,
  textSelected: false,
  segmentSelected: false,
  stepSelected: false,
  labelTyping: false,
  typing: false,
  overObject: false,
  twoColors: false,
  drawingToolsSelect: true,
};

describe("chooseHint", () => {
  it("prefers the hovered control, then the drag, then the tool", () => {
    const s: HintState = { ...base, tool: "rect", hover: "copy", drag: "square" };
    expect(chooseHint(s)).toBe(CONTROL_HINTS.copy);
    expect(chooseHint({ ...s, hover: null })).toBe("[Shift] square");
    expect(chooseHint({ ...s, hover: null, drag: null })).toMatch(/^\[Shift\] square/);
  });

  it("shows the general shortcuts with Select and nothing selected", () => {
    expect(chooseHint(base)).toContain("tools");
    expect(chooseHint({ ...base, selected: 2 })).toMatch(/^\[Del\]/);
    expect(chooseHint({ ...base, selected: 1, textSelected: true })).toMatch(/^\[Enter\]/);
    expect(chooseHint({ ...base, selected: 1, segmentSelected: true })).toMatch(/^Drag the ◆/);
    expect(chooseHint({ ...base, selected: 1, stepSelected: true })).toMatch(
      /^\[Enter\] or double-click/,
    );
    expect(chooseHint({ ...base, tool: "step", selected: 1, stepSelected: true })).toMatch(
      /type its own label/,
    );
    expect(chooseHint({ ...base, labelTyping: true })).toMatch(/^\[Enter\] done/);
  });

  it("says what Ctrl does over an object, following the setting", () => {
    const over = { ...base, tool: "arrow" as const, overObject: true };
    expect(chooseHint(over)).toContain("[Ctrl] draw over it");
    expect(chooseHint({ ...over, drawingToolsSelect: false })).toMatch(/^\[Ctrl\] select/);
    // The pen always draws.
    expect(chooseHint({ ...over, tool: "pen" })).not.toContain("[Ctrl]");
  });

  it("shows the typing keys while typing", () => {
    expect(chooseHint({ ...base, tool: "text", typing: true })).toMatch(/^\[Esc\] done/);
  });
});

describe("color hints", () => {
  it("names the fill color only when a shape has one", () => {
    const rect = { ...base, tool: "rect" as const };
    expect(chooseHint(rect)).not.toContain("Ctrl+Shift");
    expect(chooseHint({ ...rect, twoColors: true })).toContain(
      "[Ctrl+1…0] border color · [Ctrl+Shift+1…0] fill color",
    );
  });

  it("names text and background colors, the background only with a box", () => {
    const text = { ...base, tool: "text" as const };
    expect(chooseHint(text)).toMatch(/\[Ctrl\+1…0\] text color$/);
    expect(chooseHint({ ...text, twoColors: true })).toMatch(/background color$/);
    expect(chooseHint({ ...text, typing: true, twoColors: true })).toMatch(/background color$/);
  });
});

describe("parseHint", () => {
  it("splits text and key caps", () => {
    expect(parseHint("[Ctrl+Shift+1…0] fill · [Space]+drag")).toEqual([
      { keys: ["Ctrl", "Shift", "1…0"] },
      { text: " fill · " },
      { keys: ["Space"] },
      { text: "+drag" },
    ]);
  });

  it("allows brackets as keys", () => {
    expect(parseHint("[Ctrl+[] [Ctrl+]] order")).toEqual([
      { keys: ["Ctrl", "["] },
      { text: " " },
      { keys: ["Ctrl", "]"] },
      { text: " order" },
    ]);
  });

  it("keeps an unclosed bracket as text", () => {
    expect(parseHint("a [b")).toEqual([{ text: "a [b" }]);
  });

  it("parses every hint in the table", () => {
    for (const hint of Object.values(CONTROL_HINTS)) {
      for (const part of parseHint(hint)) {
        if ("text" in part) expect(part.text).not.toMatch(/[[\]]/);
        else expect(part.keys.every((k) => k.length > 0)).toBe(true);
      }
    }
  });
});
