// The service worker: takes captures for the popup and the keyboard
// shortcuts, stores them, then runs the "After capture" action (PLAN 3N).

import { usesNumber } from "./filename";
import { captureName, flashBlocked, flashDone, openResult, saveImage, showBusy } from "./downloads";
import { pageToast } from "./inpage";
import type {
  CaptureKind,
  CaptureRequest,
  CaptureResponse,
  CopyResult,
  FullInfo,
  FullShot,
  FullStop,
  PageMessage,
  RegionDone,
  RegionStart,
} from "./messages";
import { blockedReason } from "./pages";
import { type Settings, countNumber, getSettings, nextNumber } from "./settings";
import { maxHeight, stitchPlan } from "./stitch";
import { type Capture, prune, putCapture } from "./store";

type Message = CaptureRequest | RegionDone | FullStop;

/** Chrome allows two captureVisibleTab calls a second. */
const CAPTURE_GAP_MS = 520;
/** Each full-page screen overlaps the one before by this many CSS pixels.
 *  At fractional scales (125%, 150%) scroll offsets and screen heights round
 *  differently, which without it can leave a 1px row no screen covers; the
 *  stitcher takes each row from the first screen, so the overlap never shows. */
const OVERLAP = 8;

/** While a full page is captured: no scrollbar, no smooth scrolling, and the
 *  rule that hides sticky and fixed elements (content/fullpage.ts). Inserted
 *  with insertCSS, which a page's CSP can't block. */
const CAPTURE_CSS =
  "html{scrollbar-width:none!important;scroll-behavior:auto!important}" +
  "html::-webkit-scrollbar{display:none!important}" +
  "body{scroll-behavior:auto!important}" +
  "[data-vandal-hide]{visibility:hidden!important}";

/** Tabs whose full-page capture the user stopped. */
const stopping = new Set<number>();

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  let work: Promise<CaptureResponse | void>;
  if (msg?.type === "capture") {
    if (msg.kind === "region") work = startRegion(msg.tabId);
    else if (msg.kind === "full") work = startFullPage(msg.tabId);
    else work = captureVisible(msg.tabId, true);
  } else if (msg?.type === "region:done" && sender.tab) {
    work = regionDone(sender.tab, msg);
  } else if (msg?.type === "full:stop" && sender.tab?.id !== undefined) {
    stopping.add(sender.tab.id);
    return false;
  } else {
    return false;
  }
  work.then(sendResponse, (e: unknown) =>
    sendResponse({ ok: false, error: errorText(e) } satisfies CaptureResponse),
  );
  return true; // responds asynchronously
});

/** The manifest's commands (Alt+Shift+S, R, F by default). Like a click on
 *  the toolbar icon, a shortcut grants activeTab for the tab it's pressed in. */
const COMMANDS: Record<string, CaptureKind> = {
  "capture-visible": "visible",
  "capture-region": "region",
  "capture-full": "full",
};

chrome.commands.onCommand.addListener((command, tab) => {
  const kind = COMMANDS[command];
  if (kind && tab?.id !== undefined) void shortcut(kind, tab.id, tab.url);
});

async function shortcut(kind: CaptureKind, tabId: number, url: string | undefined) {
  // No page to show a message in: say it on the icon.
  if (blockedReason(url)) return flashBlocked(tabId);
  try {
    if (kind === "region") await startRegion(tabId);
    else if (kind === "full") await startFullPage(tabId);
    else await captureVisible(tabId, false);
  } catch (e) {
    await pageToast(tabId, `Couldn't capture this page: ${errorText(e)}`, "error");
  }
}

chrome.runtime.onStartup.addListener(() => void prune());
chrome.runtime.onInstalled.addListener(() => void prune());

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastGrab = 0;

/** The visible area as a PNG data: URL, in device pixels as on screen. */
async function grab(tab: chrome.tabs.Tab): Promise<string> {
  const wait = lastGrab + CAPTURE_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastGrab = Date.now();
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
}

const toBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function inject(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["page.js"] });
}

/** Copy in the page, which has focus: the worker has no clipboard. */
async function copyInPage(tabId: number, image: string | Blob): Promise<CopyResult> {
  await inject(tabId);
  const url = typeof image === "string" ? image : await toDataUrl(image);
  const msg: PageMessage = { type: "copy", image: url };
  return chrome.tabs.sendMessage(tabId, msg) as Promise<CopyResult>;
}

/** `fromPopup`: the popup copies (it has focus); after a shortcut, the page does. */
async function captureVisible(tabId: number, fromPopup: boolean): Promise<CaptureResponse> {
  const tab = await chrome.tabs.get(tabId);
  const image = await grab(tab);
  const settings = await getSettings();
  const capture = await store(tab, await toBlob(image));
  if (settings.afterCapture !== "copy") return after(tab, capture, settings);
  if (fromPopup) return { ok: true, done: "copy", id: capture.id };
  return after(tab, capture, settings, await copyInPage(tabId, image));
}

/** Freeze the visible area first (nothing of ours is on screen yet), then
 *  show it in the page for picking an area (content/region.ts). */
async function startRegion(tabId: number): Promise<CaptureResponse> {
  const tab = await chrome.tabs.get(tabId);
  const image = await grab(tab);
  const settings = await getSettings();
  await inject(tabId);
  const start: RegionStart = {
    type: "region:start",
    image,
    copy: settings.afterCapture === "copy",
  };
  await chrome.tabs.sendMessage(tabId, start);
  return { ok: true, done: "started" };
}

