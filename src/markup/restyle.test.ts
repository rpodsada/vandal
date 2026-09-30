import { beforeEach, describe, expect, it } from "vitest";
import { docStore } from "./model/store";
import {
  emptyDoc,
  type RedactAnnotation,
  type ShapeAnnotation,
  type SpotlightAnnotation,
  type StepAnnotation,
  type TextAnnotation,
} from "./model/types";
import {
  applyStyle,
  colorSlots,
  resetStepStyles,
  styleTarget,
  swapColors,
  targetSections,
  targetValues,
} from "./restyle";
import { useToolStore } from "./toolStore";

const style = { color: "#e53935", width: 4, opacity: 1 };

function addRect(fill: ShapeAnnotation["fill"]): string {
  const store = docStore.getState();
  const id = store.add({
    kind: "rect",
    rect: { x: 0, y: 0, width: 10, height: 10 },
    rotation: 0,
    fill,
    fillColor: "#123456",
    style,
  });
  store.select([id]);
  return id;
}

function rect(id: string): ShapeAnnotation {
  return docStore.getState().doc.annotations.find((a) => a.id === id) as ShapeAnnotation;
}

describe("applyStyle on shapes", () => {
  beforeEach(() => {
    docStore.getState().load(emptyDoc({ width: 100, height: 100 }));
    useToolStore.setState({ tool: "select", fills: {}, fillColors: {} });
  });

  it("keeps a solid shape's look when it gains a border", () => {
    const id = addRect("solid");
    applyStyle({ fill: "both" });
    expect(rect(id).fill).toBe("both");
    expect(rect(id).fillColor).toBe(style.color);
  });

  it("gives an outlined shape the tool's fill color, else its border color", () => {
    const id = addRect("none");
    applyStyle({ fill: "both" });
    expect(rect(id).fillColor).toBe(style.color);

    useToolStore.setState({ fillColors: { rect: "#00ff00" } });
    const other = addRect("none");
    applyStyle({ fill: "both" });
    expect(rect(other).fillColor).toBe("#00ff00");
  });

  it("sets border and fill separately, each one undo step", () => {
    const id = addRect("both");
    applyStyle({ fillColor: "#ffffff" });
    applyStyle({ color: "#000000" });
    expect(rect(id).fillColor).toBe("#ffffff");
    expect(rect(id).style.color).toBe("#000000");
    docStore.getState().undo();
    expect(rect(id).style.color).toBe(style.color);
    expect(rect(id).fillColor).toBe("#ffffff");
    // The tool remembers the fill for its next shape.
    expect(useToolStore.getState().fillColors.rect).toBe("#ffffff");
  });
});

describe("applyStyle on text", () => {
  beforeEach(() => {
    docStore.getState().load(emptyDoc({ width: 100, height: 100 }));
    useToolStore.setState({ tool: "select", fontSize: null, textBackground: false });
  });

  it("restyles font size, box and alignment, and the text tool remembers them", () => {
    const store = docStore.getState();
    const id = store.add({
      kind: "text",
      x: 0,
      y: 0,
      width: 100,
      autoWidth: false,
      rotation: 0,
      text: "hi",
      fontFamily: "Segoe UI",
      fontSize: 20,
      bold: false,
      italic: false,
      color: "#000000",
      align: "left",
      background: false,
      backgroundColor: "#ffffff",
    });
    store.select([id]);
    applyStyle({
      fontSize: 36,
      bold: true,
      background: true,
      backgroundColor: "#ffeb3b",
      align: "center",
    });
    const t = docStore.getState().doc.annotations.find((a) => a.id === id) as TextAnnotation;
    expect(t).toMatchObject({
      fontSize: 36,
      bold: true,
      italic: false,
      background: true,
      backgroundColor: "#ffeb3b",
      align: "center",
      width: 100, // a wrapping box keeps its width
    });
    const tools = useToolStore.getState();
    expect(tools.fontSize).toBe(36);
    expect(tools.textBold).toBe(true);
    expect(tools.textBackground).toBe(true);
    expect(tools.textBackgroundColor).toBe("#ffeb3b");
    expect(tools.textAlign).toBe("center");
  });
});

