// Where a menu or popover goes: under its anchor, kept inside the window.
// Menus are placed with `position: fixed`, so a clipping container (a
// settings card, the editor's options bar) can't cut them off.

import { useLayoutEffect, useRef, type RefObject } from "react";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 4;
const MARGIN = 8;

/**
 * Below `anchor`, left edges aligned; slid left if it would leave the
 * window, and flipped above if there's no room below but there is above.
 */
export function placeMenu(
  anchor: Box,
  menu: { width: number; height: number },
  view: { width: number; height: number },
): { left: number; top: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const left = clamp(anchor.left, MARGIN, view.width - MARGIN - menu.width);
  const below = anchor.top + anchor.height + GAP;
  const above = anchor.top - GAP - menu.height;
  const top =
    below + menu.height <= view.height - MARGIN
      ? below
      : above >= MARGIN
        ? above
        : clamp(below, MARGIN, view.height - MARGIN - menu.height);
  return { left: Math.max(MARGIN, left), top: Math.max(MARGIN, top) };
}

/**
 * Keep the open menu in `menuRef` placed against `anchor()` (a box in
 * window coordinates): on open, when the window resizes or scrolls, and when
 * the menu changes size (an error line appearing, say).
 */
export function useMenuPlacement(
  open: boolean,
  menuRef: RefObject<HTMLElement | null>,
  anchor: () => Box | null,
): void {
  const anchorRef = useRef(anchor);
  useLayoutEffect(() => {
    anchorRef.current = anchor;
  });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    const place = () => {
      const a = anchorRef.current();
      if (!a) return;
      menu.style.position = "fixed";
      // `min-width: 100%` would mean the window once fixed: use the anchor's.
      menu.style.minWidth = `${a.width}px`;
      const { left, top } = placeMenu(
        a,
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      );
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, menuRef]);
}

/** The box of an element, for `useMenuPlacement`. */
export function boxOf(el: Element | null | undefined): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
