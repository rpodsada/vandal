import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_STYLE_CONFIG, setCustomColor, useStyleConfig } from "./styles";
import { useToolStore } from "./toolStore";

const initial = useToolStore.getState();

describe("setCustomColor", () => {
  beforeEach(() => {
    useToolStore.setState(initial, true);
    useStyleConfig.setState(DEFAULT_STYLE_CONFIG, true);
  });

  it("moves the tools on the custom swatch, not the ones on a preset", () => {
    useToolStore.setState({
      colors: { rect: "#123456", arrow: "#1e88e5", highlighter: "#654321" },
      fillColors: { ellipse: "#abcdef" },
      textBackgroundColor: "#fedcba",
    });
    setCustomColor("shared", "#00ff00");
    const t = useToolStore.getState();
    expect(t.customColors).toEqual({ shared: "#00ff00" });
    expect(t.colors.rect).toBe("#00ff00"); // was on the old custom color
    expect(t.colors.arrow).toBe("#1e88e5"); // a preset: kept
    expect(t.fillColors.ellipse).toBe("#00ff00");
    expect(t.textBackgroundColor).toBe("#00ff00");
    // The highlighter has its own palette, and its own custom swatch.
    expect(t.colors.highlighter).toBe("#654321");
  });

  it("empties the swatch without moving anyone", () => {
    useToolStore.setState({ colors: { rect: "#123456" }, customColors: { shared: "#123456" } });
    setCustomColor("shared", undefined);
    const t = useToolStore.getState();
    expect(t.customColors.shared).toBeUndefined();
    expect(t.colors.rect).toBe("#123456");
  });
});