describe("applyStyle on redactions", () => {
  beforeEach(() => {
    docStore.getState().load(emptyDoc({ width: 100, height: 100 }));
    useToolStore.setState({ tool: "select", redactMode: "pixelate", redactStrengths: {} });
  });

  function addRedaction(): string {
    const store = docStore.getState();
    const id = store.add({
      kind: "redact",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      mode: "pixelate",
      strength: 16,
    });
    store.select([id]);
    return id;
  }

  const redaction = (id: string) =>
    docStore.getState().doc.annotations.find((a) => a.id === id) as RedactAnnotation;

  it("takes the new mode's strength, not the old mode's", () => {
    const id = addRedaction();
    useToolStore.setState({ redactStrengths: { blur: 10 } });
    applyStyle({ redactMode: "blur" });
    expect(redaction(id)).toMatchObject({ mode: "blur", strength: 10 });
    expect(useToolStore.getState().redactMode).toBe("blur");
  });

  it("remembers a strength for the mode it applies to", () => {
    const id = addRedaction();
    applyStyle({ strength: 24 });
    expect(redaction(id).strength).toBe(24);
    expect(useToolStore.getState().redactStrengths).toEqual({ pixelate: 24 });
  });

  it("ignores colors", () => {
    const id = addRedaction();
    const before = redaction(id);
    applyStyle({ color: "#000000" });
    expect(redaction(id)).toEqual(before);
  });
});

describe("applyStyle on spotlights", () => {
  beforeEach(() => {
    docStore.getState().load(emptyDoc({ width: 100, height: 100 }));
    useToolStore.setState({ tool: "select", spotlightShape: "rect", spotlightDim: null });
  });

  function addSpotlight(): string {
    return docStore.getState().add({
      kind: "spotlight",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      shape: "rect",
      dim: 50,
    });
  }

  const spotlight = (id: string) =>
    docStore.getState().doc.annotations.find((a) => a.id === id) as SpotlightAnnotation;

  it("changes every spotlight's darkness, selected or not", () => {
    const a = addSpotlight();
    const b = addSpotlight();
    docStore.getState().select([a]);
    applyStyle({ dim: 70 });
    expect(spotlight(a).dim).toBe(70);
    expect(spotlight(b).dim).toBe(70);
    expect(useToolStore.getState().spotlightDim).toBe(70);
  });

  it("changes existing spotlights' darkness from the tool too", () => {
    const a = addSpotlight();
    useToolStore.setState({ tool: "spotlight" });
    applyStyle({ dim: 30 });
    expect(spotlight(a).dim).toBe(30);
  });

  it("changes only the selected spotlight's shape", () => {
    const a = addSpotlight();
    const b = addSpotlight();
    docStore.getState().select([a]);
    applyStyle({ spotlightShape: "ellipse" });
    expect(spotlight(a).shape).toBe("ellipse");
    expect(spotlight(b).shape).toBe("rect");
    expect(useToolStore.getState().spotlightShape).toBe("ellipse");
  });
});

