// The toolbar popup: pick a capture and what happens after it (PLAN 3N). The
// capture runs in the service worker, since the popup closes as soon as the
// result tab opens; copying happens here, where there's a focused document.

import type { CaptureRequest, CaptureResponse } from "./background";
import { flashDone, openResult } from "./downloads";
import { blockedReason } from "./pages";
import { AFTER_CAPTURE, type AfterCapture, getSettings, setSettings } from "./settings";
import { getCapture } from "./store";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $<HTMLParagraphElement>("msg");
const visible = $<HTMLButtonElement>("visible");
const afterBtn = $<HTMLButtonElement>("afterBtn");
const afterMenu = $<HTMLDivElement>("afterMenu");

/** How long "Copied" / "Saved" stays before the popup closes. */
const DONE_MS = 1400;

function show(text: string) {
  msg.textContent = text;
  msg.hidden = false;
}

$("options").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});

// After capture: a menu of radio items, saved as soon as one is picked.
const settings = await getSettings();
function renderAfter(value: AfterCapture) {
  settings.afterCapture = value;
  $("afterValue").textContent = AFTER_CAPTURE.find((a) => a.value === value)?.label ?? "";
  afterMenu.querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.value === value));
  });
}
for (const { value, label } of AFTER_CAPTURE) {
  const item = document.createElement("button");
  item.setAttribute("role", "menuitemradio");
  item.dataset.value = value;
  item.textContent = label;
  item.addEventListener("click", () => {
    renderAfter(value);
    void setSettings({ afterCapture: value });
    setMenu(false);
  });
  afterMenu.append(item);
}
renderAfter(settings.afterCapture);

function setMenu(open: boolean) {
  afterMenu.hidden = !open;
  afterBtn.setAttribute("aria-expanded", String(open));
  if (open) afterMenu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
}
afterBtn.addEventListener("click", () =>
  setMenu(afterBtn.getAttribute("aria-expanded") !== "true"),
);
document.addEventListener("keydown", (e) => {
  if (afterMenu.hidden) return;
  if (e.key === "Escape") {
    e.preventDefault(); // keep the popup open
    setMenu(false);
    afterBtn.focus();
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const items = [...afterMenu.querySelectorAll<HTMLButtonElement>("button")];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(at + step + items.length) % items.length].focus();
  }
});
document.addEventListener("click", (e) => {
  if (!afterMenu.hidden && !(e.target as Element).closest(".after")) setMenu(false);
});

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
  if (!response.ok) {
    visible.disabled = false;
    show(`Couldn't capture this page: ${response.error}`);
    return;
  }
  if (response.done === "copy") {
    const capture = await getCapture(response.id);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": capture!.blob })]);
      await flashDone(tab.id);
      show("Copied to the clipboard.");
    } catch (e) {
      // Keep the capture: open it with the reason, so it can be copied there.
      const error = e instanceof Error ? e.message : String(e);
      await openResult(tab, response.id, `Couldn't copy: ${error}`);
    }
  } else if (response.done === "saved") {
    show(`Saved to ${response.path}`);
  }
  setTimeout(() => window.close(), response.done === "result" ? 0 : DONE_MS);
});
