import { describe, expect, it } from "vitest";
import { blockedReason } from "./pages";

describe("blockedReason", () => {
  it("allows ordinary pages", () => {
    expect(blockedReason("https://example.com/")).toBeNull();
    expect(blockedReason("http://localhost:1420/")).toBeNull();
    expect(blockedReason("file:///C:/notes.html")).toBeNull();
  });

  it("blocks the browser's own pages", () => {
    for (const url of ["chrome://settings", "edge://newtab/", "about:blank", "view-source:x"])
      expect(blockedReason(url)).toMatch(/own pages/);
  });

  it("blocks the extension stores", () => {
    expect(blockedReason("https://chromewebstore.google.com/detail/x")).toMatch(/store/);
    expect(blockedReason("https://microsoftedge.microsoft.com/addons/detail/x")).toMatch(/store/);
  });

  it("blocks tabs without a URL", () => {
    expect(blockedReason(undefined)).not.toBeNull();
  });
});
