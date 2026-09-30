// The markup's customizable shortcuts (PLAN 3F): each tool's, the editor's
// crop and swapping colors, from Settings (`shortcuts.rs` checks them). A
// shortcut is a letter, alone or with Ctrl, Alt and Shift: "V", "Ctrl+Shift+L".

import type { Settings } from "../shared/ipc";

export type ShortcutKeys = Settings["shortcuts"];
export type ShortcutId = keyof ShortcutKeys;

/** The Rust defaults (`shortcuts.rs`), used until the host passes the real settings. */
export const DEFAULT_SHORTCUTS: ShortcutKeys = {
  select: "V",
  pen: "P",
  highlighter: "H",
  line: "L",
  arrow: "A",
  rect: "R",
  ellipse: "E",
  text: "T",
  // C is the editor's crop: "call-O-ut".
  callout: "O",
  redact: "B",
  spotlight: "S",
  step: "N",
  crop: "C",
  swapColors: "X",
};

/** What each shortcut does, in the toolbar's order, for Settings and its messages. */
export const SHORTCUT_NAMES: Record<ShortcutId, string> = {
  select: "Select",
  pen: "Pen",
  highlighter: "Highlighter",
  line: "Line",
  arrow: "Arrow",
  rect: "Rectangle",
  ellipse: "Ellipse",
  text: "Text",
  callout: "Callout",
  redact: "Redact",
  spotlight: "Spotlight",
  step: "Step marker",
  crop: "Crop",
  swapColors: "Swap colors",
};

/** The shortcut a key press makes, spelled as settings store it, or null if it can't be one. */
export function comboOf(e: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1];
  if (!letter || e.metaKey) return null;
  return `${e.ctrlKey ? "Ctrl+" : ""}${e.altKey ? "Alt+" : ""}${e.shiftKey ? "Shift+" : ""}${letter}`;
}

/** Which shortcut a key press is, if any. */
export function shortcutOf(
  e: Parameters<typeof comboOf>[0],
  keys: ShortcutKeys,
): ShortcutId | null {
  const combo = comboOf(e);
  if (!combo) return null;
  const hit = (Object.keys(keys) as ShortcutId[]).find((id) => keys[id] === combo);
  return hit ?? null;
}

/** " (V)" for a tooltip, or nothing when the shortcut is cleared. */
export function keySuffix(key: string | null): string {
  return key ? ` (${key})` : "";
}
