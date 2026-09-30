import { describe, expect, it } from "vitest";
import { emptyDoc, type Doc, type StepAnnotation } from "./model/types";
import {
  contrastingText,
  nextStepSeq,
  parseStepStart,
  stepLabel,
  stepLabels,
  stepResetEffect,
  stepStyleOf,
} from "./steps";

function marker(id: string, seq: number, extra: Partial<StepAnnotation> = {}): StepAnnotation {
  return {
    id,
    kind: "step",
    x: 0,
    y: 0,
    seq,
    size: 32,
    shape: "circle",
    color: "#e53935",
    textColor: "#ffffff",
    fontFamily: "Segoe UI",
    format: "numbers",
    start: 1,
    ...extra,
  };
}

function docWith(...steps: StepAnnotation[]): Doc {
  return { ...emptyDoc({ width: 100, height: 100 }), annotations: steps };
}

describe("step labels", () => {
  it("counts in numbers or letters, past Z", () => {
    expect([1, 9, 10].map((n) => stepLabel(n, "numbers"))).toEqual(["1", "9", "10"]);
    expect([1, 26, 27, 28, 52, 53, 702, 703].map((n) => stepLabel(n, "letters"))).toEqual([
      "A",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });

  it("parses the start as typed", () => {
    expect(parseStepStart(" 5 ", "numbers")).toBe(5);
    expect(parseStepStart("0", "numbers")).toBeNull();
    expect(parseStepStart("C", "numbers")).toBeNull();
    expect(parseStepStart("c", "letters")).toBe(3);
    expect(parseStepStart("AA", "letters")).toBe(27);
    expect(parseStepStart("3", "letters")).toBeNull();
    for (const n of [1, 26, 27, 700])
      expect(parseStepStart(stepLabel(n, "letters"), "letters")).toBe(n);
  });

  it("numbers by creation order, not z-order, and closes gaps", () => {
    // Back to front: the newest marker was sent to the back.
    const doc = docWith(marker("c", 7), marker("a", 2), marker("b", 4));
    expect(Object.fromEntries(stepLabels(doc))).toEqual({ a: "1", b: "2", c: "3" });
    expect(nextStepSeq(doc)).toBe(8);
  });

  it("counts from the shared start and format", () => {
    const doc = docWith(
      marker("a", 1, { format: "letters", start: 3 }),
      marker("b", 2, { format: "letters", start: 3 }),
    );
    expect(Object.fromEntries(stepLabels(doc))).toEqual({ a: "C", b: "D" });
  });
});

describe("Reset styles", () => {
  const style = stepStyleOf(marker("x", 1));

  it("has nothing to do when every marker already has the style", () => {
    expect(stepResetEffect(docWith(), style)).toBe("none");
    expect(stepResetEffect(docWith(marker("a", 1), marker("b", 2)), style)).toBe("none");
  });

  it("restyles alike markers without asking", () => {
    const blue = { color: "#1e88e5" };
    expect(stepResetEffect(docWith(marker("a", 1, blue), marker("b", 2, blue)), style)).toBe(
      "uniform",
    );
  });

  it("warns when markers were styled one by one", () => {
    const doc = docWith(marker("a", 1), marker("b", 2, { size: 60 }));
    expect(stepResetEffect(doc, style)).toBe("mixed");
  });
});

describe("contrastingText", () => {
  it("picks white on dark colors and black on light ones", () => {
    expect(contrastingText("#e53935")).toBe("#ffffff");
    expect(contrastingText("#fb8c00")).toBe("#ffffff");
    expect(contrastingText("#1e88e5")).toBe("#ffffff");
    expect(contrastingText("#000000")).toBe("#ffffff");
    expect(contrastingText("#fdd835")).toBe("#000000");
    expect(contrastingText("#ffffff")).toBe("#000000");
  });
});
