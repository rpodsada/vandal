// DOM helpers for what the extension shows inside pages (PLAN 3N): built with
// createElement (no innerHTML, which a page's Trusted Types policy can block).

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) node.setAttribute(name, value ?? "");
  node.append(...children);
  return node;
}

/** Decode a data: URL without fetch, which a page's CSP can block. */
export function dataUrlToBlob(url: string): Blob {
  const [head, data] = url.split(",", 2);
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: head.slice(5).split(";")[0] });
}

/** A custom element in the top layer with a closed shadow root, so page
 *  styles and z-indexes can't reach it. `css` is its inline position. */
export function topLayerHost(tag: string, css: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement(tag);
  host.setAttribute("popover", "manual");
  host.style.cssText =
    "all:initial!important;margin:0!important;padding:0!important;border:0!important;" +
    "background:transparent!important;z-index:2147483647!important;display:block!important;" +
    "max-width:none!important;max-height:none!important;" +
    css;
  const root = host.attachShadow({ mode: "closed" });
  return { host, root };
}

/** Put a host from `topLayerHost` on screen. */
export function showHost(host: HTMLElement) {
  document.documentElement.append(host);
  host.showPopover();
}
