// Saving a capture through chrome.downloads (PLAN 3N), shared by the result
// tab (a blob: URL) and the service worker's "Save" action (a data: URL;
// workers can't make blob URLs).

import { renderName, sanitizeFileName } from "./filename";
import type { Capture } from "./store";

export type SaveResult =
  | { ok: true; id: number; path: string }
  /** `error` is missing when the user cancelled Save as. */
  | { ok: false; error?: string };

/** The capture's file name from the template, without extension. */
export function captureName(capture: Capture, template: string, n: number): string {
  return renderName(template, {
    date: new Date(capture.created),
    title: capture.title,
    url: capture.url,
    n,
  });
}

/** Download `url` as `<stem>.png` and wait until it's written. */
export async function saveImage(url: string, stem: string, saveAs: boolean): Promise<SaveResult> {
  let id: number;
  try {
    id = await chrome.downloads.download({
      url,
      filename: `${sanitizeFileName(stem)}.png`,
      saveAs,
      conflictAction: "uniquify",
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const item = await finished(id);
  if (item?.state === "complete") return { ok: true, id, path: item.filename };
  // Cancelling Save as isn't an error worth a message.
  if (item?.error === "USER_CANCELED") return { ok: false };
  return { ok: false, error: item?.error ?? "the download stopped" };
}

/** Resolves when the download completes or stops. */
function finished(id: number): Promise<chrome.downloads.DownloadItem | undefined> {
  return new Promise((resolve) => {
    const check = async () => {
      const [item] = await chrome.downloads.search({ id });
      if (!item || item.state !== "in_progress") {
        chrome.downloads.onChanged.removeListener(onChanged);
        resolve(item);
      }
    };
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === id && delta.state) void check();
    };
    chrome.downloads.onChanged.addListener(onChanged);
    void check();
  });
}

/** The result tab's URL for a capture, with an optional message to show. */
export function resultUrl(id: string, message?: string): string {
  const hash = message ? `${id}&msg=${encodeURIComponent(message)}` : id;
  return chrome.runtime.getURL(`result.html#${hash}`);
}

/** Open the result tab next to the captured tab. */
export async function openResult(tab: chrome.tabs.Tab, id: string, message?: string) {
  await chrome.tabs.create({
    url: resultUrl(id, message),
    index: tab.index + 1,
    openerTabId: tab.id,
    windowId: tab.windowId,
  });
}

/** A ✓ on the toolbar icon for a moment: the capture was copied or saved. */
export async function flashDone(tabId: number) {
  await chrome.action.setBadgeBackgroundColor({ color: "#0f7b0f", tabId });
  await chrome.action.setBadgeTextColor({ color: "#ffffff", tabId });
  await chrome.action.setBadgeText({ text: "✓", tabId });
  setTimeout(() => void chrome.action.setBadgeText({ text: "", tabId }).catch(() => {}), 2500);
}
