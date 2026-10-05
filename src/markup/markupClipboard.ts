// Copying and pasting markup from the objects' right-click menu (PLAN 3R).
// The host that can do it (the editor) registers here; without one (quick
// edit), the menu has no copy and paste rows.

export interface MarkupClipboard {
  /** Copy every object as markup. */
  copyAll: () => void;
  /** Add the clipboard's markup to the document. */
  paste: () => void;
  /** Does the clipboard hold markup that `paste` would take? */
  canPaste: () => Promise<boolean>;
}

let host: MarkupClipboard | null = null;

/** Register the host (null to unregister). */
export function setMarkupClipboard(next: MarkupClipboard | null): void {
  host = next;
}

export function markupClipboard(): MarkupClipboard | null {
  return host;
}
