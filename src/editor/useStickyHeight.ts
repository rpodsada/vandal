import { useEffect, type RefObject } from "react";

/**
 * The options bar grows when its contents wrap to another row, but doesn't
 * shrink back when a tool with fewer options is picked: otherwise switching
 * tools in a narrow window would resize the stage (and move the image) back
 * and forth. Resizing the window starts over.
 */
export function useStickyHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    let tallest = 0;
    let width = window.innerWidth;

    const measure = () => {
      const content = bar.firstElementChild as HTMLElement | null;
      const height = content?.offsetHeight ?? 0;
      if (height > tallest) {
        tallest = height;
        bar.style.minHeight = `${height}px`;
      }
    };
    // Its content is swapped (tool options ⇄ crop options): watch the new one.
    const observer = new ResizeObserver(measure);
    const watch = () => {
      observer.disconnect();
      if (bar.firstElementChild) observer.observe(bar.firstElementChild);
      measure();
    };
    const mutations = new MutationObserver(watch);
    mutations.observe(bar, { childList: true });
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      // Back to the natural height; the observer measures the new layout.
      tallest = 0;
      bar.style.minHeight = "";
    };
    window.addEventListener("resize", onResize);
    watch();
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [ref]);
}
