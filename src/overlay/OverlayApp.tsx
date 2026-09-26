import { useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, events } from "../shared/ipc";
import { drawFrame } from "./frame";
import styles from "./OverlayApp.module.css";

const monitorIndex = Number(getCurrentWebviewWindow().label.replace("overlay-", ""));

export function OverlayApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let captureId: number | null = null;

    const listeners = [
      events.overlayLoad.listen(async ({ payload }) => {
        if (payload.monitorIndex !== monitorIndex) return;
        captureId = payload.captureId;
        try {
          const report = await drawFrame(canvas, payload);
          await commands.overlayReady(payload.captureId, report);
        } catch (e) {
          // Rust shows the overlays after a timeout regardless.
          console.error(e);
        }
      }),
      events.overlayShown.listen(({ payload }) => {
        if (payload.captureId !== captureId) return;
        // Two frames: the first rAF runs before paint, the second after it.
        requestAnimationFrame(() =>
          requestAnimationFrame(
            () => void commands.overlayVisible(payload.captureId, monitorIndex),
          ),
        );
      }),
    ];

    const cancel = () => {
      if (captureId !== null) void commands.cancelCapture(captureId);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu);

    return () => {
      for (const l of listeners) void l.then((unlisten) => unlisten());
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.frame} />;
}
