// Text measurement shared by the text editor and restyling, done the way
// Konva's canvas text measures, so a growing box fits its canvas text.

let ctx: CanvasRenderingContext2D | null = null;

/** Konva's `fontStyle` (and the CSS font prefix) for bold and italic. */
export function textFontStyle(bold: boolean, italic: boolean): string {
  return [italic && "italic", bold && "bold"].filter(Boolean).join(" ") || "normal";
}

/** Width in px of the longest line of `text` in this font. */
export function measureTextWidth(
  text: string,
  px: number,
  family: string,
  bold = false,
  italic = false,
): number {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${textFontStyle(bold, italic)} ${px}px "${family}"`;
  return Math.max(0, ...text.split("\n").map((line) => ctx!.measureText(line).width));
}

/** Padding of a text's background box, in source px, for a font size in px. */
export function textBoxPadding(px: number): number {
  return Math.round(px * 0.3);
}

/** A font's vertical metrics, as a share of its size. */
export interface FontMetrics {
  /** The font's ascent and descent: Konva centres them on each line box. */
  ascent: number;
  descent: number;
  capHeight: number;
  xHeight: number;
}

/**
 * How far below a line box's centre a font's letters are centred, as a share
 * of its size: halfway between its capitals' and its lowercase letters'
 * middles. That's the centre Richard picked by eye for Segoe UI (mixed case)
 * and Instruction (capitals only); fonts with less room above the letters,
 * like Arial and Helvetica, need about half as much.
 */
export function lettersDrop(m: FontMetrics): number {
  return (m.ascent - m.descent) / 2 - (m.capHeight + m.xHeight) / 4;
}

const drops = new Map<string, number>();

/**
 * {@link lettersDrop} in px for text of size `px` in this font, measured by
 * the canvas as Konva's text does. 0 where there's no canvas (unit tests).
 */
export function textDrop(px: number, family: string, bold = false, italic = false): number {
  const key = `${textFontStyle(bold, italic)} 100px "${family}"`;
  let drop = drops.get(key);
  if (drop === undefined) {
    if (typeof document === "undefined") return 0;
    ctx ??= document.createElement("canvas").getContext("2d");
    if (!ctx) return 0;
    ctx.font = key;
    const m = ctx.measureText("M");
    drop = lettersDrop({
      ascent: m.fontBoundingBoxAscent / 100,
      descent: m.fontBoundingBoxDescent / 100,
      capHeight: ctx.measureText("H").actualBoundingBoxAscent / 100,
      xHeight: ctx.measureText("x").actualBoundingBoxAscent / 100,
    });
    drops.set(key, drop);
  }
  return drop * px;
}
