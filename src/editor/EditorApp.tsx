import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { docStore, hasUnsavedChanges } from "../markup/model/store";
import { useMarkupKeys } from "../markup/useMarkupKeys";
import { emptyDoc } from "../markup/model/types";
import { initialDoc } from "./handoff";
import { markupToJson } from "./markupJson";
import { useRedactSource } from "../markup/redact";
import {
  commands,
  type EditorInit,
  type ExportAction,
  type LeaveReason,
  type Settings,
} from "../shared/ipc";
import { alreadyDone, exportImage, markDelivered } from "./actions";
import { CommandBar } from "./CommandBar";
import { CropOptions } from "./CropOptions";
import { EmptyEditor } from "./EmptyEditor";
import { applyCrop, beginCrop, useCropStore } from "./cropStore";
import { Stage } from "./Stage";
import { useCropKeys } from "./useCropKeys";
import { StatusBar, type Notice } from "./StatusBar";
import { useViewStore } from "./viewStore";
import { useStickyHeight } from "./useStickyHeight";
import { isTyping } from "../shared/dom";
import { useHintSources } from "../markup/hints";
import { useStyleSettings } from "../markup/useStyleSettings";
import { flushToolStyles, startToolStylesSync } from "./toolStylesSync";
import { ToolOptions } from "../markup/ToolOptions";
import styles from "./EditorApp.module.css";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; init: EditorInit }
  // No image yet (PLAN 3G): a document opened from here loads into this window.
  | { kind: "empty" }
  | { kind: "error"; message: string };

const NOTICE_MS = 5000;

