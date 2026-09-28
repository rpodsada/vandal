import { describe, expect, it } from "vitest";
import { availableFonts, missingFonts } from "./fontSpec";

const installed = ["Arial", "Arial Black", "Georgia", "Segoe UI", "Segoe UI Semibold"];

describe("availableFonts", () => {
  it("leaves out fonts already in the list, ignoring case", () => {
    expect(availableFonts(installed, ["georgia", "Segoe UI"], "")).toEqual([
      "Arial",
      "Arial Black",
      "Segoe UI Semibold",
    ]);
  });

  it("matches every word of the search", () => {
    expect(availableFonts(installed, [], "segoe semi")).toEqual(["Segoe UI Semibold"]);
    expect(availableFonts(installed, [], "ARIAL")).toEqual(["Arial", "Arial Black"]);
  });
});

describe("missingFonts", () => {
  it("names listed fonts that aren't installed", () => {
    expect(missingFonts(installed, ["Georgia", "Comic Neue"])).toEqual(["Comic Neue"]);
  });

  it("reports nothing before the installed list has loaded", () => {
    expect(missingFonts([], ["Georgia"])).toEqual([]);
  });
});
