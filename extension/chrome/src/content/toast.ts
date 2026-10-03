// A short confirmation at the top of the page (PLAN 3N), e.g. after a copy,
// which otherwise only shows as a badge on a toolbar icon that may be hidden.

import { el, showHost, topLayerHost } from "./dom";
import css from "./toast.css?inline";

const SHOW_MS = 2500;
const SVG = "http://www.w3.org/2000/svg";

export function showToast(text: string) {
  document.querySelector("vandal-toast")?.remove();
  const { host, root } = topLayerHost(
    "vandal-toast",
    "position:fixed!important;inset:16px auto auto 50%!important;" +
      "transform:translateX(-50%)!important;overflow:visible!important;pointer-events:none!important",
  );
  const check = document.createElementNS(SVG, "svg");
  check.setAttribute("viewBox", "0 0 16 16");
  check.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M3.5 8.5l3 3 6-7");
  check.append(path);
  const toast = el("div", { class: "toast", role: "status" }, check, el("span", {}, text));
  root.append(el("style", {}, css), toast);
  showHost(host);
  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => host.remove(), 200);
  }, SHOW_MS);
}
