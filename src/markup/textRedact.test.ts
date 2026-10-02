import { describe, expect, it } from "vitest";
import type { OcrLine } from "../shared/ipc";
import { LINE_PAD, layoutText, lineRects, nearestWord, wordAt, wordRange } from "./textRedact";

const word = (text: string, x: number, y: number, width: number, height: number) => ({
  text,
  rect: { x, y, width, height },
});

// Two lines; the second has a short word ("a") whose box is only x-height.
const LINES: OcrLine[] = [
  { words: [word("Hello", 10, 10, 40, 12), word("world", 56, 10, 40, 12)] },
  { words: [word("a", 10, 34, 6, 7), word("test", 22, 30, 28, 14)] },
];

describe("text redaction", () => {
  const layout = layoutText(LINES);

  it("numbers words in reading order and pads each line to its tallest word", () => {
    expect(layout.words.map((w) => [w.text, w.order, w.line])).toEqual([
      ["Hello", 0, 0],
      ["world", 1, 0],
      ["a", 2, 1],
      ["test", 3, 1],
    ]);
    expect(layout.lines[1]).toMatchObject({ top: 30 - LINE_PAD, bottom: 44 + LINE_PAD });
  });

  it("finds the word under the pointer by the line's height, not the word's", () => {
    // Above the "a"'s own box but within its line.
    expect(wordAt(layout, { x: 12, y: 31 }, 0)?.text).toBe("a");
    expect(wordAt(layout, { x: 52, y: 15 }, 0)).toBeNull(); // the gap between words
    expect(wordAt(layout, { x: 52, y: 15 }, 3)?.text).toBe("Hello");
  });

  it("takes the nearest word between words, preferring the same line", () => {
    expect(nearestWord(layout, { x: 200, y: 16 })?.text).toBe("world");
    expect(nearestWord(layout, { x: 30, y: 27 })?.text).toBe("test");
  });

  it("selects a range either way round", () => {
    const [hello, , , test] = layout.words;
    const names = (ws: { text: string }[]) => ws.map((w) => w.text);
    expect(names(wordRange(layout, hello, test))).toEqual(["Hello", "world", "a", "test"]);
    expect(names(wordRange(layout, test, hello))).toEqual(["Hello", "world", "a", "test"]);
  });

  it("makes one padded rect per line, the line's full height", () => {
    const [, world, a, test] = layout.words;
    expect(lineRects(layout, [world, a, test])).toEqual([
      { x: 56 - LINE_PAD, y: 10 - LINE_PAD, width: 40 + 2 * LINE_PAD, height: 12 + 2 * LINE_PAD },
      { x: 10 - LINE_PAD, y: 30 - LINE_PAD, width: 40 + 2 * LINE_PAD, height: 14 + 2 * LINE_PAD },
    ]);
  });

  it("skips empty lines", () => {
    expect(layoutText([{ words: [] }, ...LINES]).lines).toHaveLength(2);
  });
});
