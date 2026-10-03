// The service worker: takes captures for the popup (and, later, shortcuts),
// stores them and opens the result tab next to the page (PLAN 3N).

import { prune, putCapture } from "./store";

export type CaptureKind = "visible";

export interface CaptureRequest {
  type: "capture";
  kind: CaptureKind;
  tabId: number;
}

export type CaptureResponse = { ok: true } | { ok: false; error: string };

chrome.runtime.onMessage.addListener((msg: CaptureRequest, _sender, sendResponse) => {
  if (msg?.type !== "capture") return false;
  capture(msg.tabId).then(
    () => sendResponse({ ok: true } satisfies CaptureResponse),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
  );
  return true; // responds asynchronously
});

chrome.runtime.onStartup.addListener(() => void prune());
chrome.runtime.onInstalled.addListener(() => void prune());

async function capture(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  // Device pixels, as the page is on screen.
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const id = crypto.randomUUID();
  await putCapture({
    id,
    blob,
    width: bitmap.width,
    height: bitmap.height,
    url: tab.url ?? "",
    title: tab.title ?? "",
    created: Date.now(),
  });
  bitmap.close();
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`result.html#${id}`),
    index: tab.index + 1,
    openerTabId: tab.id,
    windowId: tab.windowId,
  });
  void prune();
}
