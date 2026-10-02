import { create } from "zustand";
import {
  clampView,
  fitView,
  fitWidthView,
  panBy,
  stepZoom,
  topRow,
  zoomAt,
  type Point,
  type Size,
  type View,
} from "./view";

/** How the view keeps fitting when the window resizes; null once the user zooms. */
export type FitMode = "fit" | "width";

interface ViewState {
  /** Visible image size in device px (the crop). */
  image: Size | null;
  /** Stage size in CSS px. */
  viewport: Size | null;
  dpr: number;
  view: View;
  /**
   * Refit whenever the viewport changes, until the user zooms (or, with Fit,
   * pans). Fit width survives scrolling down the image.
   */
  fitted: FitMode | null;

  /** A new image, shown with Fit unless `mode` says otherwise. */
  setImage: (image: Size, mode?: FitMode) => void;
  setViewport: (viewport: Size, dpr: number) => void;
  fit: () => void;
  fitWidth: () => void;
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
    fitted: "fit",

    setImage: (image, mode = "fit") => {
      set({ image });
      if (mode === "width") get().fitWidth();
      else get().fit();
    },

    setViewport: (viewport, dpr) => {
      const { viewport: prev, dpr: prevDpr } = get();
      set({ viewport, dpr });
      withGeometry((s, image) => {
        if (s.fitted === "fit") return { view: fitView(image, viewport, dpr) };
        // Keep the row at the top at the top.
        if (s.fitted === "width")
          return { view: fitWidthView(image, viewport, dpr, topRow(s.view, prevDpr)) };
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
        fitted: "fit",
        view: fitView(image, viewport, s.dpr),
      })),

    fitWidth: () =>
      withGeometry((s, image, viewport) => ({
        fitted: "width",
        view: fitWidthView(image, viewport, s.dpr),
      })),

    zoomTo: (zoom, anchor) =>
      withGeometry((s, image, viewport) => ({
        fitted: null,
        view: zoomAt(s.view, zoom, anchor ?? centre(viewport), image, viewport, s.dpr),
      })),

    zoomStep: (dir, anchor) => get().zoomTo(stepZoom(get().view.zoom, dir), anchor),

    zoomBy: (factor, anchor) => get().zoomTo(get().view.zoom * factor, anchor),

    pan: (dx, dy) =>
      withGeometry((s, image, viewport) => {
        const view = panBy(s.view, dx, dy, image, viewport, s.dpr);
        // Panning an image that fits changes nothing; stay fitted. Fit width
        // fits across, so panning only scrolls down and up: it stays.
        if (view.x === s.view.x && view.y === s.view.y) return {};
        return { fitted: s.fitted === "width" ? "width" : null, view };
      }),
  };
});
