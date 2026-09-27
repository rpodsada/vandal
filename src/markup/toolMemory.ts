// What the tools remember of their styles, as a plain object the host can
// persist (PLAN 2A.6d, `editor.rememberToolStyles`), and its careful reverse:
// a stored value from an older or newer version restores what still makes
// sense and ignores the rest.

import type { ArrowEnds, ArrowHead, ShapeFill, TextAlign } from "./model/types";
import { isTool, useToolStore, type PaletteKey, type ToolId } from "./toolStore";

/** Bumped only if a field changes meaning; new fields just appear. */
const VERSION = 1;

export interface ToolMemory {
  version: number;
  sharedColor: string | null;
  colors: Partial<Record<ToolId, string>>;
  widths: Partial<Record<ToolId, number>>;
  fills: Partial<Record<ToolId, ShapeFill>>;
  fillColors: Partial<Record<ToolId, string>>;
  customColors: Partial<Record<PaletteKey, string>>;
  arrowHead: ArrowHead;
  arrowEnds: ArrowEnds;
  fontFamily: string | null;
  fontSize: number | null;
  textBold: boolean;
  textItalic: boolean;
  textAlign: TextAlign;
  textBackground: boolean;
  textBackgroundColor: string | null;
}

/** The tools' current memory. */
export function snapshotToolMemory(): ToolMemory {
  const t = useToolStore.getState();
  return {
    version: VERSION,
    sharedColor: t.sharedColor,
    colors: t.colors,
    widths: t.widths,
    fills: t.fills,
    fillColors: t.fillColors,
    customColors: t.customColors,
    arrowHead: t.arrowHead,
    arrowEnds: t.arrowEnds,
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    textBold: t.textBold,
    textItalic: t.textItalic,
    textAlign: t.textAlign,
    textBackground: t.textBackground,
    textBackgroundColor: t.textBackgroundColor,
  };
}

const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const isSize = (v: unknown): v is number => typeof v === "number" && isFinite(v) && v > 0;
const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T);

/** A per-tool map with only known tools and valid values. */
function perTool<T, K extends string = never>(
  v: unknown,
  valid: (x: unknown) => x is T,
  extraKeys: K[] = [],
): Partial<Record<ToolId | K, T>> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(
    Object.entries(v).filter(
      ([key, x]) => (isTool(key) || (extraKeys as string[]).includes(key)) && valid(x),
    ),
  ) as Partial<Record<ToolId | K, T>>;
}

/** Restore what `stored` (a parsed ToolMemory, maybe from another version) validly holds. */
export function restoreToolMemory(stored: unknown): void {
  if (!stored || typeof stored !== "object") return;
  const s = stored as Record<string, unknown>;
  if (typeof s.version !== "number" || s.version > VERSION) return;
  const t = useToolStore.getState();
  const pick = <T>(key: string, valid: (x: unknown) => x is T, fallback: T): T =>
    valid(s[key]) ? (s[key] as T) : fallback;
  const nullable =
    <T>(valid: (x: unknown) => x is T) =>
    (x: unknown): x is T | null =>
      x === null || valid(x);
  useToolStore.setState({
    sharedColor: pick("sharedColor", nullable(isColor), t.sharedColor),
    colors: perTool(s.colors, isColor),
    widths: perTool(s.widths, isSize),
    fills: perTool(s.fills, oneOf<ShapeFill>("none", "solid", "both")),
    fillColors: perTool(s.fillColors, isColor),
    customColors: perTool(s.customColors, isColor, ["shared"]),
    arrowHead: pick("arrowHead", oneOf<ArrowHead>("filled", "open"), t.arrowHead),
    arrowEnds: pick("arrowEnds", oneOf<ArrowEnds>("end", "start", "both"), t.arrowEnds),
    fontFamily: pick(
      "fontFamily",
      nullable((x): x is string => typeof x === "string" && x.trim() !== ""),
      t.fontFamily,
    ),
    fontSize: pick("fontSize", nullable(isSize), t.fontSize),
    textBold: pick("textBold", (x): x is boolean => typeof x === "boolean", t.textBold),
    textItalic: pick("textItalic", (x): x is boolean => typeof x === "boolean", t.textItalic),
    textAlign: pick("textAlign", oneOf<TextAlign>("left", "center", "right"), t.textAlign),
    textBackground: pick(
      "textBackground",
      (x): x is boolean => typeof x === "boolean",
      t.textBackground,
    ),
    textBackgroundColor: pick("textBackgroundColor", nullable(isColor), t.textBackgroundColor),
  });
}
