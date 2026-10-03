// The region overlay (PLAN 3N.4). It shows the frozen frame the worker
// captured, lets the user drag and adjust an area like Vandal's capture
// overlay, then sends back the crop. The frame is drawn on a canvas, since a
// page's CSP can block data: and blob: images.

import type { RegionDone, RegionStart } from "../messages";
import { dataUrlToBlob, el, showHost, topLayerHost } from "./dom";
import css from "./region.css?inline";
import { type Handle, type Rect, fromPoints, growBy, moveBy, resizeBy, toImage } from "./rect";
import { showToast } from "./toast";

/** A drag shorter than this (CSS px) is a click, not a selection. */
const MIN_DRAG = 4;
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function startRegion(msg: RegionStart) {
  const frame = await createImageBitmap(dataUrlToBlob(msg.image));
  const view = { w: innerWidth, h: innerHeight };
  // Image pixels per CSS pixel: the device pixel ratio, page zoom included.
  const scale = frame.width / view.w;
  const fmt = new Intl.NumberFormat();

  // DOM
  const { host, root } = topLayerHost(
    "vandal-region",
    "position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;" +
      "overflow:hidden!important",
  );
  const canvas = el("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  canvas.style.width = `${view.w}px`;
  canvas.style.height = `${view.h}px`;
  canvas.getContext("2d")!.drawImage(frame, 0, 0);
  const dim = el("div", { class: "dim" });
  const sel = el("div", { class: "sel", hidden: "" });
  for (const h of HANDLES) sel.append(el("div", { class: "handle", "data-h": h }));
  const size = el("div", { class: "size", hidden: "" });
  const cancelBtn = el("button", { type: "button" }, "Cancel", el("kbd", {}, "Esc"));
  const captureBtn = el(
    "button",
    { type: "button", class: "primary" },
    "Capture",
    el("kbd", {}, "Enter"),
  );
  const bar = el("div", { class: "bar", hidden: "" }, cancelBtn, captureBtn);
  const hint = el(
    "div",
    { class: "hint" },
    el("span", {}, "Drag to pick an area"),
    el("span", {}, el("kbd", {}, "Esc"), "cancel"),
  );
  const ov = el("div", { class: "ov", tabindex: "-1" }, canvas, dim, sel, size, bar, hint);
  root.append(el("style", {}, css), ov);
  showHost(host);
  ov.focus({ preventScroll: true });

  // State
  let rect: Rect | null = null;
  type Drag =
    | { kind: "new"; x: number; y: number }
    | { kind: "move"; x: number; y: number; start: Rect }
    | { kind: "resize"; x: number; y: number; start: Rect; handle: Handle };
  let drag: Drag | null = null;

  function render() {
    const has = rect !== null;
    dim.hidden = has;
    sel.hidden = size.hidden = !has;
    bar.hidden = !has || drag !== null;
    hint.hidden = has;
    if (!rect) return;
    Object.assign(sel.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
    });
    const px = toImage(rect, scale, { w: frame.width, h: frame.height });
    size.textContent = `${fmt.format(px.w)} × ${fmt.format(px.h)}`;
    // The size sits above the selection, or inside it at the top edge.
    const sizeTop = rect.y >= 28 ? rect.y - 26 : rect.y + 4;
    Object.assign(size.style, { left: `${Math.max(rect.x - 1, 4)}px`, top: `${sizeTop}px` });
    if (!bar.hidden) placeBar(rect);
  }

  /** Below the selection's right end; above it, or inside, when there's no room. */
  function placeBar(r: Rect) {
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    let top = r.y + r.h + 8;
    if (top + bh > view.h - 8) top = r.y - bh - 8;
    if (top < 8) top = r.y + r.h - bh - 8;
    const left = Math.min(Math.max(r.x + r.w - bw, 8), view.w - bw - 8);
    Object.assign(bar.style, { left: `${left}px`, top: `${Math.max(top, 8)}px` });
  }

  function close() {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", cancel);
    host.remove();
  }

  function cancel() {
    close();
    frame.close();
  }

  async function confirm() {
    if (!rect) return;
    const crop = toImage(rect, scale, { w: frame.width, h: frame.height });
    close();
    const out = new OffscreenCanvas(crop.w, crop.h);
    out.getContext("2d")!.drawImage(frame, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    frame.close();
    const blob = await out.convertToBlob({ type: "image/png" });
    const done: RegionDone = { type: "region:done", image: await blobToDataUrl(blob) };
    if (msg.copy) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        done.copied = true;
        showToast("Screenshot copied");
      } catch (e) {
        done.copied = false;
        done.copyError = e instanceof Error ? e.message : String(e);
      }
    }
    await chrome.runtime.sendMessage(done);
  }

  // Pointer
  ov.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || bar.contains(e.target as Node)) return;
    const target = e.target as HTMLElement;
    const handle = target.dataset.h as Handle | undefined;
    if (rect && handle) drag = { kind: "resize", x: e.clientX, y: e.clientY, start: rect, handle };
    else if (rect && target === sel)
      drag = { kind: "move", x: e.clientX, y: e.clientY, start: rect };
    else drag = { kind: "new", x: e.clientX, y: e.clientY };
    ov.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  ov.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.kind === "new") {
      if (Math.abs(dx) < MIN_DRAG && Math.abs(dy) < MIN_DRAG) return;
      rect = fromPoints(drag.x, drag.y, e.clientX, e.clientY, view);
    } else if (drag.kind === "move") rect = moveBy(drag.start, dx, dy, view);
    else rect = resizeBy(drag.start, drag.handle, dx, dy, view);
    render();
  });
  ov.addEventListener("pointerup", () => {
    if (!drag) return;
    // Too thin to be meant: back to picking.
    if (rect && (rect.w < MIN_DRAG || rect.h < MIN_DRAG)) rect = null;
    drag = null;
    render();
  });
  ov.addEventListener("dblclick", (e) => {
    if (rect && sel.contains(e.target as Node)) void confirm();
  });
  ov.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    cancel();
  });
  ov.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  cancelBtn.addEventListener("click", cancel);
  captureBtn.addEventListener("click", () => void confirm());

  // Keys, ahead of the page's own handlers: the page is frozen meanwhile.
  function onKey(e: KeyboardEvent) {
    e.stopImmediatePropagation();
    if (e.key === "Tab") return; // between the bar's buttons
    if (e.key === "Escape") cancel();
    else if (e.key === "Enter") {
      if (root.activeElement === cancelBtn) cancel();
      else void confirm();
    } else if (rect && e.key.startsWith("Arrow")) {
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      rect = e.ctrlKey ? growBy(rect, dx, dy, view) : moveBy(rect, dx, dy, view);
      render();
    }
    e.preventDefault();
  }
  window.addEventListener("keydown", onKey, true);
  // The frozen frame no longer matches a resized viewport.
  window.addEventListener("resize", cancel);

  render();
}
