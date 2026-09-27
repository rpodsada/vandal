import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands, type EditorInit } from "../shared/ipc";
import { Stage } from "./Stage";
import { StatusBar } from "./StatusBar";
import { useViewStore } from "./viewStore";
import styles from "./EditorApp.module.css";

type Status =
  { kind: "loading" } | { kind: "ready"; init: EditorInit } | { kind: "error"; message: string };

export function EditorApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

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
        useViewStore.getState().setImage({ width: init.crop.width, height: init.crop.height });
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const view = useViewStore.getState();
      switch (e.code) {
        case "KeyW":
          if (e.shiftKey) return;
          void getCurrentWindow().close();
          break;
        case "Equal":
        case "NumpadAdd":
          view.zoomStep(1);
          break;
        case "Minus":
        case "NumpadSubtract":
          view.zoomStep(-1);
          break;
        case "Digit0":
        case "Numpad0":
          if (e.shiftKey) view.zoomTo(1);
          else view.fit();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.app}>
      <Stage canvasRef={canvasRef} message={status.kind === "error" ? status.message : undefined} />
      <StatusBar />
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
