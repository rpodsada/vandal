// Editing the font list in Settings (PLAN 2C.3).

/** Most fonts a stepped slider shows (keys Alt+1–9, Alt+0). */
export const MAX_STEPPED_FONTS = 10;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Installed fonts not yet in `list`, matching every word of `query`. */
export function availableFonts(
  installed: readonly string[],
  list: readonly string[],
  query: string,
): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return installed.filter(
    (f) => !list.some((l) => same(l, f)) && words.every((w) => f.toLowerCase().includes(w)),
  );
}

/** Fonts in `list` that aren't installed (a list carried from another PC, say). */
export function missingFonts(installed: readonly string[], list: readonly string[]): string[] {
  // Until the installed list arrives, nothing is missing.
  if (installed.length === 0) return [];
  return list.filter((l) => !installed.some((f) => same(f, l)));
}
