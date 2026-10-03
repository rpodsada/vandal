// The extension's settings (PLAN 3N), in chrome.storage.sync so they follow
// the user's browser profile. Separate from Vandal's own settings on purpose.

import { DEFAULT_TEMPLATE } from "./filename";

/** What happens after a capture. The result tab always offers all of them. */
export type AfterCapture = "result" | "copy" | "save";

export const AFTER_CAPTURE: { value: AfterCapture; label: string }[] = [
  { value: "result", label: "Show the result tab" },
  { value: "copy", label: "Copy to the clipboard" },
  { value: "save", label: "Save" },
];

export interface Settings {
  afterCapture: AfterCapture;
  /** Show a Save as dialog for Save too. Otherwise the browser's download
   *  settings decide: its download folder, or asking for each file. */
  saveAs: boolean;
  template: string;
  /** Full page: show sticky and fixed elements once, not on every screen. */
  hideFixed: boolean;
}

export const DEFAULTS: Settings = {
  afterCapture: "result",
  saveAs: false,
  template: DEFAULT_TEMPLATE,
  hideFixed: true,
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get({ ...DEFAULTS });
  return { ...DEFAULTS, ...stored } as Settings;
}

export async function setSettings(changes: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(changes);
}

/** The auto number `{n}` gets next. Kept per device: it counts this PC's saves. */
export async function nextNumber(): Promise<number> {
  const { nextNumber } = await chrome.storage.local.get({ nextNumber: 1 });
  return nextNumber as number;
}

export async function countNumber(used: number): Promise<void> {
  await chrome.storage.local.set({ nextNumber: used + 1 });
}
