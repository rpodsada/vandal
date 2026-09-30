// Style settings (from the host) and each tool's current style (PLAN Phase 2,
// "Style controls"): palette and width picker per tool, the shared current
// color, and what each tool remembers.

import { create } from "zustand";
import type { NumberPicker, StyleSettings } from "../shared/ipc";

type FontPicker = StyleSettings["font"];
import type {
  AnnotationKind,
  CalloutEnd,
  CalloutShape,
  Doc,
  RedactMode,
  ShapeFill,
  SpotlightShape,
  StepFormat,
  StrokeStyle,
  TextAlign,
} from "./model/types";
import { nearestValue } from "./pickers";
import type { ColorKey } from "./restyle";
import { contrastingText, stepsOf, type StepStyle } from "./steps";
import { TOOLS, useToolStore, type PaletteKey, type ToolId } from "./toolStore";

export interface StyleConfig {
  styles: StyleSettings;
  /** Tools on the global palette share one current color. */
  shareColor: boolean;
  /** Slot-number badges and shortcut tooltips on the pickers. */
  showShortcutHints: boolean;
  /** Number buttons show their unit (`editor.showButtonUnits`). */
  showButtonUnits: boolean;
  /** Drawing tools select an object pressed on (else they draw over it); Ctrl flips it. */
  drawingToolsSelect: boolean;
  /** Installed font families (from the host), for the system font picker. */
  fonts: string[];
}

/** The Rust defaults (`styles.rs`), used until the host passes the real settings. */
export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  styles: {
    palette: [
      "#e53935",
      "#fb8c00",
      "#fdd835",
      "#43a047",
      "#1e88e5",
      "#8e24aa",
      "#000000",
      "#ffffff",
    ],
    colorControl: "swatches",
    width: { control: "buttons", values: [2, 4, 6, 10] },
    font: { source: "system", fonts: [], control: "dropdown" },
    fontSize: { control: "dropdown", values: [8, 10, 12, 14, 16, 18, 20, 36, 48, 72] },
    pixelate: { control: "buttons", values: [6, 10, 16, 24] },
    blur: { control: "buttons", values: [3, 6, 10, 16] },
    spotlight: { control: "buttons", values: [30, 50, 70, 85] },
    stepSize: { control: "buttons", values: [24, 32, 44, 60] },
    // Never buttons, and 0 is always a choice (Rust keeps it so).
    cornerRadius: { control: "dropdown", values: [0, 5, 10, 15, 20] },
    stepFont: { source: "text", fonts: [], control: "dropdown" },
    tools: {
      highlighter: {
        palette: ["#ffeb3b", "#76ff03", "#ff4081", "#40c4ff", "#ffab40"],
        width: { control: "slider", min: 8, max: 40 },
        colorControl: null,
      },
    },
  },
  shareColor: false,
  showShortcutHints: true,
  showButtonUnits: false,
  drawingToolsSelect: true,
  fonts: [],
};

/** Set by the host from settings (and kept in step with `SettingsChanged`). */
export const useStyleConfig = create<StyleConfig>(() => DEFAULT_STYLE_CONFIG);

/** The width a tool starts with before the user picks one (nearest the picker allows). */
const PREFERRED_WIDTH: Partial<Record<ToolId, number>> = { highlighter: 20 };
const DEFAULT_WIDTH = 4;

/** The tool that draws each kind: its pickers and memory apply to that kind. */
export const TOOL_FOR_KIND: Record<AnnotationKind, ToolId> = {
  pen: "pen",
  highlighter: "highlighter",
  line: "line",
  arrow: "arrow",
  rect: "rect",
  ellipse: "ellipse",
  text: "text",
  redact: "redact",
  spotlight: "spotlight",
  step: "step",
  callout: "callout",
};

function override(tool: ToolId, cfg: StyleConfig) {
  return cfg.styles.tools[tool];
}

export function hasOwnPalette(tool: ToolId, cfg = useStyleConfig.getState()): boolean {
  return !!override(tool, cfg)?.palette;
}

export function paletteFor(tool: ToolId, cfg = useStyleConfig.getState()): string[] {
  return override(tool, cfg)?.palette ?? cfg.styles.palette;
}

/** How the options bar shows a tool's colors: its own choice, else the global one (PLAN 3D.16). */
export function colorControlFor(
  tool: ToolId,
  cfg = useStyleConfig.getState(),
): StyleSettings["colorControl"] {
  return override(tool, cfg)?.colorControl ?? cfg.styles.colorControl;
}

export function widthPickerFor(tool: ToolId, cfg = useStyleConfig.getState()): NumberPicker {
  return override(tool, cfg)?.width ?? cfg.styles.width;
}

/** The color a tool draws with now. */
export function toolColor(tool: ToolId): string {
  const cfg = useStyleConfig.getState();
  const t = useToolStore.getState();
  const shared = cfg.shareColor && !hasOwnPalette(tool, cfg);
  return (shared ? t.sharedColor : t.colors[tool]) ?? paletteFor(tool, cfg)[0];
}

