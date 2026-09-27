// Our windows are app UI, not web pages: the webview's own shortcuts (reload,
// print, find, back/forward) and its context menu (save image, inspect...)
// would only break or confuse them. Tauri doesn't expose WebView2's switches
// for these, so cancel them here. Our own handlers still see the events (e.g.
// Ctrl+R = redo in the editor, right-click = cancel in the overlay). DevTools
// keys are left alone.

import { isTyping } from "./dom";

function isBrowserShortcut(e: KeyboardEvent): boolean {
  const ctrl = e.ctrlKey && !e.altKey;
  switch (e.code) {
    case "F5":
    case "F3":
    case "BrowserBack":
    case "BrowserForward":
    case "BrowserRefresh":
      return true;
    case "KeyR": // reload (Shift: hard reload)
    case "KeyP": // print
    case "KeyF": // find
    case "KeyG": // find next
    case "KeyU": // view source
      return ctrl;
    case "ArrowLeft":
    case "ArrowRight":
      return e.altKey && !e.ctrlKey; // history back / forward
  }
  return false;
}

/** Call once per page, before rendering. */
export function blockBrowserUi(): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (isBrowserShortcut(e)) e.preventDefault();
    },
    { capture: true },
  );
  // Text fields keep theirs: cut/copy/paste is useful there.
  window.addEventListener(
    "contextmenu",
    (e) => {
      if (!isTyping(e.target)) e.preventDefault();
    },
    { capture: true },
  );
}
