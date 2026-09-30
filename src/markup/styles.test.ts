import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE_CONFIG,
  setCustomColor,
  stepFontChoices,
  toolStepStyle,
  useStyleConfig,
} from "./styles";
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

describe("step marker fonts", () => {
  beforeEach(() => {
    useToolStore.setState(initial, true);
    useStyleConfig.setState(DEFAULT_STYLE_CONFIG, true);
  });

  const withFonts = (font: object, stepFont: object) =>
    useStyleConfig.setState({
      ...DEFAULT_STYLE_CONFIG,
      fonts: ["Arial", "Georgia", "Segoe UI"],
      styles: {
        ...DEFAULT_STYLE_CONFIG.styles,
        font: { ...DEFAULT_STYLE_CONFIG.styles.font, ...font },
        stepFont: { ...DEFAULT_STYLE_CONFIG.styles.stepFont, ...stepFont },
      },
    });

  it("follow the text tool's list by default, starting from its first font", () => {
    withFonts({ source: "custom", fonts: ["Georgia", "Arial"] }, {});
    expect(stepFontChoices()).toEqual(["Georgia", "Arial"]);
    expect(toolStepStyle().fontFamily).toBe("Georgia");
  });

  it("can have their own list, or every installed font", () => {
    withFonts({ source: "custom", fonts: ["Georgia"] }, { source: "custom", fonts: ["Arial"] });
    expect(stepFontChoices()).toEqual(["Arial"]);
    expect(toolStepStyle().fontFamily).toBe("Arial");
    withFonts({}, { source: "system" });
    expect(stepFontChoices()).toEqual(["Arial", "Georgia", "Segoe UI"]);
    expect(toolStepStyle().fontFamily).toBe("Segoe UI");
  });

  it("keep the font picked last", () => {
    withFonts({}, {});
    useToolStore.setState({ stepFont: "Georgia" });
    expect(toolStepStyle().fontFamily).toBe("Georgia");
  });
});
