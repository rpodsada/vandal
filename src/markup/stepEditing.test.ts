import { beforeEach, describe, expect, it } from "vitest";
import { docStore } from "./model/store";
import { emptyDoc, type StepAnnotation } from "./model/types";
import { editStepLabel, finishStepLabel, resetStepNumbering } from "./stepEditing";
import { stepLabels } from "./steps";
import { useToolStore } from "./toolStore";

function addStep(seq: number, label?: string): string {
  return docStore.getState().add({
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
    label,
  });
}

const step = (id: string) =>
  docStore.getState().doc.annotations.find((a) => a.id === id) as StepAnnotation;
const labels = () => Object.fromEntries(stepLabels(docStore.getState().doc));

describe("typing a step marker's label", () => {
  beforeEach(() => {
    docStore.getState().load(emptyDoc({ width: 100, height: 100 }));
    useToolStore.setState({ labelEditing: null });
  });

  it("keeps what was typed as one undo step", () => {
    const a = addStep(1);
    const b = addStep(2);
    editStepLabel(a);
    expect(useToolStore.getState().labelEditing).toBe(a);
    expect(docStore.getState().selection).toEqual([a]);
    finishStepLabel("9");
    expect(useToolStore.getState().labelEditing).toBeNull();
    expect(labels()).toEqual({ [a]: "9", [b]: "1" });
    docStore.getState().undo();
    expect(labels()).toEqual({ [a]: "1", [b]: "2" });
  });

  it("changes nothing when cancelled or left as it was", () => {
    const a = addStep(1);
    editStepLabel(a);
    finishStepLabel(null);
    editStepLabel(a);
    finishStepLabel("1");
    expect(step(a).label).toBeUndefined();
    expect(docStore.getState().past).toHaveLength(1); // just the add
  });

  it("ignores anything but a step marker", () => {
    const r = docStore.getState().add({
      kind: "rect",
      rect: { x: 0, y: 0, width: 5, height: 5 },
      rotation: 0,
      fill: "none",
      fillColor: "#000000",
      style: { color: "#000000", width: 2, opacity: 1 },
    });
    editStepLabel(r);
    expect(useToolStore.getState().labelEditing).toBeNull();
  });

  it("Renumber drops every typed label as one undo step", () => {
    const a = addStep(1, "X");
    const b = addStep(2, "Y");
    const c = addStep(3);
    resetStepNumbering();
    expect(labels()).toEqual({ [a]: "1", [b]: "2", [c]: "3" });
    docStore.getState().undo();
    expect(labels()).toEqual({ [a]: "X", [b]: "Y", [c]: "1" });
  });
});
