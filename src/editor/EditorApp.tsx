import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { docStore, hasUnsavedChanges } from "../markup/model/store";
import { useMarkupKeys } from "../markup/useMarkupKeys";
import { emptyDoc } from "../markup/model/types";
import { commands, events, type EditorInit, type ExportAction, type Settings } from "../shared/ipc";
import { alreadyDone, exportImage } from "./actions";
import { CommandBar } from "./CommandBar";
import { Stage } from "./Stage";
import { StatusBar, type Notice } from "./StatusBar";
import { useViewStore } from "./viewStore";
import { isTyping } from "../shared/dom";
import { useStyleConfig } from "../markup/styles";
import { ToolOptions } from "../markup/ToolOptions";
import styles from "./EditorApp.module.css";

type Status =
  { kind: "loading" } | { kind: "ready"; init: EditorInit } | { kind: "error"; message: string };

const NOTICE_MS = 5000;

export function EditorApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const initRef = useRef<EditorInit | null>(null);
  const busyRef = useRef(false);
  const settingsRef = useRef<Settings | null>(null);
  useMarkupKeys();

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
        docStore.getState().load(emptyDoc({ width: init.width, height: init.height }, init.crop));
        useViewStore.getState().setImage({ width: init.crop.width, height: init.crop.height });
        initRef.current = init;
        setStatus({ kind: "ready", init });
      } catch (e) {
        if (!cancelled) setStatus({ kind: "error", message: errorText(e) });
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

  // Settings decide what closing does, and give the style pickers.
  useEffect(() => {
    const apply = (s: Settings) => {
      settingsRef.current = s;
      useStyleConfig.setState({
        styles: s.styles,
        shareColor: s.editor.shareColor,
        showShortcutHints: s.editor.showShortcutHints,
        drawingToolsSelect: s.editor.drawingToolsSelect,
      });
    };
    void commands.getSettings().then((s) => apply(s as Settings));
    const unlisten = events.settingsChanged.listen(({ payload }) => apply(payload as Settings));
    return () => void unlisten.then((f) => f());
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), notice.error ? 2 * NOTICE_MS : NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const run = useCallback(async (action: ExportAction) => {
    const init = initRef.current;
    if (!init || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const outcome = await exportImage(init, action);
      if (outcome.kind === "copied") setNotice({ text: "Copied to clipboard" });
      if (outcome.kind === "saved")
        setNotice({ text: `Saved ${fileName(outcome.path)}`, path: outcome.path });
    } catch (e) {
      setNotice({ text: errorText(e), error: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  // Closing (X, Alt+F4, Ctrl+W) runs the on-close actions not already done
  // since the last change, or asks before losing changes (PLAN Phase 2).
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      const init = initRef.current;
      if (!init) return;
      const onClose = settingsRef.current?.editor.onClose ?? { copy: true, save: false };
      try {
        if (onClose.copy && !alreadyDone("copy")) await exportImage(init, "copy");
        if (onClose.save && !alreadyDone("save")) await exportImage(init, "save");
        if (!onClose.copy && !onClose.save && hasUnsavedChanges(docStore.getState())) {
          const choice = await commands.editorConfirmClose();
          if (choice === "cancel") event.preventDefault();
          if (choice === "save") await exportImage(init, "save");
        }
      } catch (e) {
        event.preventDefault();
        setNotice({ text: `Not closed: ${errorText(e)}`, error: true });
      }
    });
    return () => void unlisten.then((f) => f());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const view = useViewStore.getState();
      switch (e.code) {
        case "KeyW":
          if (e.shiftKey) return;
          void getCurrentWindow().close();
          break;
        case "KeyC":
          if (e.shiftKey || isTyping(e.target)) return;
          void run("copy");
          break;
        case "KeyS":
          void run(e.shiftKey ? "saveAs" : "save");
          break;
        case "KeyN":
          if (e.shiftKey) return;
          void commands.editorNewCapture();
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
  }, [run]);

  return (
    <div className={styles.app}>
      <CommandBar
        busy={busy || status.kind !== "ready"}
        onNewCapture={() => void commands.editorNewCapture()}
        onCopy={() => void run("copy")}
        onSave={() => void run("save")}
        onSaveAs={() => void run("saveAs")}
      />
      <div className={styles.optionsBar}>
        <ToolOptions />
      </div>
      <Stage canvasRef={canvasRef} message={status.kind === "error" ? status.message : undefined} />
      <StatusBar notice={notice} onReveal={(path) => void commands.revealFile(path)} />
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

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
