// The content script (PLAN 3N), injected into the page on demand: the region
// overlay, full-page capture's page side, copying, and the in-page toast.
//
// Built on its own as a classic script (vite.content.config.ts): injected
// files can't import.

import type { PageMessage } from "../messages";
import { copyImage } from "./copy";
import { fullBegin, fullEnd, fullStep } from "./fullpage";
import { startRegion } from "./region";
import { showToast } from "./toast";

type Listener = (
  msg: PageMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean;

declare global {
  interface Window {
    /** The listener of the latest injection. */
    __vandalPage?: Listener;
  }
}

// Injected again each time it's needed. The latest injection's listener
// replaces the one before, which may belong to an extension since reloaded.
const listener: Listener = (msg, _sender, sendResponse) => {
  const reply = (work: unknown) => {
    Promise.resolve(work).then(sendResponse, () => sendResponse(undefined));
    return true; // responds asynchronously
  };
  switch (msg?.type) {
    case "region:start":
      if (!document.querySelector("vandal-region")) void startRegion(msg);
      return false;
    case "toast":
      showToast(msg.text, msg.kind);
      return false;
    case "full:begin":
      return reply(fullBegin(msg));
    case "full:step":
      return reply(fullStep(msg));
    case "full:end":
      return reply(fullEnd());
    case "copy":
      return reply(copyImage(msg.image));
    default:
      return false;
  }
};
try {
  if (window.__vandalPage) chrome.runtime.onMessage.removeListener(window.__vandalPage);
} catch {
  // Its extension context is gone; it gets no messages anyway.
}
window.__vandalPage = listener;
chrome.runtime.onMessage.addListener(listener);
