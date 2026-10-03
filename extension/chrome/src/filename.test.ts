import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, domainOf, renderName, sanitizeFileName, usesNumber } from "./filename";

const ctx = {
  date: new Date(2026, 9, 2, 14, 31, 7),
  title: "Planning a three-day hut trek · Northwind Trails",
  url: "https://www.northwindtrails.example/guides/hut-trek",
  n: 7,
};

describe("renderName", () => {
  it("fills the default template", () => {
    expect(renderName(DEFAULT_TEMPLATE, ctx)).toBe(
      "Planning a three-day hut trek · Northwind Trails 2026-10-02 14-31-07",
    );
  });

  it("pads auto numbers to the token's width", () => {
    expect(renderName("shot {n} {nnn}", ctx)).toBe("shot 7 007");
  });

  it("fills the domain without www", () => {
    expect(renderName("{domain}", ctx)).toBe("northwindtrails.example");
  });

  it("leaves unknown tokens as text", () => {
    expect(renderName("{nope} {title", ctx)).toBe("{nope} {title");
  });

  it("cuts long titles at 80 characters", () => {
    const title = "a".repeat(79) + " " + "b".repeat(20);
    expect(renderName("{title}", { ...ctx, title })).toBe("a".repeat(79));
  });

  it("doesn't split an emoji when cutting", () => {
    const title = "a".repeat(79) + "😀😀";
    expect(renderName("{title}", { ...ctx, title })).toBe("a".repeat(79) + "😀");
  });

  it("uses the domain for pages without a title", () => {
    expect(renderName("{title}", { ...ctx, title: "  " })).toBe("northwindtrails.example");
  });

  it("makes characters from the title valid", () => {
    expect(renderName("{title}", { ...ctx, title: 'A/B: "C"?' })).toBe("A-B- -C--");
  });
});

describe("sanitizeFileName", () => {
  it("falls back when nothing is left", () => {
    expect(sanitizeFileName(" ... ")).toBe("Screenshot");
  });

  it("trims trailing dots and leading dots", () => {
    expect(sanitizeFileName(".hidden name.")).toBe("hidden name");
  });

  it("avoids Windows device names", () => {
    expect(sanitizeFileName("CON")).toBe("CON_");
    expect(sanitizeFileName("com1.txt")).toBe("com1.txt_");
    expect(sanitizeFileName("console")).toBe("console");
  });
});

describe("helpers", () => {
  it("spots auto numbers", () => {
    expect(usesNumber("a {nn}")).toBe(true);
    expect(usesNumber("a {nope}")).toBe(false);
  });

  it("returns no domain for bad URLs", () => {
    expect(domainOf("not a url")).toBe("");
    expect(domainOf("file:///C:/x.html")).toBe("");
  });
});
