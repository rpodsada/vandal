import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands, type EditorInit } from "../shared/ipc";
import { displaySize, fitZoom, type Size } from "./view";
import styles from "./EditorApp.module.css";

type Status =
  { kind: "loading" } | { kind: "ready"; init: EditorInit } | { kind: "error"; message: string };

export function EditorApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [viewport, setViewport] = useState<Size | null>(null);

  // Fetch the base image, paint the crop, then let Rust show the window.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const init = await commands.editorInit();
        if (!init) throw new Error("This capture is no longer available.");
        const res = await fetch(init.url);
        if (!res.ok) throw new Error(`Couldn't load the image (HTTP ${res.status}).`);
        const pixels = new Uint8ClampedArray(await res.arrayBuffer());
        if (cancelled) return;
        paintCrop(canvasRef.current!, init, pixels);
        setStatus({ kind: "ready", init });
      } catch (e) {
        if (!cancelled)
          setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Show the window once whatever we have is on screen (two frames: layout, then paint).
  useEffect(() => {
    if (status.kind === "loading") return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => void commands.editorReady()),
    );
    return () => cancelAnimationFrame(id);
  }, [status.kind]);

  // Track the stage size; this also fires when the window moves to a monitor
  // with a different scale.
  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyW") {
        e.preventDefault();
        void getCurrentWindow().close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const init = status.kind === "ready" ? status.init : null;
  const image = init ? { width: init.crop.width, height: init.crop.height } : null;
  const dpr = window.devicePixelRatio;
  const zoom = image && viewport ? fitZoom(image, viewport, dpr) : 1;
  const css = image ? displaySize(image, zoom, dpr) : null;

  return (
    <div className={styles.app}>
      <div ref={stageRef} className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={styles.image}
          hidden={!css}
          style={css ? { width: css.width, height: css.height } : undefined}
        />
        {status.kind === "error" && <p className={styles.message}>{status.message}</p>}
      </div>
      <footer className={styles.status}>
        {image && (
          <>
            <span>
              {image.width} × {image.height} px
            </span>
            <span className={styles.spacer} />
            <span>{Math.round(zoom * 100)}%</span>
          </>
        )}
      </footer>
    </div>
  );
}

/** Draw the crop of a raw RGBA base image onto `canvas` at 1:1. */
function paintCrop(
  canvas: HTMLCanvasElement,
  init: EditorInit,
  pixels: Uint8ClampedArray<ArrayBuffer>,
) {
  const { crop } = init;
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context.");
  const base = new ImageData(pixels, init.width, init.height);
  ctx.putImageData(base, -crop.x, -crop.y, crop.x, crop.y, crop.width, crop.height);
}
