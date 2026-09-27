// Style settings (from the host) and each tool's current style (PLAN Phase 2,
// "Style controls"): palette and width picker per tool, the shared current
// color, and what each tool remembers.

import { create } from "zustand";
import type { NumberPicker, StyleSettings } from "../shared/ipc";
import type { AnnotationKind, ShapeFill, StrokeStyle } from "./model/types";
import { nearestValue } from "./pickers";
import { useToolStore, type ToolId } from "./toolStore";

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
    font: { source: "system", control: "dropdown" },
    fontSize: { control: "dropdown", values: [8, 10, 12, 14, 16, 18, 20, 36, 48, 72] },
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

const DEFAULT_FONT = "Segoe UI";
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

export function rememberWidth(tool: ToolId, width: number): void {
  useToolStore.setState((t) => ({ widths: { ...t.widths, [tool]: width } }));
}
