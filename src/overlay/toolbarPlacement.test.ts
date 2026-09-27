import { describe, expect, it } from "vitest";
import { SCREEN_MARGIN, TOOLBAR_GAP, toolbarPlacement } from "./toolbarPlacement";

const screen = { width: 1440, height: 900 };
const bar = { width: 400, height: 48 };

describe("toolbarPlacement", () => {
  it("goes below the selection, centred on it", () => {
    const p = toolbarPlacement({ x: 500, y: 100, width: 400, height: 300 }, bar, screen);
    expect(p).toEqual({ x: 500, y: 400 + TOOLBAR_GAP, side: "below" });
  });

  it("flips above when there's no room below", () => {
    const p = toolbarPlacement({ x: 500, y: 500, width: 400, height: 380 }, bar, screen);
    expect(p).toEqual({ x: 500, y: 500 - TOOLBAR_GAP - 48, side: "above" });
  });

  it("goes inside the bottom edge when neither side fits", () => {
    const p = toolbarPlacement({ x: 0, y: 20, width: 1440, height: 870 }, bar, screen);
    expect(p.side).toBe("inside");
    expect(p.y).toBe(20 + 870 - TOOLBAR_GAP - 48);
  });

  it("stays on the monitor horizontally", () => {
    expect(toolbarPlacement({ x: 0, y: 100, width: 50, height: 50 }, bar, screen).x).toBe(
      SCREEN_MARGIN,
    );
    expect(toolbarPlacement({ x: 1400, y: 100, width: 40, height: 50 }, bar, screen).x).toBe(
      1440 - SCREEN_MARGIN - 400,
    );
  });

  it("fits exactly at the margin below", () => {
    // The toolbar's bottom lands exactly on the margin: still below.
    const y = 900 - SCREEN_MARGIN - 48 - TOOLBAR_GAP;
    expect(
      toolbarPlacement({ x: 500, y: 100, width: 400, height: y - 100 }, bar, screen).side,
    ).toBe("below");
  });
});
