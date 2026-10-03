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

/** What the result tab shows besides the capture: an error (a copy or save
 *  that failed) and a note (e.g. a full page cut at the size limit). */
export interface ResultExtras {
  error?: string;
  note?: string;
}

/** The result tab's URL for a capture: `result.html#<id>&error=…&note=…`. */
export function resultUrl(id: string, extras: ResultExtras = {}): string {
  const params = new URLSearchParams();
  if (extras.error) params.set("error", extras.error);
  if (extras.note) params.set("note", extras.note);
  const query = params.toString();
  return chrome.runtime.getURL(`result.html#${id}${query ? `&${query}` : ""}`);
}

/** Open the result tab next to the captured tab. */
export async function openResult(tab: chrome.tabs.Tab, id: string, extras?: ResultExtras) {
  await chrome.tabs.create({
    url: resultUrl(id, extras),
    index: tab.index + 1,
    openerTabId: tab.id,
    windowId: tab.windowId,
  });
}

/** Animated dots on the toolbar icon while a full page is captured, and a
 *  tooltip saying how to stop. `stop()` puts the icon back. */
export function showBusy(tabId: number): { stop: () => Promise<void> } {
  let dots = 0;
  const tick = () => {
    dots = (dots % 3) + 1;
    void chrome.action.setBadgeText({ text: "•".repeat(dots), tabId }).catch(() => {});
  };
  void chrome.action.setBadgeBackgroundColor({ color: "#4c8dff", tabId });
  void chrome.action.setBadgeTextColor({ color: "#ffffff", tabId });
  void chrome.action.setTitle({ title: "Capturing the full page… Press Esc to stop", tabId });
  tick();
  const timer = setInterval(tick, 400);
  return {
    async stop() {
      clearInterval(timer);
      await chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
      await chrome.action.setTitle({ title: "Vandal", tabId }).catch(() => {});
    },
  };
}

/** A ✓ on the toolbar icon for a moment: the capture was copied or saved. */
export async function flashDone(tabId: number) {
  await chrome.action.setBadgeBackgroundColor({ color: "#0f7b0f", tabId });
  await chrome.action.setBadgeTextColor({ color: "#ffffff", tabId });
  await chrome.action.setBadgeText({ text: "✓", tabId });
  setTimeout(() => void chrome.action.setBadgeText({ text: "", tabId }).catch(() => {}), 2500);
}
