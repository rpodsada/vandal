// The content script (PLAN 3N), injected into the page on demand: the region
// overlay and the in-page toast.
//
// Built on its own as a classic script (vite.content.config.ts): injected
// files can't import.

import type { PageMessage } from "../messages";
import { startRegion } from "./region";
import { showToast } from "./toast";

type Listener = (msg: PageMessage) => boolean;

declare global {
  interface Window {
    /** The listener of the latest injection. */
    __vandalPage?: Listener;
  }
}

// Injected again each time it's needed. The latest injection's listener
// replaces the one before, which may belong to an extension since reloaded.
const listener: Listener = (msg) => {
  if (msg?.type === "region:start" && !document.querySelector("vandal-region"))
    void startRegion(msg);
  else if (msg?.type === "toast") showToast(msg.text);
  return false;
};
try {
  if (window.__vandalPage) chrome.runtime.onMessage.removeListener(window.__vandalPage);
} catch {
  // Its extension context is gone; it gets no messages anyway.
}
window.__vandalPage = listener;
chrome.runtime.onMessage.addListener(listener);
