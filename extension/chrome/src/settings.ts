// The extension's settings (PLAN 3N), in chrome.storage.sync so they follow
// the user's browser profile. Separate from Vandal's own settings on purpose.

import { DEFAULT_FOLDER, DEFAULT_TEMPLATE } from "./filename";

export interface Settings {
  /** Subfolder of the download folder; "" saves there directly. */
  folder: string;
  /** Show a Save as dialog for Save too. */
  saveAs: boolean;
  template: string;
}

export const DEFAULTS: Settings = {
  folder: DEFAULT_FOLDER,
  saveAs: false,
  template: DEFAULT_TEMPLATE,
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get({ ...DEFAULTS });
  return { ...DEFAULTS, ...stored } as Settings;
}

/** The auto number `{n}` gets next. Kept per device: it counts this PC's saves. */
export async function nextNumber(): Promise<number> {
  const { nextNumber } = await chrome.storage.local.get({ nextNumber: 1 });
  return nextNumber as number;
}

export async function countNumber(used: number): Promise<void> {
  await chrome.storage.local.set({ nextNumber: used + 1 });
}
