// The toolbar popup: pick a capture (PLAN 3N). The capture itself runs in the
// service worker, since the popup closes as soon as the result tab opens.

import type { CaptureRequest, CaptureResponse } from "./background";
import { blockedReason } from "./pages";

const msg = document.getElementById("msg") as HTMLParagraphElement;
const visible = document.getElementById("visible") as HTMLButtonElement;

function show(text: string) {
  msg.textContent = text;
  msg.hidden = false;
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const reason = blockedReason(tab?.url);
if (reason || tab?.id === undefined) {
  visible.disabled = true;
  show(reason ?? "This page can't be captured.");
}

visible.addEventListener("click", async () => {
  if (tab?.id === undefined) return;
  visible.disabled = true;
  const request: CaptureRequest = { type: "capture", kind: "visible", tabId: tab.id };
  const response = (await chrome.runtime.sendMessage(request)) as CaptureResponse;
  if (response.ok) window.close();
  else {
    visible.disabled = false;
    show(`Couldn't capture this page: ${response.error}`);
  }
});