async function regionDone(tab: chrome.tabs.Tab, msg: RegionDone): Promise<void> {
  const settings = await getSettings();
  const capture = await store(tab, await toBlob(msg.image));
  await after(tab, capture, settings, msg);
}

/** Start a full-page capture; it runs on after the popup has closed. */
async function startFullPage(tabId: number): Promise<CaptureResponse> {
  const tab = await chrome.tabs.get(tabId);
  const settings = await getSettings();
  await inject(tabId);
  await chrome.scripting.insertCSS({ target: { tabId }, css: CAPTURE_CSS });
  void fullPage(tab, settings);
  return { ok: true, done: "started" };
}

/** Scroll and stitch (PLAN 3N.5): the page scrolls and settles for each
 *  screen (content/fullpage.ts), we capture, then stitch the screens. */
async function fullPage(tab: chrome.tabs.Tab, settings: Settings) {
  const tabId = tab.id!;
  const send = <T = void>(msg: PageMessage) => chrome.tabs.sendMessage(tabId, msg) as Promise<T>;
  let restored = false;
  /** Put the page back as it was, once. */
  const restore = async () => {
    if (restored) return;
    restored = true;
    await send({ type: "full:end" }).catch(() => {});
    await chrome.scripting.removeCSS({ target: { tabId }, css: CAPTURE_CSS }).catch(() => {});
  };
  stopping.delete(tabId);
  const busy = showBusy(tabId);

  try {
    const info = await send<FullInfo>({ type: "full:begin", hideFixed: settings.hideFixed });
    let note = info.innerScroller
      ? "This page scrolls inside a panel, so only the visible area was captured."
      : undefined;
    const shots: { top: number; blob: Blob }[] = [];
    let width = 0;
    let shotH = 0;
    let scale = 1;
    let limit = 0;
    let y = 0;
    for (let index = 0; ; index++) {
      const shot = await send<FullShot>({ type: "full:step", y, index });
      const blob = await toBlob(await grab(tab));
      if (index === 0) {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        shotH = bitmap.height;
        // Image pixels per CSS pixel: the device pixel ratio, page zoom included.
        scale = bitmap.width / info.width;
        limit = maxHeight(width);
        bitmap.close();
      }
      const top = Math.round(shot.y * scale);
      // The page didn't scroll any further.
      if (shots.length && top <= shots[shots.length - 1].top) break;
      shots.push({ top, blob });
      if (shot.last || stopping.has(tabId)) break;
      if (top + shotH >= limit) {
        const fmt = new Intl.NumberFormat();
        note = `This page is taller than ${fmt.format(limit)} px, so the capture stops there.`;
        break;
      }
      y = shot.y + shot.viewport - OVERLAP;
    }
    await restore();

    const { pieces, height } = stitchPlan(
      shots.map((s) => s.top),
      shotH,
      limit,
    );
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    for (const piece of pieces) {
      const bitmap = await createImageBitmap(shots[piece.index].blob);
      ctx.drawImage(bitmap, 0, piece.sy, width, piece.h, 0, piece.dy, width, piece.h);
      bitmap.close();
    }
    const image = await canvas.convertToBlob({ type: "image/png" });
    const capture = await store(tab, image, { width, height });
    let copy: CopyResult | undefined;
    if (settings.afterCapture === "copy") copy = await copyInPage(tabId, image);
    await busy.stop();
    await after(tab, capture, settings, copy, note);
  } catch (e) {
    await restore();
    await busy.stop();
    await pageToast(tabId, `Couldn't capture this page: ${errorText(e)}`, "error");
  } finally {
    stopping.delete(tabId);
  }
}

async function store(
  tab: chrome.tabs.Tab,
  blob: Blob,
  size?: { width: number; height: number },
): Promise<Capture> {
  if (!size) {
    const bitmap = await createImageBitmap(blob);
    size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
  }
  const capture: Capture = {
    id: crypto.randomUUID(),
    blob,
    ...size,
    url: tab.url ?? "",
    title: tab.title ?? "",
    created: Date.now(),
  };
  await putCapture(capture);
  void prune();
  return capture;
}

/** Run the After capture action. `copy` is how a copy already went (the page
 *  copies; the worker itself can't). `note` is shown in the result tab. */
async function after(
  tab: chrome.tabs.Tab,
  capture: Capture,
  settings: Settings,
  copy?: { copied?: boolean; copyError?: string },
  note?: string,
): Promise<CaptureResponse> {
  const tabId = tab.id!;
  if (settings.afterCapture === "copy" && copy?.copied) {
    await flashDone(tabId);
    return { ok: true, done: "result" };
  }
  if (settings.afterCapture === "copy") {
    // Keep the capture: open it with the reason, so it can be copied there.
    const error = `Couldn't copy: ${copy?.copyError ?? "unknown error"}`;
    await openResult(tab, capture.id, { error, note });
    return { ok: true, done: "result" };
  }
  if (settings.afterCapture === "save") {
    const n = await nextNumber();
    const saved = await saveImage(
      await toDataUrl(capture.blob),
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
    await openResult(tab, capture.id, { error: `Couldn't save: ${saved.error}`, note });
    return { ok: true, done: "result" };
  }
  await openResult(tab, capture.id, { note });
  return { ok: true, done: "result" };
}