export function EditorApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const initRef = useRef<EditorInit | null>(null);
  const busyRef = useRef(false);
  const settingsRef = useRef<Settings | null>(null);
  const optionsBarRef = useRef<HTMLDivElement>(null);
  // Nothing to mark up or crop until an image loads into it.
  const emptyRef = useRef(false);
  useStickyHeight(optionsBarRef);
  useMarkupKeys(() => !emptyRef.current);
  useCropKeys(() => !emptyRef.current);
  const cropping = useCropStore((s) => s.draft !== null);
  const empty = status.kind === "empty";
  useEffect(
    () => useHintSources.setState({ mode: cropping ? "crop" : empty ? "empty" : null }),
    [cropping, empty],
  );

  // Fetch the base image, paint it, then let Rust show the window.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const init = await commands.editorInit();
        if (!init) throw new Error("This capture is no longer available.");
        if (init.empty) {
          initRef.current = init;
          emptyRef.current = true;
          setStatus({ kind: "empty" });
          return;
        }
        const res = await fetch(init.url);
        if (!res.ok) throw new Error(`Couldn't load the image (HTTP ${res.status}).`);
        const pixels = new Uint8ClampedArray(await res.arrayBuffer());
        if (cancelled) return;
        // The whole frame, so the crop can grow back (the stage clips it).
        paintFrame(canvasRef.current!, init, pixels);
        // Redactions preview from these pixels (PLAN 3D.3).
        useRedactSource.setState({
          image: { x: 0, y: 0, width: init.width, height: init.height, data: pixels },
        });
        docStore.getState().load(initialDoc(init));
        // Reopened from a notification: already delivered (PLAN 3D.1).
        if (init.delivered) markDelivered(docStore.getState().doc);
        // Markup handed over from quick edit hasn't been copied or saved yet.
        else if (init.markup)
          docStore.setState({
            baseline: emptyDoc({ width: init.width, height: init.height }, init.crop),
          });
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
  useStyleSettings((s) => {
    settingsRef.current = s;
  });

  // Tool styles carry over between windows (PLAN 2A.6d).
  useEffect(() => startToolStylesSync(), []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), notice.error ? 2 * NOTICE_MS : NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const run = useCallback(async (action: ExportAction) => {
    const init = initRef.current;
    if (!init || busyRef.current) return;
    // Copying or saving mid-crop uses the box on screen.
    applyCrop();
    busyRef.current = true;
    setBusy(true);
    try {
      const outcome = await exportImage(init, action);
      if (outcome.kind === "copied") setNotice({ text: "Copied to clipboard", success: true });
      if (outcome.kind === "saved")
        setNotice({
          text: `Saved ${fileName(outcome.path)}`,
          path: outcome.path,
          success: true,
        });
    } catch (e) {
      setNotice({ text: errorText(e), error: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  // Before the document goes (closing, or another image or capture taking
  // its place, PLAN 3H.6–3H.7). Closing a capture runs the on-close actions
  // not already done since the last change, or asks before losing changes
  // (PLAN Phase 2). An image file always asks instead (PLAN 2D), and so does
  // a capture being replaced: quietly copying it as it's replaced looked
  // like losing it (Richard, 3H.7). False: keep it. Throws if an export fails.
  const leaveDocument = useCallback(async (reason: LeaveReason): Promise<boolean> => {
    const init = initRef.current;
    if (!init || init.empty) return true;
    const onClose = settingsRef.current?.editor.onClose ?? { copy: true, save: false };
    applyCrop();
    await flushToolStyles();
    if (init.file || reason !== "close") {
      if (!hasUnsavedChanges(docStore.getState())) return true;
      const choice = await commands.editorConfirmClose(reason);
      if (choice === "cancel") return false;
      // Save can still be cancelled (the overwrite warning, Save As).
      return choice !== "save" || (await exportImage(init, "save")).kind !== "cancelled";
    }
    if (onClose.copy && !alreadyDone("copy")) await exportImage(init, "copy");
    if (onClose.save && !alreadyDone("save")) await exportImage(init, "save");
    if (!onClose.copy && !onClose.save && hasUnsavedChanges(docStore.getState())) {
      const choice = await commands.editorConfirmClose(reason);
      if (choice === "cancel") return false;
      if (choice === "save") await exportImage(init, "save");
    }
    return true;
  }, []);

  // Closing: X, Alt+F4, Ctrl+W.
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      try {
        if (!(await leaveDocument("close"))) event.preventDefault();
      } catch (e) {
        event.preventDefault();
        setNotice({ text: `Not closed: ${errorText(e)}`, error: true });
      }
    });
    return () => void unlisten.then((f) => f());
  }, [leaveDocument]);

  /** Ctrl+N / Capture: the capture comes back in this one's place (PLAN 3H.7). */
  const captureHere = useCallback(async () => {
    if (busyRef.current) return;
    try {
      if (!(await leaveDocument("capture"))) return;
    } catch (e) {
      setNotice({ text: `Not captured: ${errorText(e)}`, error: true });
      return;
    }
    await commands.editorNewCapture();
  }, [leaveDocument]);

  /** Ctrl+O / Open: the picked image takes this one's place (PLAN 3H.6). */
  const openImage = useCallback(async () => {
    if (busyRef.current) return;
    const paths = await commands.editorPickImages();
    if (!paths.length) return;
    try {
      if (!(await leaveDocument("open"))) return;
    } catch (e) {
      setNotice({ text: `Not opened: ${errorText(e)}`, error: true });
      return;
    }
    await commands.editorOpenHere(paths);
  }, [leaveDocument]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Hidden: the markup as JSON (markupJson.ts). Ctrl+Alt is never a tool's shortcut.
      if (e.ctrlKey && e.altKey && e.shiftKey && e.code === "KeyC") {
        if (emptyRef.current || isTyping(e.target)) return;
        e.preventDefault();
        void copyMarkup();
        return;
      }
      if (!e.ctrlKey || e.altKey) return;
      const view = useViewStore.getState();
      // An empty editor: only what gets an image, and closing (PLAN 3G).
      const allowed = ["KeyW", "KeyN", "KeyO", "KeyV", "Comma"];
      if (emptyRef.current && !allowed.includes(e.code)) return;
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
          void captureHere();
          break;
        case "KeyO":
          if (e.shiftKey) return;
          void openImage();
          break;
        case "Comma":
          if (e.shiftKey) return;
          void commands.openSettings();
          break;
        case "KeyV":
          // Paste an image into an empty editor.
          if (e.shiftKey || !emptyRef.current) return;
          void commands.editorPaste();
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
    const copyMarkup = async () => {
      try {
        await navigator.clipboard.writeText(markupToJson(docStore.getState().doc));
        setNotice({ text: "Markup copied as JSON", success: true });
      } catch (e) {
        setNotice({ text: `Markup not copied: ${errorText(e)}`, error: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, openImage, captureHere]);

  return (
    <div className={styles.app}>
      <CommandBar
        busy={busy || status.kind !== "ready"}
        cropping={cropping}
        empty={status.kind === "empty"}
        onCrop={() => (cropping ? applyCrop() : status.kind === "ready" && beginCrop())}
        onPickTool={applyCrop}
        onNewCapture={() => void captureHere()}
        onOpen={() => void openImage()}
        onCopy={() => void run("copy")}
        onSave={() => void run("save")}
        onSaveAs={() => void run("saveAs")}
      />
      <div ref={optionsBarRef} className={styles.optionsBar}>
        {status.kind === "empty" ? null : cropping ? <CropOptions /> : <ToolOptions />}
      </div>
      {status.kind === "empty" ? (
        <EmptyEditor onNewCapture={() => void captureHere()} onOpen={() => void openImage()} />
      ) : (
        <Stage
          canvasRef={canvasRef}
          message={status.kind === "error" ? status.message : undefined}
        />
      )}
      <StatusBar
        notice={notice}
        loaded={status.kind === "ready"}
        onReveal={(path) => void commands.revealFile(path)}
      />
    </div>
  );
}

/** Draw a raw RGBA base image onto `canvas` at 1:1. */
function paintFrame(
  canvas: HTMLCanvasElement,
  init: EditorInit,
  pixels: Uint8ClampedArray<ArrayBuffer>,
) {
  canvas.width = init.width;
  canvas.height = init.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context.");
  ctx.putImageData(new ImageData(pixels, init.width, init.height), 0, 0);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
