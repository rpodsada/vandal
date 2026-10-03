// The page's side of a full-page capture (PLAN 3N.5). The worker drives: for
// each screen it asks us to scroll and settle, then captures. Nothing of ours
// is shown meanwhile (the toolbar icon shows progress), so nothing of ours
// can end up in a capture; Esc stops.
// The worker hides the scrollbar and smooth scrolling with insertCSS, which
// also holds the [data-vandal-hide] rule (a page's CSP can't block it).

import type { CopyResult, FullBegin, FullInfo, FullShot, FullStep } from "../messages";
import { dataUrlToBlob } from "./dom";
import { showToast } from "./toast";

const HIDE = "data-vandal-hide";
/** At most this long waiting for images in view to load. */
const IMAGE_WAIT_MS = 1500;
/** Then this long for scroll-triggered effects to finish. */
const SETTLE_MS = 150;

interface State {
  x: number;
  y: number;
  hideFixed: boolean;
  /** The page is already back as it was. */
  ended: boolean;
  onKey: (e: KeyboardEvent) => void;
  onWheel: (e: Event) => void;
}

let state: State | null = null;

export function pageHeight(): number {
  return Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
}

/** A panel covering most of the viewport that scrolls by itself (web apps). */
function hasInnerScroller(): boolean {
  const area = innerWidth * innerHeight;
  for (const node of document.body?.querySelectorAll("*") ?? []) {
    const e = node as HTMLElement;
    if (e.scrollHeight <= e.clientHeight + 10) continue;
    const { overflowY } = getComputedStyle(e);
    if (overflowY !== "auto" && overflowY !== "scroll") continue;
    if (e.clientWidth * e.clientHeight > area / 2) return true;
  }
  return false;
}

export function fullBegin(msg: FullBegin): FullInfo {
  fullEnd();
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void chrome.runtime.sendMessage({ type: "full:stop" });
  };
  // The user scrolling would fight the capture.
  const onWheel = (e: Event) => e.preventDefault();
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  state = {
    x: scrollX,
    y: scrollY,
    hideFixed: msg.hideFixed,
    ended: false,
    onKey,
    onWheel,
  };
  const height = pageHeight();
  return {
    height,
    viewport: innerHeight,
    width: innerWidth,
    innerScroller: height <= innerHeight + 1 && hasInnerScroller(),
  };
}

export async function fullStep(msg: FullStep): Promise<FullShot> {
  window.scrollTo({ top: msg.y, left: 0, behavior: "instant" });
  await frames(2);
  const y = scrollY;
  const viewport = innerHeight;
  const height = pageHeight();
  const last = y + viewport >= height - 1;
  // A page that fits on one screen is captured as it is.
  const single = msg.index === 0 && last;
  if (state?.hideFixed && !single) hideFixed(msg.index === 0 ? "first" : last ? "last" : "middle");
  await settle();
  return { y, viewport, height, last };
}

/** Put the page back: scroll position, hidden elements, listeners. */
export function fullEnd() {
  if (!state || state.ended) return;
  state.ended = true;
  for (const e of document.querySelectorAll(`[${HIDE}]`)) e.removeAttribute(HIDE);
  window.scrollTo({ top: state.y, left: state.x, behavior: "instant" });
  window.removeEventListener("keydown", state.onKey, true);
  window.removeEventListener("wheel", state.onWheel, { capture: true });
}

export async function fullCopy(image: string): Promise<CopyResult> {
  try {
    const blob = dataUrlToBlob(image);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showToast("Screenshot copied");
    return { copied: true };
  } catch (e) {
    return { copied: false, copyError: e instanceof Error ? e.message : String(e) };
  }
}

/** Sticky and fixed elements appear once, where they belong: the first screen
 *  keeps headers but not bottom bars, middle screens show none, and the last
 *  screen shows bottom bars (cookie banners, footers) but not headers. */
function hideFixed(phase: "first" | "middle" | "last") {
  for (const node of document.body?.querySelectorAll("*") ?? []) {
    const { position } = getComputedStyle(node);
    if (position !== "fixed" && position !== "sticky") continue;
    const r = node.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const bottomBar = position === "fixed" && r.top >= innerHeight / 2;
    const hide = phase === "middle" || (phase === "first" ? bottomBar : !bottomBar);
    if (hide) node.setAttribute(HIDE, "");
    else node.removeAttribute(HIDE);
  }
}

function frames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const next = () => (--n <= 0 ? resolve() : requestAnimationFrame(next));
    requestAnimationFrame(next);
  });
}

/** Wait for images in view to load (lazy ones start as they scroll in) and
 *  for web fonts, then a moment for scroll-triggered effects. */
async function settle() {
  const inView = [...document.images].filter((img) => {
    if (img.complete) return false;
    const r = img.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0;
  });
  const loaded = inView.map(
    (img) =>
      new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      }),
  );
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, IMAGE_WAIT_MS));
  await Promise.race([Promise.all([...loaded, document.fonts.ready]), timeout]);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}