/** The line width a tool draws with now. */
export function toolWidth(tool: ToolId): number {
  const picked = useToolStore.getState().widths[tool];
  return picked ?? nearestValue(widthPickerFor(tool), PREFERRED_WIDTH[tool] ?? DEFAULT_WIDTH);
}

/** The fonts a font picker offers: its custom list, or every installed font. */
function pickerFonts(picker: FontPicker, cfg: StyleConfig): string[] {
  if (picker.source === "custom") return picker.fonts;
  return cfg.fonts.length ? cfg.fonts : [DEFAULT_FONT];
}

/** The fonts the text tool's font picker offers. */
export function fontChoices(cfg = useStyleConfig.getState()): string[] {
  return pickerFonts(cfg.styles.font, cfg);
}

/** The step markers' font picker as it behaves: "Same as Text tool" is the text tool's. */
export function stepFontPicker(cfg = useStyleConfig.getState()): FontPicker {
  const picker = cfg.styles.stepFont;
  return picker.source === "text" ? cfg.styles.font : picker;
}

/** The fonts the step markers' font picker offers. */
export function stepFontChoices(cfg = useStyleConfig.getState()): string[] {
  return pickerFonts(stepFontPicker(cfg), cfg);
}

/** The text tool's font when nothing else says. */
export const DEFAULT_FONT = "Segoe UI";
const DEFAULT_FONT_SIZE = 20;
/** The default box color behind text. */
export const DEFAULT_TEXT_BACKGROUND = "#ffffff";

/** The text tool's font family and size (pt). */
export function toolFont(): { family: string; size: number } {
  const cfg = useStyleConfig.getState();
  const t = useToolStore.getState();
  const custom = cfg.styles.font.source === "custom" ? cfg.styles.font.fonts : null;
  return {
    family: t.fontFamily ?? custom?.[0] ?? DEFAULT_FONT,
    size: t.fontSize ?? nearestValue(cfg.styles.fontSize, DEFAULT_FONT_SIZE),
  };
}

/** A shape tool's fill mode, and its fill color for "both" (null: not picked yet). */
export function toolFill(tool: ToolId): { fill: ShapeFill; color: string | null } {
  const t = useToolStore.getState();
  return { fill: t.fills[tool] ?? "none", color: t.fillColors[tool] ?? null };
}

export function toolStroke(tool: ToolId): StrokeStyle {
  return { color: toolColor(tool), width: toolWidth(tool), opacity: 1 };
}

export function rememberColor(tool: ToolId, color: string): void {
  const shared = useStyleConfig.getState().shareColor && !hasOwnPalette(tool);
  useToolStore.setState((t) =>
    shared ? { sharedColor: color } : { colors: { ...t.colors, [tool]: color } },
  );
}

/** Which palette a tool uses: its own, or the shared one. */
export function paletteKey(tool: ToolId, cfg = useStyleConfig.getState()): PaletteKey {
  return hasOwnPalette(tool, cfg) ? tool : "shared";
}

/** Which of the chip's colors (the only one, when there's one). */
export type ColorSlotPosition = "first" | "second";

/**
 * Put `color` on the custom swatch of palette `key`, for the chip's `slot`:
 * the first and second colors each have their own (PLAN 3D.14). Every tool on
 * that palette whose color in the same position is on the custom swatch (a
 * remembered color that isn't a preset) moves to it too; tools on a preset,
 * and the other position, keep theirs. `undefined` empties the swatch and
 * moves no one. `colorKey` is what the color sets on the current target: the
 * shared current color moves only with `color`.
 */
export function setCustomColor(
  key: PaletteKey,
  color: string | undefined,
  slot: ColorSlotPosition = "first",
  colorKey: ColorKey = "color",
): void {
  const cfg = useStyleConfig.getState();
  useToolStore.setState((t) => {
    const next = {
      customColors: slot === "first" ? { ...t.customColors, [key]: color } : t.customColors,
      customSecondColors:
        slot === "second" ? { ...t.customSecondColors, [key]: color } : t.customSecondColors,
      colors: { ...t.colors },
      fillColors: { ...t.fillColors },
      sharedColor: t.sharedColor,
      textBackgroundColor: t.textBackgroundColor,
      stepTextColor: t.stepTextColor,
      calloutTextColor: t.calloutTextColor,
    };
    if (!color) return next;
    for (const tool of TOOLS) {
      if (tool === "select" || paletteKey(tool, cfg) !== key) continue;
      const palette = paletteFor(tool, cfg);
      const onCustom = (c: string | null | undefined) => isCustom(c, palette);
      // Where each chip color lives in the tool's memory (see colorSlots).
      const both = (tool === "rect" || tool === "ellipse") && t.fills[tool] === "both";
      if (slot === "first") {
        if (both) {
          if (onCustom(next.fillColors[tool])) next.fillColors[tool] = color;
        } else if (tool === "step") {
          if (onCustom(next.stepTextColor)) next.stepTextColor = color;
        } else if (tool === "callout") {
          if (onCustom(next.calloutTextColor)) next.calloutTextColor = color;
        } else if (onCustom(next.colors[tool])) {
          next.colors[tool] = color;
        }
      } else if (both || tool === "step" || tool === "callout") {
        if (onCustom(next.colors[tool])) next.colors[tool] = color;
      } else if (tool === "text") {
        if (onCustom(next.textBackgroundColor)) next.textBackgroundColor = color;
      }
    }
    if (key === "shared" && colorKey === "color" && isCustom(next.sharedColor, cfg.styles.palette))
      next.sharedColor = color;
    return next;
  });
}

