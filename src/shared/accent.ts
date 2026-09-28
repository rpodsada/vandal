// Accent colors (PLAN 3A.2): from one picked color, the shade to use on
// light backgrounds, the shade for dark ones, and the text color on each.
// The Windows accent comes with Windows' own shades instead.

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance, 0–1. */
function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `hex` moved `amount` (0–1) of the way to `toward`. */
function mix(hex: string, toward: string, amount: number): string {
  const a = parse(hex);
  const b = parse(toward);
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as Rgb);
}

/** The first of `hex` mixed ever further toward `toward` that meets `ok`. */
function adjust(hex: string, toward: string, ok: (c: string) => boolean): string {
  for (let step = 0; step <= 20; step++) {
    const c = mix(hex, toward, step * 0.05);
    if (ok(c)) return c;
  }
  return mix(hex, toward, 1);
}

/** Backgrounds the accent sits on (theme.css `--surface` / `--bg`). */
const LIGHT_BG = "#fbfbfb";
const DARK_BG = "#202020";

export interface AccentShades {
  /** For light mode: dark enough to read against light surfaces. */
  light: string;
  /** For dark mode: light enough to read against dark surfaces. */
  dark: string;
}

/** Shades of a picked accent that stand out in each theme, like Windows' own. */
export function accentShades(hex: string): AccentShades {
  return {
    light: adjust(hex, "#000000", (c) => contrast(c, LIGHT_BG) >= 3.5),
    dark: adjust(hex, "#ffffff", (c) => contrast(c, DARK_BG) >= 6),
  };
}

/** Text on an accent-filled button: white or near-black, whichever reads better. */
export function onAccent(hex: string): string {
  return contrast(hex, "#ffffff") >= contrast(hex, "#111111") ? "#ffffff" : "#111111";
}
