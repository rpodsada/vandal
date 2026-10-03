// Pages no extension may capture: the browser's own pages and the extension
// stores. The popup disables its actions there with this reason (PLAN 3N).

const OWN_PAGES = /^(chrome|edge|about|devtools|view-source|chrome-extension|chrome-search):/i;
const STORES = [
  /^https:\/\/chromewebstore\.google\.com\//i,
  /^https:\/\/chrome\.google\.com\/webstore/i,
  /^https:\/\/microsoftedge\.microsoft\.com\/addons/i,
];

/** Why this page can't be captured, or null if it can. */
export function blockedReason(url: string | undefined): string | null {
  if (!url) return "This page can't be captured.";
  if (OWN_PAGES.test(url)) return "The browser doesn't let extensions capture its own pages.";
  if (STORES.some((store) => store.test(url)))
    return "The browser doesn't let extensions capture the extension store.";
  return null;
}