/** A remembered color that isn't one of the presets. */
function isCustom(c: string | null | undefined, palette: string[]): boolean {
  return !!c && !palette.some((p) => p.toLowerCase() === c.toLowerCase());
}

/** Each redact mode's strength picker (block size, blur radius). */
export function strengthPickerFor(mode: RedactMode, cfg = useStyleConfig.getState()): NumberPicker {
  return mode === "pixelate" ? cfg.styles.pixelate : cfg.styles.blur;
}

/** The strength a redaction starts with before one is picked. */
const PREFERRED_STRENGTH: Record<RedactMode, number> = { pixelate: 10, blur: 6 };

/** Redact's mode and that mode's strength now. */
export function toolRedact(mode?: RedactMode): { mode: RedactMode; strength: number } {
  const t = useToolStore.getState();
  const m = mode ?? t.redactMode;
  return {
    mode: m,
    strength: t.redactStrengths[m] ?? nearestValue(strengthPickerFor(m), PREFERRED_STRENGTH[m]),
  };
}

/** The corner radius a tool starts with before one is picked: square, but callouts a little round. */
const PREFERRED_CORNER: Partial<Record<ToolId, number>> = { callout: 5 };

/** A rectangle's, spotlight's or callout's corner radius now. */
export function toolCornerRadius(tool: ToolId): number {
  const picker = useStyleConfig.getState().styles.cornerRadius;
  return (
    useToolStore.getState().cornerRadii[tool] ?? nearestValue(picker, PREFERRED_CORNER[tool] ?? 0)
  );
}

/** The radius a rectangle is drawn with: at most half its shorter side. */
export function drawnCornerRadius(radius: number | undefined, width: number, height: number) {
  return Math.max(0, Math.min(radius ?? 0, Math.abs(width) / 2, Math.abs(height) / 2));
}

/** The darkness a spotlight starts with before one is picked (%). */
const PREFERRED_DIM = 50;

/** Spotlight's shape and darkness now. */
export function toolSpotlight(): { shape: SpotlightShape; dim: number } {
  const t = useToolStore.getState();
  const picker = useStyleConfig.getState().styles.spotlight;
  return { shape: t.spotlightShape, dim: t.spotlightDim ?? nearestValue(picker, PREFERRED_DIM) };
}

export function rememberWidth(tool: ToolId, width: number): void {
  useToolStore.setState((t) => ({ widths: { ...t.widths, [tool]: width } }));
}

const PREFERRED_STEP_SIZE = 32;

/** The next step marker's style. */
export function toolStepStyle(): StepStyle {
  const t = useToolStore.getState();
  const cfg = useStyleConfig.getState();
  const color = toolColor("step");
  const fonts = stepFontPicker(cfg);
  return {
    shape: t.stepShape,
    size: t.stepSize ?? nearestValue(cfg.styles.stepSize, PREFERRED_STEP_SIZE),
    color,
    textColor: t.stepTextColor ?? contrastingText(color),
    fontFamily: t.stepFont ?? (fonts.source === "custom" ? fonts.fonts[0] : null) ?? DEFAULT_FONT,
  };
}

/** The labels' format and start: the document's markers', or the tool's for a first one. */
export function stepNumbering(doc: Doc): { format: StepFormat; start: number } {
  const [first] = stepsOf(doc);
  const t = useToolStore.getState();
  return first
    ? { format: first.format, start: first.start }
    : { format: t.stepFormat, start: t.stepStart };
}

/** A callout's style, as the tool would draw the next one (PLAN 3E). */
export interface CalloutStyle {
  shape: CalloutShape;
  color: string;
  textColor: string;
  lineWidth: number;
  cornerRadius: number;
  end: CalloutEnd;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
}

/** The next callout's style: its own memory, else the text tool's font and size. */
export function toolCalloutStyle(): CalloutStyle {
  const t = useToolStore.getState();
  const color = toolColor("callout");
  const font = toolFont();
  return {
    shape: "box",
    color,
    textColor: t.calloutTextColor ?? contrastingText(color),
    lineWidth: toolWidth("callout"),
    cornerRadius: toolCornerRadius("callout"),
    end: "line",
    fontFamily: t.calloutFont ?? font.family,
    fontSize: t.calloutFontSize ?? font.size,
    bold: t.calloutBold,
    italic: t.calloutItalic,
    align: t.calloutAlign,
  };
}
