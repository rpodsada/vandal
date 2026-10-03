// The options page (PLAN 3N). Every change is saved right away to
// chrome.storage.sync; the popup and result tab read it from there.

import { DEFAULT_TEMPLATE, renderName } from "./filename";
import {
  AFTER_CAPTURE,
  type AfterCapture,
  type Settings,
  getSettings,
  nextNumber,
  setSettings,
} from "./settings";

import { COMMAND_LABELS, getShortcuts, openShortcutSettings } from "./shortcuts";
import { vandalStatus } from "./vandal";

const TOKENS = ["{title}", "{domain}", "{yyyy}", "{MM}", "{dd}", "{HH}", "{mm}", "{ss}", "{nnn}"];
/** The page the preview pretends to have captured. */
const SAMPLE = { title: "Example page title", url: "https://example.com/" };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const after = $<HTMLSelectElement>("afterCapture");
const saveAs = $<HTMLButtonElement>("saveAs");
const hideFixed = $<HTMLButtonElement>("hideFixed");
const closeAfterVandal = $<HTMLButtonElement>("closeAfterVandal");
const vandalHost = $<HTMLSelectElement>("vandalHost");
const template = $<HTMLInputElement>("template");
const reset = $<HTMLButtonElement>("resetTemplate");

const settings = await getSettings();
const number = await nextNumber();

// Fresh here: someone checking may have just installed Vandal.
const status = await vandalStatus(true);
for (const { value, label } of AFTER_CAPTURE) {
  if (value !== "vandal" || status.target || settings.afterCapture === "vandal")
    after.add(new Option(label, value));
}

function fill(s: Settings) {
  after.value = s.afterCapture;
  saveAs.setAttribute("aria-checked", String(s.saveAs));
  hideFixed.setAttribute("aria-checked", String(s.hideFixed));
  closeAfterVandal.setAttribute("aria-checked", String(s.closeAfterVandal));
  template.value = s.template;
  preview();
}
fill(settings);

function preview() {
  const name = renderName(template.value, { date: new Date(), ...SAMPLE, n: number });
  $("preview").textContent = `${name}.png`;
  reset.hidden = template.value === DEFAULT_TEMPLATE;
}

/** Text fields save shortly after typing stops, not on every key. */
let saveTimer: number | undefined;
function saveSoon(changes: Partial<Settings>) {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void setSettings(changes), 300);
}

after.addEventListener("change", () => {
  void setSettings({ afterCapture: after.value as AfterCapture });
});
/** A switch saves its setting on every flip. */
function bindSwitch(button: HTMLButtonElement, key: "saveAs" | "hideFixed" | "closeAfterVandal") {
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-checked") !== "true";
    button.setAttribute("aria-checked", String(on));
    void setSettings({ [key]: on });
  });
}
bindSwitch(saveAs, "saveAs");
bindSwitch(hideFixed, "hideFixed");
bindSwitch(closeAfterVandal, "closeAfterVandal");

// Vandal: whether it answers, and which one when there are two.
function showVandal() {
  const { found, target } = status;
  const line = $("vandalStatus");
  const dot = document.createElement("i");
  dot.className = target ? "dot" : "dot off";
  const text = document.createElement("span");
  if (target) {
    text.append(`Connected to ${target.name} ${target.version}`);
    const small = document.createElement("small");
    small.textContent = "Captures can open in its editor.";
    text.append(small);
  } else if (status.problem) {
    // Registered but refusing, e.g. a dev build that isn't running.
    text.append(status.problem);
  } else {
    text.append("Vandal isn't installed on this PC.");
    const small = document.createElement("small");
    small.textContent =
      "Install it to open captures in its editor. If you just installed it, restart the browser.";
    text.append(small);
  }
  line.replaceChildren(dot, text);
  $("getVandal").hidden = target !== null || status.problem !== undefined;
  $("closeRow").hidden = target === null;
  $("hostRow").hidden = found.length < 2;
  vandalHost.replaceChildren(...found.map((f) => new Option(f.name, f.host)));
  if (target) vandalHost.value = target.host;
}
showVandal();
vandalHost.addEventListener("change", () => {
  const host = vandalHost.value as Settings["vandalHost"];
  void setSettings({ vandalHost: host });
  status.target = status.found.find((f) => f.host === host) ?? status.target;
  showVandal();
});
template.addEventListener("input", () => {
  preview();
  saveSoon({ template: template.value });
});
reset.addEventListener("click", () => {
  template.value = DEFAULT_TEMPLATE;
  preview();
  void setSettings({ template: DEFAULT_TEMPLATE });
  template.focus();
});

const tokens = $("tokens");
for (const token of TOKENS) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.textContent = token;
  chip.title = `Insert ${token}`;
  chip.addEventListener("click", () => {
    template.setRangeText(token, template.selectionStart ?? 0, template.selectionEnd ?? 0, "end");
    template.focus();
    template.dispatchEvent(new Event("input"));
  });
  tokens.append(chip);
}

// The popup can change After capture while this page is open.
chrome.storage.sync.onChanged.addListener((changes) => {
  if (changes.afterCapture) after.value = changes.afterCapture.newValue as AfterCapture;
});

// Keyboard shortcuts: refreshed when the page comes back into view, e.g.
// after changing them on the browser's page.
async function showShortcuts() {
  const shortcuts = await getShortcuts();
  const rows = Object.entries(COMMAND_LABELS).flatMap(([name, label]) => {
    const key = document.createElement("kbd");
    key.textContent = shortcuts[name] || "Not set";
    key.classList.toggle("unset", !shortcuts[name]);
    const text = document.createElement("span");
    text.textContent = label;
    return [text, key];
  });
  $("keys").replaceChildren(...rows);
}
void showShortcuts();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void showShortcuts();
});
$("changeKeys").addEventListener("click", openShortcutSettings);

// Keep the clock in the preview current.
setInterval(preview, 1000);
