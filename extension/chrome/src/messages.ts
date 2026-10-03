// Messages between the popup, the service worker and the content script
// (PLAN 3N). Types only; each side checks `type` before acting.

export type CaptureKind = "visible" | "region" | "full";

/** Popup → worker: capture this tab. */
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
  /** The page takes over (region overlay, full-page progress); the popup can close. */
  | { ok: true; done: "started" }
  | { ok: false; error: string };

/** Worker → page: show this frozen frame and let the user pick an area. */
export interface RegionStart {
  type: "region:start";
  /** The visible area as a PNG data: URL, in device pixels. */
  image: string;
  /** Copy the crop in the page, which has focus after Enter or a click. */
  copy: boolean;
}

/** Page → worker: the cropped area. Not sent on cancel. */
export interface RegionDone {
  type: "region:done";
  /** The crop as a PNG data: URL. */
  image: string;
  /** Whether the copy worked, when `copy` was asked for. */
  copied?: boolean;
  copyError?: string;
}

/** Popup or worker → page: show a short confirmation (content/toast.ts). */
export interface PageToast {
  type: "toast";
  text: string;
  kind?: "ok" | "error";
}

// Full page (PLAN 3N.5): the worker drives, one screen at a time.

/** Worker → page: get ready (remember the scroll position, listen for Esc). */
export interface FullBegin {
  type: "full:begin";
  /** Show sticky and fixed elements once instead of on every screen. */
  hideFixed: boolean;
}

export interface FullInfo {
  /** Page height, viewport height and width, in CSS pixels. */
  height: number;
  viewport: number;
  width: number;
  /** The document doesn't scroll, but a large panel inside it does. */
  innerScroller: boolean;
}

/** Worker → page: scroll to `y`, settle, and get out of the way of a capture. */
export interface FullStep {
  type: "full:step";
  y: number;
  index: number;
}

export interface FullShot {
  /** Where the page actually scrolled to, and its sizes now (CSS pixels). */
  y: number;
  viewport: number;
  height: number;
  /** The bottom of the page is in view. */
  last: boolean;
}

/** Worker → page: put the page back as it was. */
export interface FullEnd {
  type: "full:end";
}

/** Worker → page: copy this image here, where there's focus (after a full
 *  page, or a shortcut with no popup open). */
export interface PageCopy {
  type: "copy";
  image: string;
}

export interface CopyResult {
  copied: boolean;
  copyError?: string;
}

/** Page → worker: the user pressed Esc. */
export interface FullStop {
  type: "full:stop";
}

/** What the content script (content/page.ts) listens for. */
export type PageMessage = RegionStart | PageToast | FullBegin | FullStep | FullEnd | PageCopy;
