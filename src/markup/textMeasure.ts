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
