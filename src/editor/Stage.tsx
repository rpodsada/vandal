import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type Ref } from "react";
import { MarkupLayer } from "../markup/MarkupLayer";
import { useDoc } from "../markup/model/store";
import { displaySize, snapToDevice, wheelZoomFactor } from "./view";
import { useViewStore } from "./viewStore";
import { isTyping } from "../shared/dom";
import styles from "./EditorApp.module.css";

interface Props {
  canvasRef: Ref<HTMLCanvasElement>;
  /** Shown instead of the image (e.g. a load error). */
  message?: string;
}

/**
 * The image area: draws the canvas where the view says, and handles zoom
 * (Ctrl+wheel / pinch) and pan (wheel, Space+drag, middle-drag).
 */
export function Stage({ canvasRef, message }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const image = useViewStore((s) => s.image);
  const view = useViewStore((s) => s.view);
  const dpr = useViewStore((s) => s.dpr);
  const viewport = useViewStore((s) => s.viewport);
  const crop = useDoc((s) => s.doc.crop);
  const space = useSpaceHeld();
  const [panning, setPanning] = useState<{ id: number; x: number; y: number } | null>(null);

  // Track the stage size; this also fires when the window moves to a monitor
  // with a different scale.
  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const observer = new ResizeObserver(([entry]) =>
      useViewStore
        .getState()
        .setViewport(
          { width: entry.contentRect.width, height: entry.contentRect.height },
          window.devicePixelRatio,
        ),
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Wheel needs a non-passive listener to stop the page from scrolling/zooming.
  useEffect(() => {
    const stage = stageRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const store = useViewStore.getState();
      const rect = stage.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Line-mode deltas (some mice) are ~3 per notch; scale to pixels.
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 33 : 1;
      if (e.ctrlKey) {
        // Also what a touchpad pinch sends.
        store.zoomBy(wheelZoomFactor(e.deltaY * unit), anchor);
      } else if (e.shiftKey) {
        store.pan(-(e.deltaY || e.deltaX) * unit, 0);
      } else {
        store.pan(-e.deltaX * unit, -e.deltaY * unit);
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const middle = e.button === 1;
    if (!middle && !(e.button === 0 && space)) return;
    e.preventDefault(); // no autoscroll on middle-click
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning({ id: e.pointerId, x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!panning || e.pointerId !== panning.id) return;
    useViewStore.getState().pan(e.clientX - panning.x, e.clientY - panning.y);
    setPanning({ ...panning, x: e.clientX, y: e.clientY });
  };
  const endPan = (e: PointerEvent<HTMLDivElement>) => {
    if (panning && e.pointerId === panning.id) setPanning(null);
  };

  const css = image ? displaySize(image, view.zoom, dpr) : null;
  const cursor = panning ? "grabbing" : space ? "grab" : undefined;
  // The canvas shows the crop at (x, y); annotations are in source px.
  const x = snapToDevice(view.x, dpr);
  const y = snapToDevice(view.y, dpr);
  const scale = view.zoom / dpr;

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <canvas
        ref={canvasRef}
        className={styles.image}
        hidden={!css}
        style={
          css
            ? {
                width: css.width,
                height: css.height,
                transform: `translate(${x}px, ${y}px)`,
                // Show real pixels when zoomed in; smooth when zoomed out.
                imageRendering: view.zoom > 1 ? "pixelated" : "auto",
              }
            : undefined
        }
      />
      {css && viewport && (
        <MarkupLayer
          width={viewport.width}
          height={viewport.height}
          scale={scale}
          offset={{ x: x - crop.x * scale, y: y - crop.y * scale }}
          interactive={!space && !panning}
        />
      )}
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );
}

/** Whether Space is held (for Space+drag panning). */
function useSpaceHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault(); // don't press focused buttons
      if (!e.repeat) setHeld(true);
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setHeld(false);
    const blur = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return held;
}
