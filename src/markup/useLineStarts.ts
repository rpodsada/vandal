// A wrapping row of groups (the options bar) marks the groups that start a
// new line, so their separator can hide there.

import { useLayoutEffect, type RefObject } from "react";

/**
 * Which items start a new line, given their boxes in order: those that
 * begin below the bottom of the one before (items on a line can differ in
 * height, so tops alone aren't enough).
 */
export function lineStarts(boxes: readonly { top: number; height: number }[]): boolean[] {
  return boxes.map((b, i) => i > 0 && b.top >= boxes[i - 1].top + boxes[i - 1].height);
}

/** Keep `data-line-start` on the children of `ref` that begin a new line. */
export function useLineStarts(ref: RefObject<HTMLElement | null>): void {
  // Every render: what the bar holds changes with the tool and selection.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      const children = [...el.children] as HTMLElement[];
      const starts = lineStarts(
        children.map((c) => ({ top: c.offsetTop, height: c.offsetHeight })),
      );
      children.forEach((c, i) => {
        // Only the separator reacts, and it takes no space: no layout loop.
        if (starts[i]) c.dataset.lineStart = "";
        else delete c.dataset.lineStart;
      });
    };
    mark();
    const observer = new ResizeObserver(mark);
    observer.observe(el);
    return () => observer.disconnect();
  });
}
