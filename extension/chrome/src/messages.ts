// Messages between the popup, the service worker and the region overlay
// (PLAN 3N). Types only; each side checks `type` before acting.

export type CaptureKind = "visible" | "region";

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
  /** The region overlay is up; the popup can close. */
  | { ok: true; done: "region" }
  | { ok: false; error: string };

/** Worker → overlay: show this frozen frame and let the user pick an area. */
export interface RegionStart {
  type: "region:start";
  /** The visible area as a PNG data: URL, in device pixels. */
  image: string;
  /** Copy the crop in the page, which has focus after Enter or a click. */
  copy: boolean;
}

/** Popup or worker → page: show a short confirmation (content/toast.ts). */
export interface PageToast {
  type: "toast";
  text: string;
}

/** What the content script (content/page.ts) listens for. */
export type PageMessage = RegionStart | PageToast;

/** Overlay → worker: the cropped area. Not sent on cancel. */
export interface RegionDone {
  type: "region:done";
  /** The crop as a PNG data: URL. */
  image: string;
  /** Whether the copy worked, when `copy` was asked for. */
  copied?: boolean;
  copyError?: string;
}
