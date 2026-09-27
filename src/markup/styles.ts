// Style settings (from the host) and each tool's current style (PLAN Phase 2,
// "Style controls"): palette and width picker per tool, the shared current
// color, and what each tool remembers.

import { create } from "zustand";
import type { NumberPicker, StyleSettings } from "../shared/ipc";
import type { AnnotationKind, StrokeStyle } from "./model/types";
import { nearestValue } from "./pickers";
import { useToolStore, type ToolId } from "./toolStore";

export interface StyleConfig {
  styles: StyleSettings;
  /** Tools on the global palette share one current color. */
  shareColor: boolean;
  /** Slot-number badges and shortcut tooltips on the pickers. */
  showShortcutHints: boolean;
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
    tools: {
      highlighter: {
        palette: ["#ffeb3b", "#76ff03", "#ff4081", "#40c4ff", "#ffab40"],
        width: { control: "slider", min: 8, max: 40 },
      },
    },
  },
  shareColor: true,
  showShortcutHints: true,
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
