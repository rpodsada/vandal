import { describe, expect, it } from "vitest";
import { placeMenu } from "./menuPlacement";

const view = { width: 800, height: 600 };
const menu = { width: 260, height: 300 };

describe("placeMenu", () => {
  it("opens under the anchor, left edges aligned", () => {
    const anchor = { left: 100, top: 50, width: 30, height: 30 };
    expect(placeMenu(anchor, menu, view)).toEqual({ left: 100, top: 84 });
  });

  it("slides left to stay inside the window", () => {
    const anchor = { left: 700, top: 50, width: 30, height: 30 };
    expect(placeMenu(anchor, menu, view).left).toBe(800 - 8 - 260);
  });

  it("flips above when there's no room below", () => {
    const anchor = { left: 100, top: 500, width: 30, height: 30 };
    expect(placeMenu(anchor, menu, view).top).toBe(500 - 4 - 300);
  });

  it("stays in the window when neither side fits", () => {
    const anchor = { left: 100, top: 250, width: 30, height: 30 };
    const tall = { width: 260, height: 500 };
    expect(placeMenu(anchor, tall, view).top).toBe(600 - 8 - 500);
  });

  it("keeps the left margin when the menu is wider than the window", () => {
    const anchor = { left: 100, top: 50, width: 30, height: 30 };
    expect(placeMenu(anchor, { width: 900, height: 100 }, view).left).toBe(8);
  });
});