describe("applyStyle on step markers", () => {
  beforeEach(() => {
    docStore.getState().load(emptyDoc({ width: 100, height: 100 }));
    useToolStore.setState({
      tool: "select",
      stepShape: "circle",
      stepSize: null,
      stepTextColor: null,
      stepFormat: "numbers",
      stepStart: 1,
    });
  });

  function addStep(seq: number): string {
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
    });
  }

  const step = (id: string) =>
    docStore.getState().doc.annotations.find((a) => a.id === id) as StepAnnotation;

  it("restyles only the selected marker, and remembers it for the next", () => {
    const a = addStep(1);
    const b = addStep(2);
    docStore.getState().select([a]);
    applyStyle({ stepSize: 60, stepShape: "rounded", textColor: "#000000" });
    expect(step(a)).toMatchObject({ size: 60, shape: "rounded", textColor: "#000000" });
    expect(step(b)).toMatchObject({ size: 32, shape: "circle", textColor: "#ffffff" });
    expect(useToolStore.getState()).toMatchObject({
      stepSize: 60,
      stepShape: "rounded",
      stepTextColor: "#000000",
    });
  });

  it("changes every marker's format and start, selected or not", () => {
    const a = addStep(1);
    const b = addStep(2);
    docStore.getState().select([a]);
    applyStyle({ stepFormat: "letters" });
    useToolStore.setState({ tool: "step" });
    docStore.getState().select([]);
    applyStyle({ stepStart: 5 });
    expect(step(a)).toMatchObject({ format: "letters", start: 5 });
    expect(step(b)).toMatchObject({ format: "letters", start: 5 });
  });

  it("Sync style gives every marker the style, as one undo step", () => {
    const a = addStep(1);
    const b = addStep(2);
    const style = {
      shape: "square",
      size: 44,
      color: "#1e88e5",
      textColor: "#ffffff",
      fontFamily: "Segoe UI",
    } as const;
    resetStepStyles(style);
    expect(step(a)).toMatchObject(style);
    expect(step(b)).toMatchObject(style);
    docStore.getState().undo();
    expect(step(a).size).toBe(32);
    expect(step(b).color).toBe("#e53935");
  });
});

describe("colorSlots", () => {
  beforeEach(() => {
    docStore.getState().load(emptyDoc({ width: 100, height: 100 }));
    useToolStore.setState({ tool: "select" });
  });

  const slotsNow = () => {
    const target = styleTarget()!;
    return colorSlots(targetValues(target, docStore.getState().doc), targetSections(target));
  };

  it("puts a shape's fill first and its border second, with both", () => {
    addRect("both");
    expect(slotsNow()).toEqual({
      kind: "shape",
      first: { key: "fillColor", value: "#123456" },
      second: { key: "color", value: "#e53935" },
    });
  });

  it("has one color for a shape with only a border or a fill", () => {
    addRect("solid");
    expect(slotsNow()).toMatchObject({ kind: "single", first: { key: "color" }, second: null });
  });

  it("sets the fill from the first slot", () => {
    const id = addRect("both");
    applyStyle({ [slotsNow().first.key]: "#00ff00" });
    expect(rect(id).fillColor).toBe("#00ff00");
    expect(rect(id).style.color).toBe("#e53935");
  });
});

describe("swapColors", () => {
  beforeEach(() => {
    docStore.getState().load(emptyDoc({ width: 100, height: 100 }));
    useToolStore.setState({ tool: "select", colors: {}, fills: {}, fillColors: {} });
  });

  it("swaps a selected shape's fill and border as one undo step", () => {
    const id = addRect("both");
    expect(swapColors()).toBe(true);
    expect(rect(id).fillColor).toBe("#e53935");
    expect(rect(id).style.color).toBe("#123456");
    docStore.getState().undo();
    expect(rect(id).fillColor).toBe("#123456");
  });

  it("swaps each selected object's own colors", () => {
    const a = addRect("both");
    const b = docStore.getState().add({
      kind: "rect",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      rotation: 0,
      fill: "both",
      fillColor: "#00ff00",
      style: { ...style, color: "#0000ff" },
    });
    docStore.getState().select([a, b]);
    swapColors();
    expect(rect(a)).toMatchObject({ fillColor: "#e53935", style: { color: "#123456" } });
    expect(rect(b)).toMatchObject({ fillColor: "#0000ff", style: { color: "#00ff00" } });
    expect(docStore.getState().past).toHaveLength(3); // two adds and the swap
  });

  it("swaps the tool's colors with nothing selected", () => {
    useToolStore.setState({
      tool: "rect",
      colors: { rect: "#111111" },
      fills: { rect: "both" },
      fillColors: { rect: "#222222" },
    });
    expect(swapColors()).toBe(true);
    const t = useToolStore.getState();
    expect(t.colors.rect).toBe("#222222");
    expect(t.fillColors.rect).toBe("#111111");
  });

  it("does nothing without two colors", () => {
    addRect("none");
    expect(swapColors()).toBe(false);
    expect(docStore.getState().past).toHaveLength(1);
  });
});
