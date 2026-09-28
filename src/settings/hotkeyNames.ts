// Recording a shortcut in Settings (PLAN 3B): key events to the names
// settings store (`Ctrl+Win+Shift+F12`, which Rust hands to the global-shortcut
// parser), and which combinations are allowed.

export interface Mods {
  ctrl: boolean;
  win: boolean;
  alt: boolean;
  shift: boolean;
}

export const NO_MODS: Mods = { ctrl: false, win: false, alt: false, shift: false };

export function modsOf(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): Mods {
  return { ctrl: e.ctrlKey, win: e.metaKey, alt: e.altKey, shift: e.shiftKey };
}

/** `Ctrl+Win+Alt+Shift` (those held), in the order Windows writes them. */
export function modsLabel(m: Mods): string {
  return (
    [
      [m.ctrl, "Ctrl"],
      [m.win, "Win"],
      [m.alt, "Alt"],
      [m.shift, "Shift"],
    ] as const
  )
    .filter(([held]) => held)
    .map(([, name]) => name)
    .join("+");
}

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

export function isModifier(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

const NAMED: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Semicolon: ";",
  Equal: "=",
  Comma: ",",
  Minus: "-",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  BracketLeft: "[",
  Backslash: "\\",
  BracketRight: "]",
  Quote: "'",
};

const AS_IS = new Set([
  "Space",
  "Tab",
  "Enter",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "PrintScreen",
  "Pause",
  "ScrollLock",
  "NumpadAdd",
  "NumpadSubtract",
  "NumpadMultiply",
  "NumpadDivide",
  "NumpadDecimal",
]);

/** The shortcut parser's name for `KeyboardEvent.code`; null if unusable. */
export function keyName(code: string): string | null {
  if (NAMED[code]) return NAMED[code];
  if (AS_IS.has(code)) return code;
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit([0-9])$/.exec(code);
  if (m) return m[1];
  if (/^Numpad[0-9]$/.test(code)) return code;
  m = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  if (m) return code;
  return null;
}

/** Keys nobody types, so they may be a shortcut on their own. */
function worksAlone(key: string): boolean {
  return (
    key === "PrintScreen" ||
    key === "Pause" ||
    key === "ScrollLock" ||
    /^F([1-9]|1\d|2[0-4])$/.test(key)
  );
}

/** The shortcut `mods` + `key` as settings store it, or why it can't be one. */
export function combo(mods: Mods, key: string): { combo: string } | { error: string } {
  const label = modsLabel(mods);
  if (!label && !worksAlone(key)) {
    return {
      error: `Add Ctrl, Alt, Shift or Win: ${key} on its own would stop working for typing.`,
    };
  }
  return { combo: label ? `${label}+${key}` : key };
}
