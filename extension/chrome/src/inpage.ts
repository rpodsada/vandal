// Showing things inside the captured page (PLAN 3N): inject the content
// script (content/page.ts), then message it.

import type { PageToast } from "./messages";

/** A short confirmation at the top of the page. Best effort: a page that
 *  refuses scripts just doesn't show it. */
export async function pageToast(tabId: number, text: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["page.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "toast", text } satisfies PageToast);
  } catch {
    // The badge still shows it.
  }
}
