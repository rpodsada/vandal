import { describe, expect, it } from "vitest";
import { emptyDoc, type Annotation, type Doc } from "./model/types";
import { canArrange } from "./objectActions";

const line = (id: string): Annotation => ({
  id,
  kind: "line",
  from: { x: 0, y: 0 },
  to: { x: 10, y: 10 },
  style: { color: "#e53935", width: 4, opacity: 1 },
});
const withIds = (...ids: string[]): Doc => ({
  ...emptyDoc({ width: 100, height: 80 }),
  annotations: ids.map(line),
});

describe("canArrange", () => {
  it("is off for the only object", () => {
    expect(canArrange(withIds("a"), ["a"])).toBe(false);
  });

  it("is off when everything is selected", () => {
    expect(canArrange(withIds("a", "b"), ["a", "b"])).toBe(false);
  });

  it("is on with another object to go past", () => {
    expect(canArrange(withIds("a", "b"), ["a"])).toBe(true);
  });

  it("is off with nothing selected", () => {
    expect(canArrange(withIds("a", "b"), [])).toBe(false);
  });
});
