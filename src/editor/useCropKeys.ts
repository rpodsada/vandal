// Crop mode's keys (PLAN 2A step 7). The crop shortcut (C; PLAN 3F) enters
// it. While cropping: Enter or the crop shortcut applies, Esc cancels, arrows nudge the box (Shift = 10 px) and Ctrl+arrows
// resize it from the bottom-right, as on the capture overlay; a tool's shortcut
// applies and switches to that tool. Other markup shortcuts are held back
// (nothing to select or restyle), but saving, copying, zooming and panning
// still work.

import { useEffect, useRef } from "react";
import { shortcutOf } from "../markup/shortcuts";
import { useStyleConfig } from "../markup/styles";
import { isTool, useToolStore } from "../markup/toolStore";
import { isTyping } from "../shared/dom";
import { inFrame, nudgeCrop } from "./cropGeometry";
import {
  applyCrop,
  beginCrop,
  cancelCrop,
  isCropping,
  lockedRatio,
  useCropStore,
} from "./cropStore";

/** Editor shortcuts that still work while cropping (Ctrl + these codes). */
const PASS_WITH_CTRL = new Set([
  "KeyS",
  "KeyC",
  "KeyN",
  "KeyW",
  "Equal",
  "Minus",
  "NumpadAdd",
  "NumpadSubtract",
  "Digit0",
  "Numpad0",
]);

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** `active` (read on each key) switches them off, e.g. in an empty editor. */
export function useCropKeys(active?: () => boolean): void {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || (activeRef.current && !activeRef.current())) return;
      const id = shortcutOf(e, useStyleConfig.getState().shortcuts);
      if (!isCropping()) {
        if (id === "crop" && !e.repeat) {
          e.preventDefault();
          beginCrop();
        }
        return;
      }
      if (e.altKey && !id) return;
      if (e.code === "Space" || (e.ctrlKey && !id && PASS_WITH_CTRL.has(e.code))) return;
      // Everything else is crop mode's, not the markup's.
      e.stopImmediatePropagation();
      e.preventDefault();

      const arrow = ARROWS[e.code];
      if (arrow) {
        const { draft, frame, setDraft } = useCropStore.getState();
        const step = e.shiftKey ? 10 : 1;
        if (draft && frame)
          setDraft(
            inFrame(frame, (size, local) =>
              nudgeCrop(
                local.rect(draft),
                arrow[0] * step,
                arrow[1] * step,
                size,
                e.ctrlKey,
                lockedRatio(),
              ),
            ),
          );
        return;
      }
      if (e.ctrlKey && !id) {
        // Undo while cropping: drop the session rather than undo under it.
        if (e.code === "KeyZ" || e.code === "KeyY") cancelCrop();
        return;
      }
      if (e.code === "Enter" || e.code === "NumpadEnter" || id === "crop") {
        applyCrop();
      } else if (e.code === "Escape") {
        cancelCrop();
      } else if (id && isTool(id)) {
        applyCrop();
        useToolStore.getState().setTool(id);
      }
    };
    // Capture phase: ahead of the markup's own shortcuts.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
