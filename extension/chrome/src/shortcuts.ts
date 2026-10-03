// The extension's keyboard shortcuts (PLAN 3N.6), as the browser has them now:
// users change them at chrome://extensions/shortcuts, and a default that
// clashed with another extension is left unset.

/** Command names (manifest "commands") and what to call them. */
export const COMMAND_LABELS: Record<string, string> = {
  _execute_action: "Open the popup",
  "capture-visible": "Capture the visible area",
  "capture-region": "Capture a region",
  "capture-full": "Capture the full page",
};

/** Each command's current shortcut ("" when unset). */
export async function getShortcuts(): Promise<Record<string, string>> {
  const commands = await chrome.commands.getAll();
  return Object.fromEntries(commands.map((c) => [c.name ?? "", c.shortcut ?? ""]));
}

/** The browser's page for changing them (Edge maps chrome:// to edge://). */
export function openShortcutSettings() {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}
