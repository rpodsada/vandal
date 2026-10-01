import { describe, expect, it } from "vitest";
import { emptyDoc } from "../markup/model/types";
import { MARKUP_KIND, markupToJson } from "./markupJson";

describe("markupToJson", () => {
  it("is the Doc, tagged", () => {
    const doc = emptyDoc({ width: 40, height: 30 }, { x: 1, y: 2, width: 10, height: 20 });
    const parsed = JSON.parse(markupToJson(doc)) as unknown;
    expect(parsed).toEqual({ kind: MARKUP_KIND, ...doc });
  });
});
