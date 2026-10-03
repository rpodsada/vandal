// File names for saved captures (PLAN 3N): the extension's own template,
// with Vandal's date, time and auto-number tokens plus {title} and {domain}.
// Vandal's rules for valid names are mirrored from src-tauri/src/output.rs.

export const DEFAULT_TEMPLATE = "{title} {yyyy}-{MM}-{dd} {HH}-{mm}-{ss}";
export const DEFAULT_FOLDER = "Vandal";

/** Page titles are cut to this many characters in a name. */
const TITLE_MAX = 80;

export interface NameContext {
  date: Date;
  title: string;
  url: string;
  /** The auto number for `{n}`, `{nn}`, `{nnn}`... */
  n: number;
}

/** The template filled in, as a valid file name without extension. */
export function renderName(template: string, ctx: NameContext): string {
  const pad = (v: number, width = 2) => String(v).padStart(width, "0");
  const d = ctx.date;
  const name = template.replace(
    /\{(yyyy|MM|dd|HH|mm|ss|title|domain|n+)\}/g,
    (_, token: string) => {
      switch (token) {
        case "yyyy":
          return pad(d.getFullYear(), 4);
        case "MM":
          return pad(d.getMonth() + 1);
        case "dd":
          return pad(d.getDate());
        case "HH":
          return pad(d.getHours());
        case "mm":
          return pad(d.getMinutes());
        case "ss":
          return pad(d.getSeconds());
        case "title":
          return cutTitle(ctx.title) || domainOf(ctx.url);
        case "domain":
          return domainOf(ctx.url);
        default:
          return pad(ctx.n, token.length);
      }
    },
  );
  return sanitizeFileName(name);
}

/** Whether the template has an auto number, so a save should count it up. */
export function usesNumber(template: string): boolean {
  return /\{n+\}/.test(template);
}

/** The page's host without "www.", or "" for pages without one. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cutTitle(title: string): string {
  const chars = Array.from(title.replace(/\s+/g, " ").trim());
  return chars.slice(0, TITLE_MAX).join("").trimEnd();
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Make `name` a valid Windows file name, as Vandal's `sanitize_file_name`. */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-");
  // Windows strips trailing dots and spaces; Chrome refuses a leading dot.
  const trimmed = cleaned.replace(/^[\s.]+/, "").replace(/[. ]+$/, "");
  if (!trimmed) return "Screenshot";
  return RESERVED.test(trimmed) ? `${trimmed}_` : trimmed;
}

/** A subfolder of the download folder as Chrome wants it ("a/b"), or "". */
export function sanitizeFolder(folder: string): string {
  return folder
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part && !/^\.+$/.test(part))
    .map(sanitizeFileName)
    .join("/");
}
