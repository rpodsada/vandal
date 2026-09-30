import { beforeEach, describe, expect, it } from "vitest";
import {
  colorControlFor,
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
      fills: { ellipse: "both" },
      fillColors: { ellipse: "#abcdef" },
    });
    setCustomColor("shared", "#00ff00");
    const t = useToolStore.getState();
    expect(t.customColors).toEqual({ shared: "#00ff00" });
    expect(t.colors.rect).toBe("#00ff00"); // was on the old custom color
    expect(t.colors.arrow).toBe("#1e88e5"); // a preset: kept
    // An ellipse with border and fill: its fill is its first color.
    expect(t.fillColors.ellipse).toBe("#00ff00");
    // The highlighter has its own palette, and its own custom swatch.
    expect(t.colors.highlighter).toBe("#654321");
  });

  it("keeps a custom color for each of the chip's colors", () => {
    // A step marker's label (first) and marker (second) both custom.
    useToolStore.setState({ stepTextColor: "#00ff00", colors: { step: "#123456" } });
    setCustomColor("shared", "#abcdef", "second");
    let t = useToolStore.getState();
    expect(t.colors.step).toBe("#abcdef");
    expect(t.stepTextColor).toBe("#00ff00"); // the other color: kept
    expect(t.customSecondColors).toEqual({ shared: "#abcdef" });
    expect(t.customColors).toEqual({});

    setCustomColor("shared", "#fedcba", "first");
    t = useToolStore.getState();
    expect(t.stepTextColor).toBe("#fedcba");
    expect(t.colors.step).toBe("#abcdef");
    expect(t.customColors).toEqual({ shared: "#fedcba" });
  });

  it("moves text's box color only as a second color", () => {
    useToolStore.setState({ colors: { text: "#111111" }, textBackgroundColor: "#222222" });
    setCustomColor("shared", "#333333", "second");
    const t = useToolStore.getState();
    expect(t.textBackgroundColor).toBe("#333333");
    expect(t.colors.text).toBe("#111111");
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

describe("colorControlFor", () => {
  it("uses a tool's own choice, else the one for all tools", () => {
    useStyleConfig.setState(
      {
        ...DEFAULT_STYLE_CONFIG,
        styles: {
          ...DEFAULT_STYLE_CONFIG.styles,
          colorControl: "dropdown",
          tools: {
            ...DEFAULT_STYLE_CONFIG.styles.tools,
            step: { palette: null, width: null, colorControl: "swatches" },
          },
        },
      },
      true,
    );
    expect(colorControlFor("pen")).toBe("dropdown");
    expect(colorControlFor("highlighter")).toBe("dropdown"); // own palette, no own choice
    expect(colorControlFor("step")).toBe("swatches");
  });
});
