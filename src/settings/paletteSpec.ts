// Editing a color palette in Settings (PLAN 2C.2): reordering and checks.
// Rust normalizes too; this keeps the editor from sending what it would drop.

export const MAX_COLORS = 10;

/** `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

/**
 * Where the swatch dragged from `from` lands with the pointer at `x`, given
 * the swatch centers when the drag started: after every other swatch whose
 * center the pointer is past.
 */
export function dropIndex(centers: readonly number[], from: number, x: number): number {
  return centers.filter((c, i) => i !== from && x > c).length;
}

/** Why `color` can't go in at `index` (null: a new one), if it can't. */
export function paletteError(colors: readonly string[], color: string, index: number | null) {
  const at = colors.findIndex((c) => c.toLowerCase() === color.toLowerCase());
  if (at !== -1 && at !== index) return "That color is already in the palette.";
  if (index === null && colors.length >= MAX_COLORS)
    return `The palette is full (${MAX_COLORS} colors).`;
  return null;
}
