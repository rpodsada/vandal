// Crop mode (PLAN 2A step 7): a box over the image as it is now, to crop
// it further. The box is a draft until applied, so the whole session is one undo
// step and Esc can put things back. Crop is editor-only (quick edit's
// selection is its crop), so it's a mode of the editor, not a markup tool.

import { create } from "zustand";
import { docStore } from "../markup/model/store";
import { finishTextEdit } from "../markup/textEditing";
import { useToolStore } from "../markup/toolStore";
import type { Rect } from "./cropGeometry";

interface CropState {
  /** The box being adjusted, or null when not cropping. */
  draft: Rect | null;
  /**
   * What the box can cover: the crop when crop mode began, so cropping again
   * works inside the cropped image. "Show full capture" widens it to the
   * whole capture, to grow the crop back without undoing later work.
   */
  frame: Rect | null;
  /** The crop when crop mode began (Reset goes back to it). */
  start: Rect | null;
  setDraft: (rect: Rect) => void;
}

export const useCropStore = create<CropState>((set) => ({
  draft: null,
  frame: null,
  start: null,
  setDraft: (draft) => set({ draft }),
}));

export const isCropping = () => useCropStore.getState().draft !== null;

/** Enter crop mode with the current crop as the box. */
export function beginCrop(): void {
  if (isCropping()) return;
  if (useToolStore.getState().editing) finishTextEdit();
  const store = docStore.getState();
  store.select([]);
  const crop = store.doc.crop;
  useCropStore.setState({ draft: crop, frame: crop, start: crop });
}

/** Crop to the box (one undo step, none if unchanged) and leave crop mode. */
export function applyCrop(): void {
  const { draft } = useCropStore.getState();
  if (!draft) return;
  docStore.getState().crop(draft);
  useCropStore.setState({ draft: null, frame: null, start: null });
}

/** Leave crop mode without changing the crop. */
export function cancelCrop(): void {
  useCropStore.setState({ draft: null, frame: null, start: null });
}

/** Let the box cover the whole capture (the box itself stays where it is). */
export function showFullCapture(): void {
  if (!isCropping()) return;
  const { width, height } = docStore.getState().doc.source;
  useCropStore.setState({ frame: { x: 0, y: 0, width, height } });
}

/** Back to how crop mode began: the current image, the box around all of it. */
export function resetCrop(): void {
  const { start } = useCropStore.getState();
  if (start) useCropStore.setState({ draft: start, frame: start });
}
