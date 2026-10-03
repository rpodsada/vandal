// The result tab (PLAN 3N): a preview of one capture with Copy, Save and
// Save as. The URL hash is the capture's id (the image is in IndexedDB),
// optionally with `&error=` and `&note=` to show (downloads.ts resultUrl).

import { captureName, saveImage } from "./downloads";
import { usesNumber } from "./filename";
import { countNumber, getSettings, nextNumber } from "./settings";
import { getCapture } from "./store";

/** Above this height Copy warns first: huge images paste slowly, if at all. */
const COPY_WARN_HEIGHT = 20_000;

type Zoom = "fit" | "width" | "actual";
let zoom: Zoom = "fit";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nameInput = $<HTMLInputElement>("name");
const shot = $<HTMLImageElement>("shot");
const stage = $<HTMLElement>("stage");
const toastEl = $<HTMLDivElement>("toast");
const buttons = [
  $<HTMLButtonElement>("copy"),
  $<HTMLButtonElement>("save"),
  $<HTMLButtonElement>("saveAs"),
];

const [captureId, query] = location.hash.slice(1).split("&", 2);
const extras = new URLSearchParams(query);
const errorText = extras.get("error");
const note = extras.get("note");
const capture = await getCapture(captureId);
if (!capture) {
  $("gone").hidden = false;
  $("zoom").hidden = true;
  nameInput.disabled = true;
  buttons.forEach((b) => (b.disabled = true));
} else {
  const settings = await getSettings();
  let number = await nextNumber();
  const name = () => captureName(capture, settings.template, number);
  nameInput.value = name();
  if (errorText) toast(errorText, [], "error");
  if (note) {
    $("note").textContent = note;
    $("note").hidden = false;
  }
  document.title = capture.title ? `Capture · ${capture.title}` : "Capture";

  const fmt = new Intl.NumberFormat();
  const mb = capture.blob.size / (1024 * 1024);
  $("dims").textContent =
    `${fmt.format(capture.width)} × ${fmt.format(capture.height)} px · ` +
    (mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(mb * 1024))} KB`);

  shot.src = URL.createObjectURL(capture.blob);
  shot.hidden = false;
  const tall = capture.height / devicePixelRatio > 2 * stage.clientHeight;
  setZoom(tall ? "width" : "fit");
  // Next frame: resizing the image inside the callback can change the stage's
  // scrollbar and so its size, which Chrome reports as a ResizeObserver loop.
  new ResizeObserver(() => requestAnimationFrame(layout)).observe(stage);
  $("zoom").addEventListener("click", (e) => {
    const zoom = (e.target as HTMLElement).closest<HTMLElement>("[data-zoom]")?.dataset.zoom;
    if (zoom) setZoom(zoom as Zoom);
  });

  $("copy").addEventListener("click", () => {
    if (capture.height <= COPY_WARN_HEIGHT) return void copy();
    toast(
      `This image is ${fmt.format(capture.height)} px tall, so pasting it may be slow or fail in some apps.`,
      [
        { label: "Copy anyway", primary: true, run: copy },
        { label: "Cancel", run: () => (toastEl.hidden = true) },
      ],
    );
  });

  async function copy() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": capture!.blob })]);
      toast("Copied to the clipboard.");
    } catch (e) {
      toast(`Couldn't copy: ${e instanceof Error ? e.message : String(e)}`, [], "error");
    }
  }

  $("save").addEventListener("click", () => void save(settings.saveAs));
  $("saveAs").addEventListener("click", () => void save(true));

  async function save(saveAs: boolean) {
    const url = URL.createObjectURL(capture!.blob);
    const saved = await saveImage(url, nameInput.value, saveAs);
    URL.revokeObjectURL(url);
    if (!saved.ok) {
      if (saved.error) toast(`Couldn't save: ${saved.error}`, [], "error");
      return;
    }
    // The number counts up only when it was used as the template made it.
    if (usesNumber(settings.template) && nameInput.value === name()) {
      await countNumber(number);
      number += 1;
      nameInput.value = name();
    }
    toast(`Saved to ${saved.path}`, [
      { label: "Show in folder", run: () => chrome.downloads.show(saved.id) },
    ]);
  }
}

function setZoom(next: Zoom) {
  zoom = next;
  document.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.zoom === zoom));
  });
  layout();
}

/** Size the image for the zoom. 100% is 1 image pixel per screen pixel, as in
 *  Vandal; neither fit mode enlarges past it. */
function layout() {
  if (!capture) return;
  const style = getComputedStyle(stage);
  const availW = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availH =
    stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const actual = capture.width / devicePixelRatio;
  let width = actual;
  if (zoom === "width") width = Math.min(actual, availW);
  else if (zoom === "fit")
    width = Math.min(actual, availW, (availH * capture.width) / capture.height);
  const px = `${Math.max(1, Math.floor(width))}px`;
  if (shot.style.width !== px) shot.style.width = px;
}

interface ToastAction {
  label: string;
  primary?: boolean;
  run: () => unknown;
}

let toastTimer: number | undefined;

function toast(text: string, actions: ToastAction[] = [], kind: "ok" | "error" = "ok") {
  clearTimeout(toastTimer);
  toastEl.replaceChildren();
  toastEl.dataset.kind = kind;
  const message = document.createElement("span");
  message.textContent = text;
  toastEl.append(message);
  for (const action of actions) {
    const button = document.createElement("button");
    button.className = action.primary ? "btn primary" : "link";
    button.textContent = action.label;
    button.addEventListener("click", () => void action.run());
    toastEl.append(button);
  }
  toastEl.hidden = false;
  // Toasts with a choice stay until it's made; the rest fade after a while.
  if (!actions.some((a) => a.primary))
    toastTimer = window.setTimeout(() => (toastEl.hidden = true), 8000);
}
