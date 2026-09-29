// Style settings (from the host) and each tool's current style (PLAN Phase 2,
// "Style controls"): palette and width picker per tool, the shared current
// color, and what each tool remembers.

import { create } from "zustand";
import type { NumberPicker, StyleSettings } from "../shared/ipc";
import type {
  AnnotationKind,
  RedactMode,
  ShapeFill,
  SpotlightShape,
  StrokeStyle,
} from "./model/types";
import { nearestValue } from "./pickers";
import { TOOLS, useToolStore, type PaletteKey, type ToolId } from "./toolStore";

export interface StyleConfig {
  styles: StyleSettings;
  /** Tools on the global palette share one current color. */
  shareColor: boolean;
  /** Slot-number badges and shortcut tooltips on the pickers. */
  showShortcutHints: boolean;
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
    width: { control: "buttons", values: [2, 4, 6, 10] },
    font: { source: "system", fonts: [], control: "dropdown" },
    fontSize: { control: "dropdown", values: [8, 10, 12, 14, 16, 18, 20, 36, 48, 72] },
    pixelate: { control: "buttons", values: [6, 10, 16, 24] },
    blur: { control: "buttons", values: [3, 6, 10, 16] },
    spotlight: { control: "buttons", values: [30, 50, 70, 85] },
    tools: {
      highlighter: {
        palette: ["#ffeb3b", "#76ff03", "#ff4081", "#40c4ff", "#ffab40"],
        width: { control: "slider", min: 8, max: 40 },
      },
    },
  },
  shareColor: false,
  showShortcutHints: true,
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

/** The fonts the font picker offers: the custom list, or every installed font. */
export function fontChoices(cfg = useStyleConfig.getState()): string[] {
  const picker = cfg.styles.font;
  if (picker.source === "custom") return picker.fonts;
  return cfg.fonts.length ? cfg.fonts : [DEFAULT_FONT];
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

/**
 * Put `color` on the custom swatch of palette `key`. Every tool on that
 * palette with the custom swatch selected (a remembered color that isn't a
 * preset, in any of its color slots) moves to it too; tools on a preset keep
 * theirs. `undefined` empties the swatch and moves no one.
 */
export function setCustomColor(key: PaletteKey, color: string | undefined): void {
  const cfg = useStyleConfig.getState();
  useToolStore.setState((t) => {
    const next = {
      customColors: { ...t.customColors, [key]: color },
      colors: { ...t.colors },
      fillColors: { ...t.fillColors },
      sharedColor: t.sharedColor,
      textBackgroundColor: t.textBackgroundColor,
    };
    if (!color) return next;
    for (const tool of TOOLS) {
      if (tool === "select" || paletteKey(tool, cfg) !== key) continue;
      const palette = paletteFor(tool, cfg);
      if (isCustom(next.colors[tool], palette)) next.colors[tool] = color;
      if (isCustom(next.fillColors[tool], palette)) next.fillColors[tool] = color;
      if (tool === "text" && isCustom(next.textBackgroundColor, palette))
        next.textBackgroundColor = color;
    }
    if (key === "shared" && isCustom(next.sharedColor, cfg.styles.palette))
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
