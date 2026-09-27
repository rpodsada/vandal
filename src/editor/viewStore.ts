import { create } from "zustand";
import {
  clampView,
  fitView,
  panBy,
  stepZoom,
  zoomAt,
  type Point,
  type Size,
  type View,
} from "./view";

interface ViewState {
  /** Visible image size in device px (the crop). */
  image: Size | null;
  /** Stage size in CSS px. */
  viewport: Size | null;
  dpr: number;
  view: View;
  /** Refit whenever the viewport changes, until the user zooms or pans. */
  fitted: boolean;

  setImage: (image: Size) => void;
  setViewport: (viewport: Size, dpr: number) => void;
  fit: () => void;
  /** Zoom to `zoom` around `anchor` (CSS px in the viewport; default: its centre). */
  zoomTo: (zoom: number, anchor?: Point) => void;
  zoomStep: (dir: 1 | -1, anchor?: Point) => void;
  zoomBy: (factor: number, anchor?: Point) => void;
  pan: (dx: number, dy: number) => void;
}

export const useViewStore = create<ViewState>((set, get) => {
  /** Apply `f` when the image and viewport are known. */
  const withGeometry = (f: (s: ViewState, image: Size, viewport: Size) => Partial<ViewState>) => {
    const s = get();
    if (s.image && s.viewport) set(f(s, s.image, s.viewport));
  };
  const centre = (viewport: Size): Point => ({ x: viewport.width / 2, y: viewport.height / 2 });

  return {
    image: null,
    viewport: null,
    dpr: 1,
    view: { zoom: 1, x: 0, y: 0 },
    fitted: true,

    setImage: (image) => {
      set({ image, fitted: true });
      get().fit();
    },

    setViewport: (viewport, dpr) => {
      const prev = get().viewport;
      set({ viewport, dpr });
      withGeometry((s, image) => {
        if (s.fitted) return { view: fitView(image, viewport, dpr) };
        // Keep what was in the middle in the middle.
        const dx = prev ? (viewport.width - prev.width) / 2 : 0;
        const dy = prev ? (viewport.height - prev.height) / 2 : 0;
        return {
          view: clampView({ ...s.view, x: s.view.x + dx, y: s.view.y + dy }, image, viewport, dpr),
        };
      });
    },

    fit: () =>
      withGeometry((s, image, viewport) => ({
        fitted: true,
        view: fitView(image, viewport, s.dpr),
      })),

    zoomTo: (zoom, anchor) =>
      withGeometry((s, image, viewport) => ({
        fitted: false,
        view: zoomAt(s.view, zoom, anchor ?? centre(viewport), image, viewport, s.dpr),
      })),

    zoomStep: (dir, anchor) => get().zoomTo(stepZoom(get().view.zoom, dir), anchor),

    zoomBy: (factor, anchor) => get().zoomTo(get().view.zoom * factor, anchor),

    pan: (dx, dy) =>
      withGeometry((s, image, viewport) => {
        const view = panBy(s.view, dx, dy, image, viewport, s.dpr);
        // Panning an image that fits changes nothing; stay fitted.
        if (view.x === s.view.x && view.y === s.view.y) return {};
        return { fitted: false, view };
      }),
  };
});
