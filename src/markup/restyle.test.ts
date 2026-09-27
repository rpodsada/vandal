import { beforeEach, describe, expect, it } from "vitest";
import { docStore } from "./model/store";
import { emptyDoc, type ShapeAnnotation, type TextAnnotation } from "./model/types";
import { applyStyle } from "./restyle";
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
