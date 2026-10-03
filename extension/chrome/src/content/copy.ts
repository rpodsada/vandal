// Copying a capture in the page (PLAN 3N): the page is the focused document
// after a shortcut, Enter or a click, while the worker has no clipboard.

import type { CopyResult } from "../messages";
import { dataUrlToBlob } from "./dom";
import { showToast } from "./toast";

export async function copyImage(image: string | Blob): Promise<CopyResult> {
  try {
    const blob = typeof image === "string" ? dataUrlToBlob(image) : image;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showToast("Screenshot copied");
    return { copied: true };
  } catch (e) {
    return { copied: false, copyError: e instanceof Error ? e.message : String(e) };
  }
}
