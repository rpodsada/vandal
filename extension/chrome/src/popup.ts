// The toolbar popup: pick a capture and what happens after it (PLAN 3N). The
// capture runs in the service worker, since the popup closes as soon as the
// result tab opens; copying happens here, where there's a focused document.

import type { CaptureKind, CaptureRequest, CaptureResponse } from "./messages";
import { flashDone, openResult } from "./downloads";
import { pageToast } from "./inpage";
import { blockedReason } from "./pages";
import { AFTER_CAPTURE, type AfterCapture, getSettings, setSettings } from "./settings";
import { getShortcuts } from "./shortcuts";
import { getCapture } from "./store";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $<HTMLParagraphElement>("msg");
const actions: [CaptureKind, HTMLButtonElement][] = [
  ["visible", $<HTMLButtonElement>("visible")],
  ["region", $<HTMLButtonElement>("region")],
  ["full", $<HTMLButtonElement>("full")],
];
const afterBtn = $<HTMLButtonElement>("afterBtn");
const afterMenu = $<HTMLDivElement>("afterMenu");

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

// Each action's shortcut, as the browser has it (the user may have changed it).
const shortcuts = await getShortcuts();
document.querySelectorAll<HTMLElement>("kbd[data-command]").forEach((kbd) => {
  kbd.textContent = shortcuts[kbd.dataset.command!] ?? "";
  kbd.hidden = !kbd.textContent;
});

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const reason = blockedReason(tab?.url);
if (reason || tab?.id === undefined) {
  for (const [, button] of actions) button.disabled = true;
  show(reason ?? "This page can't be captured.");
}

for (const [kind, button] of actions) button.addEventListener("click", () => void capture(kind));

async function capture(kind: CaptureKind) {
  if (tab?.id === undefined) return;
  for (const [, button] of actions) button.disabled = true;
  const request: CaptureRequest = { type: "capture", kind, tabId: tab.id };
  const response = (await chrome.runtime.sendMessage(request)) as CaptureResponse;
  if (!response.ok) {
    for (const [, button] of actions) button.disabled = false;
    show(`Couldn't capture this page: ${response.error}`);
    return;
  }
  if (response.done === "copy") {
    const capture = await getCapture(response.id);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": capture!.blob })]);
      await Promise.all([flashDone(tab.id), pageToast(tab.id, "Screenshot copied")]);
    } catch (e) {
      // Keep the capture: open it with the reason, so it can be copied there.
      const error = e instanceof Error ? e.message : String(e);
      await openResult(tab, response.id, { error: `Couldn't copy: ${error}` });
    }
  }
  // The region overlay, the result tab or the page's toast take over.
  window.close();
}
