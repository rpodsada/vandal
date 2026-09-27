// Crop mode (PLAN 2A step 7): a box over the image as it is now, to crop
// it further. The box is a draft until applied, so the whole session is one undo
// step and Esc can put things back. Crop is editor-only (quick edit's
// selection is its crop), so it's a mode of the editor, not a markup tool.

import { create } from "zustand";
import { docStore } from "../markup/model/store";
import { finishTextEdit } from "../markup/textEditing";
import { useToolStore } from "../markup/toolStore";
import { fitRatio, inFrame, type Rect } from "./cropGeometry";

/** The aspect-ratio buttons, in order. "original" is the image as crop mode found it. */
export const CROP_RATIOS = [
  { id: "free", label: "Free" },
  { id: "original", label: "Original" },
  { id: "1:1", label: "1:1" },
  { id: "4:3", label: "4:3" },
  { id: "16:9", label: "16:9" },
  { id: "2:1", label: "2:1" },
] as const;

/** Width / height of the locked ratio, or undefined for free. */
export function lockedRatio(): number | undefined {
  const { ratio: cropRatio, portrait: cropPortrait, start } = useCropStore.getState();
  let r: number | undefined;
  if (cropRatio === "original") r = start ? start.width / start.height : undefined;
  else {
    const m = /^(\d+):(\d+)$/.exec(cropRatio);
    if (m && +m[2]) r = +m[1] / +m[2];
    // Portrait turns it (16:9 → 9:16); Original is already the image's own way up.
    if (r && cropPortrait) r = 1 / r;
  }
  return r;
}

/** `box` held to the locked ratio, if there is one (the largest such box inside it). */
function fitted(box: Rect): Rect {
  const r = lockedRatio();
  return r ? fitRatio(box, r) : box;
}

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
  /**
   * The aspect ratio ("free", "original" or "w:h") and whether it's turned to
   * portrait. For this crop only: each crop starts free.
   */
  ratio: string;
  portrait: boolean;
  setDraft: (rect: Rect) => void;
}

export const useCropStore = create<CropState>((set) => ({
  draft: null,
  frame: null,
  start: null,
  ratio: "free",
  portrait: false,
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
  // Each crop starts free, with the box around the whole image.
  useCropStore.setState({ draft: crop, frame: crop, start: crop, ratio: "free", portrait: false });
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
  if (start) useCropStore.setState({ draft: fitted(start), frame: start });
}

/** Lock the box to an aspect ratio (a `CROP_RATIOS` id), refitting it now. */
export function setCropRatio(id: string): void {
  useCropStore.setState({ ratio: id });
  refit();
}

/** Turn the locked ratio between landscape and portrait. */
export function toggleCropPortrait(): void {
  useCropStore.setState((s) => ({ portrait: !s.portrait }));
  refit();
}

/** The largest box of the locked ratio inside the image, centred on the box. */
function refit(): void {
  const { draft, frame } = useCropStore.getState();
  const r = lockedRatio();
  if (!draft || !frame || !r) return;
  // Grow to the whole image's worth first, so turning 16:9 into 9:16 isn't
  // stuck inside the old box; then centre on where the box was.
  const whole = inFrame(frame, (size) => fitRatio({ x: 0, y: 0, ...size }, r));
  const cx = draft.x + draft.width / 2;
  const cy = draft.y + draft.height / 2;
  const x = Math.round(
    Math.min(Math.max(cx - whole.width / 2, frame.x), frame.x + frame.width - whole.width),
  );
  const y = Math.round(
    Math.min(Math.max(cy - whole.height / 2, frame.y), frame.y + frame.height - whole.height),
  );
  useCropStore.setState({ draft: { ...whole, x, y } });
}
