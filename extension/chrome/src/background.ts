// The service worker: takes captures for the popup (and, later, shortcuts),
// stores them, then runs the "After capture" action (PLAN 3N).

import { usesNumber } from "./filename";
import { captureName, flashDone, openResult, saveImage } from "./downloads";
import { pageToast } from "./inpage";
import type { CaptureRequest, CaptureResponse, RegionDone, RegionStart } from "./messages";
import { type Settings, countNumber, getSettings, nextNumber } from "./settings";
import { type Capture, prune, putCapture } from "./store";

type Message = CaptureRequest | RegionDone;

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  let work: Promise<CaptureResponse | void>;
  if (msg?.type === "capture") {
    work = msg.kind === "region" ? startRegion(msg.tabId) : captureVisible(msg.tabId);
  } else if (msg?.type === "region:done" && sender.tab) {
    work = regionDone(sender.tab, msg);
  } else {
    return false;
  }
  work.then(sendResponse, (e: unknown) =>
    sendResponse({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    } satisfies CaptureResponse),
  );
  return true; // responds asynchronously
});

chrome.runtime.onStartup.addListener(() => void prune());
chrome.runtime.onInstalled.addListener(() => void prune());

/** The visible area, in device pixels as the page is on screen. */
async function grab(tab: chrome.tabs.Tab): Promise<string> {
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
}

async function captureVisible(tabId: number): Promise<CaptureResponse> {
  const tab = await chrome.tabs.get(tabId);
  const image = await grab(tab);
  const settings = await getSettings();
  const capture = await store(tab, image);
  if (settings.afterCapture === "copy") return { ok: true, done: "copy", id: capture.id };
  return after(tab, capture, image, settings);
}

/** Freeze the visible area first (nothing of ours is on screen yet), then
 *  show it in the page for picking an area (content/region.ts). */
async function startRegion(tabId: number): Promise<CaptureResponse> {
  const tab = await chrome.tabs.get(tabId);
  const image = await grab(tab);
  const settings = await getSettings();
  await chrome.scripting.executeScript({ target: { tabId }, files: ["page.js"] });
  const start: RegionStart = {
    type: "region:start",
    image,
    copy: settings.afterCapture === "copy",
  };
  await chrome.tabs.sendMessage(tabId, start);
  return { ok: true, done: "region" };
}

async function regionDone(tab: chrome.tabs.Tab, msg: RegionDone): Promise<void> {
  const settings = await getSettings();
  const capture = await store(tab, msg.image);
  await after(tab, capture, msg.image, settings, msg);
}

async function store(tab: chrome.tabs.Tab, image: string): Promise<Capture> {
  const blob = await (await fetch(image)).blob();
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
  return capture;
}

/** Run the After capture action. `copy` is how a copy already went (the
 *  overlay copies in the page); the worker itself can't copy. */
async function after(
  tab: chrome.tabs.Tab,
  capture: Capture,
  image: string,
  settings: Settings,
  copy?: { copied?: boolean; copyError?: string },
): Promise<CaptureResponse> {
  const tabId = tab.id!;
  if (settings.afterCapture === "copy" && copy?.copied) {
    await flashDone(tabId);
    return { ok: true, done: "result" };
  }
  if (settings.afterCapture === "copy") {
    // Keep the capture: open it with the reason, so it can be copied there.
    await openResult(tab, capture.id, `Couldn't copy: ${copy?.copyError ?? "unknown error"}`);
    return { ok: true, done: "result" };
  }
  if (settings.afterCapture === "save") {
    const n = await nextNumber();
    const saved = await saveImage(
      image,
      captureName(capture, settings.template, n),
      settings.saveAs,
    );
    if (saved.ok) {
      if (usesNumber(settings.template)) await countNumber(n);
      await Promise.all([flashDone(tabId), pageToast(tabId, "Screenshot saved")]);
      return { ok: true, done: "saved", path: saved.path };
    }
    // Cancelled Save as: the user changed their mind, nothing to show.
    if (!saved.error) return { ok: true, done: "result" };
    // Keep the capture: open it with the reason, so it can be saved by hand.
    await openResult(tab, capture.id, `Couldn't save: ${saved.error}`);
    return { ok: true, done: "result" };
  }
  await openResult(tab, capture.id);
  return { ok: true, done: "result" };
}
