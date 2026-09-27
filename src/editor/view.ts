// View maths for the editor. Image pixels are device pixels at 100% zoom, so
// CSS size = image px / devicePixelRatio × zoom. The view never changes
// document coordinates (PLAN §4.6); it only says where the image is drawn.

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Zoom factor and the CSS position of the image's top-left corner in the viewport. */
export interface View {
  zoom: number;
  x: number;
  y: number;
}

/** Space kept free around the image when fitting or panning, in CSS px. */
export const FIT_MARGIN = 24;

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

/** Stops for the zoom buttons, shortcuts and menu. */
export const ZOOM_PRESETS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 16];

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The zoom that fits `image` (device px) into `viewport` (CSS px) with
 * {@link FIT_MARGIN} on each side, never above 100%.
 */
export function fitZoom(image: Size, viewport: Size, dpr: number): number {
  if (image.width <= 0 || image.height <= 0 || !(dpr > 0)) return 1;
  const w = Math.max(1, viewport.width - 2 * FIT_MARGIN);
  const h = Math.max(1, viewport.height - 2 * FIT_MARGIN);
  return Math.min(1, (w * dpr) / image.width, (h * dpr) / image.height);
}

/** CSS size of the image at `zoom`. */
export function displaySize(image: Size, zoom: number, dpr: number): Size {
  return { width: (image.width / dpr) * zoom, height: (image.height / dpr) * zoom };
}

/** The fitted view: {@link fitZoom}, centred. */
export function fitView(image: Size, viewport: Size, dpr: number): View {
  return clampView({ zoom: fitZoom(image, viewport, dpr), x: 0, y: 0 }, image, viewport, dpr);
}

/**
 * Keep the image in reach: on an axis where it fits inside the viewport
 * (minus margins) it is centred; otherwise its edges can't move further in
 * than {@link FIT_MARGIN}.
 */
export function clampView(view: View, image: Size, viewport: Size, dpr: number): View {
  const size = displaySize(image, view.zoom, dpr);
  const axis = (pos: number, len: number, avail: number) =>
    len <= avail - 2 * FIT_MARGIN
      ? (avail - len) / 2
      : Math.min(FIT_MARGIN, Math.max(avail - FIT_MARGIN - len, pos));
  return {
    zoom: view.zoom,
    x: axis(view.x, size.width, viewport.width),
    y: axis(view.y, size.height, viewport.height),
  };
}

/** Change zoom so the image point under `anchor` (CSS px in the viewport) stays put. */
export function zoomAt(
  view: View,
  zoom: number,
  anchor: Point,
  image: Size,
  viewport: Size,
  dpr: number,
): View {
  const z = clampZoom(zoom);
  const k = z / view.zoom;
  return clampView(
    { zoom: z, x: anchor.x - (anchor.x - view.x) * k, y: anchor.y - (anchor.y - view.y) * k },
    image,
    viewport,
    dpr,
  );
}

export function panBy(
  view: View,
  dx: number,
  dy: number,
  image: Size,
  viewport: Size,
  dpr: number,
): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, image, viewport, dpr);
}

/** The next preset above (`dir` 1) or below (-1) `zoom`. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const eps = 1e-6;
  if (dir > 0) return ZOOM_PRESETS.find((p) => p > zoom + eps) ?? MAX_ZOOM;
  return [...ZOOM_PRESETS].reverse().find((p) => p < zoom - eps) ?? MIN_ZOOM;
}

/** Zoom factor for a wheel event's `deltaY` (one mouse notch ≈ 100). */
export function wheelZoomFactor(deltaY: number): number {
  return Math.pow(2, -deltaY / 400);
}

/** Round a CSS position to whole device pixels so 100% stays crisp. */
export function snapToDevice(css: number, dpr: number): number {
  return Math.round(css * dpr) / dpr;
}

/** Zoom as a label, e.g. "67%", "150%". */
export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
