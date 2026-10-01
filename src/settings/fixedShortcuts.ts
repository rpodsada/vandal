// The shortcuts that can't be changed (PLAN 3F.4), for Settings › Keyboard
// shortcuts: a cheat sheet. Kept in step with `useMarkupKeys.ts`,
// `OverlayApp.tsx`, `EditorApp.tsx`, `useCropKeys.ts` and `Stage.tsx`; the
// ones with letters are also in `FIXED` (shortcuts.rs), which the tools'
// shortcuts may not take.

/** One line: its key combinations (alternatives), and what they do. */
export interface KeyEntry {
  /** "Ctrl+Shift+Z"; lowercase words are mouse actions ("Space+drag"). */
  keys: string[];
  what: string;
}

export const MARKUP_KEYS: KeyEntry[] = [
  { keys: ["1…0"], what: "Line width, text size or strength, by tool" },
  { keys: ["Shift+1…0"], what: "A callout's pointer thickness" },
  { keys: ["Alt+1…0"], what: "Font, or corner radius for rectangles and spotlights" },
  { keys: ["Ctrl+1…0"], what: "Color (the first, with two)" },
  { keys: ["Ctrl+Shift+1…0"], what: "The second color" },
  { keys: ["Ctrl+Z"], what: "Undo" },
  { keys: ["Ctrl+Y", "Ctrl+Shift+Z"], what: "Redo" },
  { keys: ["Ctrl+A"], what: "Select all" },
  { keys: ["Ctrl+D"], what: "Duplicate" },
  { keys: ["Del", "Backspace"], what: "Delete" },
  { keys: ["←↑↓→"], what: "Nudge (with Shift: 10 px)" },
  { keys: ["Ctrl+]", "Ctrl+["], what: "Bring forward, send backward" },
  { keys: ["Ctrl+Shift+]", "Ctrl+Shift+["], what: "Bring to front, send to back" },
  { keys: ["Enter"], what: "Edit the selected text, callout or step label" },
  { keys: ["Esc"], what: "Deselect, then back to Select" },
  { keys: ["Ctrl+B", "Ctrl+I"], what: "Bold, italic" },
  { keys: ["Shift+drag"], what: "Square, circle, 45° lines, straight moves" },
  { keys: ["Ctrl+drag"], what: "Draw over an object instead of selecting it, or the reverse" },
  { keys: ["Ctrl+C"], what: "Copy" },
  { keys: ["Ctrl+S"], what: "Save" },
  { keys: ["Ctrl+,"], what: "Settings" },
];

export const QUICK_EDIT_KEYS: KeyEntry[] = [
  { keys: ["F"], what: "Capture this screen (before selecting)" },
  { keys: ["A"], what: "Capture all screens (before selecting)" },
  { keys: ["←↑↓→"], what: "Move the area, with nothing selected (with Shift: 10 px)" },
  { keys: ["Ctrl+←↑↓→"], what: "Resize the area from its bottom-right corner" },
  { keys: ["Enter"], what: "Done" },
  { keys: ["Ctrl+E"], what: "Open in the editor" },
  { keys: ["Esc"], what: "Exit" },
];

export const EDITOR_KEYS: KeyEntry[] = [
  { keys: ["Ctrl+Shift+S"], what: "Save as" },
  { keys: ["Ctrl+N"], what: "Capture" },
  { keys: ["Ctrl+O"], what: "Open an image" },
  { keys: ["Ctrl+W"], what: "Close" },
  { keys: ["Ctrl+=", "Ctrl+-"], what: "Zoom in, zoom out" },
  { keys: ["Ctrl+wheel"], what: "Zoom" },
  { keys: ["Ctrl+0"], what: "Fit" },
  { keys: ["Ctrl+Shift+0"], what: "Actual size" },
  { keys: ["Space+drag", "wheel"], what: "Pan" },
  { keys: ["Enter", "Esc"], what: "While cropping: apply, cancel" },
];
