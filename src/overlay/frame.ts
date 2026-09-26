import type { OverlayLoad, OverlayReport } from "../shared/ipc";

/** Fetch a frame from the `capture://` protocol and draw it 1:1 onto `canvas`. */
export async function drawFrame(
  canvas: HTMLCanvasElement,
  load: OverlayLoad,
): Promise<OverlayReport> {
  const t0 = performance.now();
  const res = await fetch(load.url);
  if (!res.ok) throw new Error(`frame fetch failed: HTTP ${res.status}`);

  if (canvas.width !== load.width) canvas.width = load.width;
  if (canvas.height !== load.height) canvas.height = load.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("no 2d context");

  let t1: number, t2: number, bytes: number;
  if (load.format === "rgba") {
    const buf = await res.arrayBuffer();
    t1 = performance.now();
    bytes = buf.byteLength;
    const image = new ImageData(new Uint8ClampedArray(buf), load.width, load.height);
    t2 = performance.now();
    ctx.putImageData(image, 0, 0);
  } else {
    const blob = await res.blob();
    t1 = performance.now();
    bytes = blob.size;
    // No colour management: the frozen image must match the screen exactly.
    const bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
    });
    t2 = performance.now();
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
  }
  const t3 = performance.now();

  return {
    monitorIndex: load.monitorIndex,
    fetchMs: t1 - t0,
    decodeMs: t2 - t1,
    drawMs: t3 - t2,
    bytes,
  };
}
