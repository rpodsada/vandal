// The service worker: takes captures for the popup (and, later, shortcuts),
// stores them, then runs the "After capture" action (PLAN 3N).

import { usesNumber } from "./filename";
import { captureName, flashDone, openResult, saveImage } from "./downloads";
import { countNumber, getSettings, nextNumber } from "./settings";
import { type Capture, prune, putCapture } from "./store";

export type CaptureKind = "visible";

export interface CaptureRequest {
  type: "capture";
  kind: CaptureKind;
  tabId: number;
}

export type CaptureResponse =
  | { ok: true; done: "result" }
  | { ok: true; done: "saved"; path: string }
  /** The popup copies it: a worker has no clipboard, and the popup has focus. */
  | { ok: true; done: "copy"; id: string }
  | { ok: false; error: string };

chrome.runtime.onMessage.addListener((msg: CaptureRequest, _sender, sendResponse) => {
  if (msg?.type !== "capture") return false;
  capture(msg.tabId).then(sendResponse, (e: unknown) =>
    sendResponse({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    } satisfies CaptureResponse),
  );
  return true; // responds asynchronously
});

chrome.runtime.onStartup.addListener(() => void prune());
chrome.runtime.onInstalled.addListener(() => void prune());

async function capture(tabId: number): Promise<CaptureResponse> {
  const tab = await chrome.tabs.get(tabId);
  // Device pixels, as the page is on screen.
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const capture: Capture = {
    id: crypto.randomUUID(),
    blob,
    width: bitmap.width,
    height: bitmap.height,
    url: tab.url ?? "",
    title: tab.title ?? "",
    created: Date.now(),
  };
  bitmap.close();
  await putCapture(capture);
  void prune();

  const settings = await getSettings();
  switch (settings.afterCapture) {
    case "copy":
      return { ok: true, done: "copy", id: capture.id };
    case "save": {
      const n = await nextNumber();
      const saved = await saveImage(
        dataUrl,
        captureName(capture, settings.template, n),
        settings.saveAs,
      );
      if (saved.ok) {
        if (usesNumber(settings.template)) await countNumber(n);
        await flashDone(tabId);
        return { ok: true, done: "saved", path: saved.path };
      }
      // Cancelled Save as: the user changed their mind, nothing to show.
      if (!saved.error) return { ok: true, done: "result" };
      // Keep the capture: open it with the reason, so it can be saved by hand.
      await openResult(tab, capture.id, `Couldn't save: ${saved.error}`);
      return { ok: true, done: "result" };
    }
    default:
      await openResult(tab, capture.id);
      return { ok: true, done: "result" };
  }
}
