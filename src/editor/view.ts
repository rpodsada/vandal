// View maths for the editor. Image pixels are device pixels at 100% zoom, so
// CSS size = image px / devicePixelRatio × zoom.

export interface Size {
  width: number;
  height: number;
}

/** Space kept free around the image when fitting, in CSS px. */
export const FIT_MARGIN = 24;

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
