import { describe, expect, expectTypeOf, it } from "vitest";
import { getIn, setIn, type Path, type PathOf } from "./path";

interface Sample {
  a: { b: boolean; c: string; n: number | null };
  top: number;
  list: string[];
}

const sample: Sample = { a: { b: true, c: "x", n: 1 }, top: 2, list: ["q"] };

describe("paths", () => {
  it("reads nested values", () => {
    expect(getIn(sample, "a.c")).toBe("x");
    expect(getIn(sample, "top")).toBe(2);
    expect(getIn(sample, "list")).toEqual(["q"]);
  });

  it("writes immutably, sharing untouched branches", () => {
    const next = setIn(sample, "a.b", false);
    expect(next.a.b).toBe(false);
    expect(sample.a.b).toBe(true);
    expect(next.a).not.toBe(sample.a);
    expect(next.list).toBe(sample.list);
    expect(setIn(sample, "top", 5).top).toBe(5);
  });

  it("types paths by value", () => {
    expectTypeOf<Path<Sample>>().toEqualTypeOf<"a.b" | "a.c" | "a.n" | "top" | "list">();
    expectTypeOf<PathOf<Sample, boolean>>().toEqualTypeOf<"a.b">();
    expectTypeOf<PathOf<Sample, number>>().toEqualTypeOf<"top">();
    expectTypeOf<PathOf<Sample, number | null>>().toEqualTypeOf<"a.n" | "top">();
  });
});
