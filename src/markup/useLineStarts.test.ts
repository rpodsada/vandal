import { describe, expect, it } from "vitest";
import { lineStarts } from "./useLineStarts";

describe("lineStarts", () => {
  it("is false for everything on one line, whatever the heights", () => {
    expect(
      lineStarts([
        { top: 7, height: 30 },
        { top: 11, height: 22 },
        { top: 7, height: 30 },
      ]),
    ).toEqual([false, false, false]);
  });

  it("marks the first item of each further line", () => {
    expect(
      lineStarts([
        { top: 7, height: 30 },
        { top: 7, height: 30 },
        { top: 43, height: 30 },
        { top: 47, height: 22 },
      ]),
    ).toEqual([false, false, true, false]);
  });
});
