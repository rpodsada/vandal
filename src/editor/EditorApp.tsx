import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { docStore, hasUnsavedChanges } from "../markup/model/store";
import { useMarkupKeys } from "../markup/useMarkupKeys";
import { emptyDoc } from "../markup/model/types";
import { initialDoc } from "./handoff";
import { markupFromJson, markupToJson, readMarkup } from "./markupJson";
import { setMarkupClipboard } from "../markup/markupClipboard";
import { addCopies } from "../markup/objectActions";
import { useRedactSource } from "../markup/redact";
import { setTextRecognizer } from "../markup/textRedact";
import {
  commands,
  events,
  type EditorInit,
  type ExportAction,
  type FolderPosition,
  type FolderStep,
  type LeaveReason,
  type Settings,
} from "../shared/ipc";
import { alreadyDone, exportImage, markDelivered } from "./actions";
import { CommandBar } from "./CommandBar";
import { CropOptions } from "./CropOptions";
import { EmptyEditor } from "./EmptyEditor";
import { applyCrop, beginCrop, cancelCrop, useCropStore } from "./cropStore";
import { orientation } from "./orient";
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
  /** An image file's place among its folder's images (PLAN 3Q). */
  const [folderPosition, setFolderPosition] = useState<FolderPosition | null>(null);
  const flippingRef = useRef(false);
  /** Flip presses made while one was loading: run as one jump (PLAN 3Q). */
  const flipQueueRef = useRef<{ to: FolderStep | null; by: number }>({ to: null, by: 0 });
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

  // Show a document: on mount, and in place when flipping through a folder
  // (PLAN 3Q: no reload, so the toolbars and status bar stay put).
  const showDocument = useCallback(
    async (init: EditorInit, isCancelled: () => boolean = () => false) => {
      const pixels = await fetchPixels(init);
      if (isCancelled()) return;
      // The whole frame, so the crop can grow back (the stage clips it).
      paintFrame(canvasRef.current!, init, pixels);
      // Redactions preview from these pixels (PLAN 3D.3).
      useRedactSource.setState({
        image: { x: 0, y: 0, width: init.width, height: init.height, data: pixels },
      });
      // Redact's Detect text toggle reads this image's words (PLAN 3J).
      setTextRecognizer(() => commands.editorRecognizeText());
      cancelCrop();
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
      // A new image always starts fitted, even one the same size as the last.
      useViewStore.getState().setImage({ width: init.crop.width, height: init.crop.height });
      setFolderPosition(init.file ? await commands.editorFolderPosition() : null);
    },
    [],
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
        await showDocument(init, () => cancelled);
      } catch (e) {
        if (!cancelled) setStatus({ kind: "error", message: errorText(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showDocument]);

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

  // The right-click menu's copy and paste (PLAN 3R).
  useEffect(() => {
    setMarkupClipboard({
      copyAll: () => void copyMarkup(setNotice),
      paste: () => void pasteMarkup(setNotice),
      canPaste: async () => {
        const read = await commands.clipboardText();
        if (read.status === "error") return false;
        const markup = readMarkup(read.data);
        return markup.ok && markup.markup.annotations.length > 0;
      },
    });
    return () => setMarkupClipboard(null);
  }, []);

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

  // Rust keeps track of unsaved work, so the update notification only mentions
  // it when there is some (PLAN 3P.4).
  useEffect(() => {
    let unsaved = false;
    return docStore.subscribe((s) => {
      if (hasUnsavedChanges(s) === unsaved) return;
      unsaved = !unsaved;
      void commands.editorSetUnsaved(unsaved);
    });
  }, []);

  // An update is about to install (PLAN 3P): leave like closing, but a capture
  // with changes asks first rather than copying quietly, as when replaced.
  // Staying tells Rust, which then doesn't install.
  useEffect(() => {
    const unlisten = events.editorLeaveForUpdate.listen(async () => {
      let left = false;
      try {
        left = await leaveDocument("update");
      } catch (e) {
        setNotice({ text: `Not updated: ${errorText(e)}`, error: true });
      }
      if (left) await getCurrentWindow().destroy();
      else await commands.updateEditorKept();
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

  // Left/Right/Home/End: the folder's previous, next, first or last image
  // takes this one's place, like Windows Photos (PLAN 3Q). Only for an image
  // file, with nothing selected (arrows nudge a selection), not typing or
  // cropping. Unsaved changes ask first. The new image loads in place.
  /** One step (`by` along); false stops the presses still queued. */
  const flipOnce = useCallback(
    async (step: FolderStep, by: number): Promise<boolean> => {
      const at = await commands.editorFolderPosition();
      if (!at || at.count < 2) return false;
      if (step === "first" && at.index === 1) return true;
      if (step === "last" && at.index === at.count) return true;
      if (!(await leaveDocument("open"))) return false;
      const r = await commands.editorFlip(step, by);
      if (r.status === "error") {
        setNotice({ text: r.error, error: true });
        return false;
      }
      if (!r.data) return true;
      const init = await commands.editorInit();
      if (!init) return false;
      setNotice(null);
      await showDocument(init);
      return true;
    },
    [leaveDocument, showDocument],
  );

  /** Run the queued presses: those made while one loads add up into one jump. */
  const runFlips = useCallback(async () => {
    if (flippingRef.current) return;
    flippingRef.current = true;
    const queue = flipQueueRef.current;
    try {
      for (;;) {
        let step: FolderStep;
        let by = 1;
        if (queue.to) {
          step = queue.to;
          queue.to = null;
        } else if (queue.by) {
          step = queue.by > 0 ? "next" : "previous";
          by = Math.abs(queue.by);
          queue.by = 0;
        } else break;
        if (!(await flipOnce(step, by))) break;
      }
    } catch (e) {
      setNotice({ text: `Not opened: ${errorText(e)}`, error: true });
    } finally {
      queue.to = null;
      queue.by = 0;
      flippingRef.current = false;
    }
  }, [flipOnce]);

  useEffect(() => {
    const steps: Record<string, FolderStep> = {
      ArrowLeft: "previous",
      ArrowRight: "next",
      Home: "first",
      End: "last",
    };
    const onKey = (e: KeyboardEvent) => {
      const step = steps[e.code];
      if (!step || e.defaultPrevented || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      if (!initRef.current?.file || busyRef.current) return;
      if (isTyping(e.target) || useCropStore.getState().draft) return;
      if (docStore.getState().selection.length) return;
      e.preventDefault();
      const queue = flipQueueRef.current;
      if (step === "first" || step === "last") {
        // Home/End replace whatever was queued.
        queue.to = step;
        queue.by = 0;
      } else queue.by += step === "next" ? 1 : -1;
      void runFlips();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runFlips]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Hidden: the markup as JSON (markupJson.ts). Ctrl+Alt is never a tool's shortcut.
      if (e.ctrlKey && e.altKey && e.shiftKey && (e.code === "KeyC" || e.code === "KeyV")) {
        if (emptyRef.current || isTyping(e.target)) return;
        e.preventDefault();
        void (e.code === "KeyC" ? copyMarkup(setNotice) : replaceMarkup(setNotice));
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
          else view.cycleFit();
          break;
        default:
          return;
      }
      e.preventDefault();
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
        folderPosition={folderPosition}
        onReveal={(path) => void commands.revealFile(path)}
      />
    </div>
  );
}

/** Draw a raw RGBA base image onto `canvas` at 1:1. */
/**
 * The base image's RGBA pixels. An image file the page can decode (PLAN 3Q)
 * is fetched as the file itself (about 1 MB, decoded by the browser engine
 * and turned upright as Rust did) instead of raw pixels (48 MB for 12 MP).
 * Anything else, or a decode that doesn't come out the size Rust decoded,
 * uses the raw pixels.
 */
async function fetchPixels(init: EditorInit): Promise<Uint8ClampedArray<ArrayBuffer>> {
  if (init.sourceUrl) {
    try {
      const pixels = await decodeSource(init.sourceUrl, init);
      if (pixels) return pixels;
    } catch (e) {
      console.warn("Decoding the file failed; using raw pixels", e);
    }
  }
  const res = await fetch(init.url);
  if (!res.ok) throw new Error(`Couldn't load the image (HTTP ${res.status}).`);
  return new Uint8ClampedArray(await res.arrayBuffer());
}

async function decodeSource(
  url: string,
  init: EditorInit,
): Promise<Uint8ClampedArray<ArrayBuffer> | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  // Unrotated and without colour management: the same pixel values as
  // Rust's decode, which the export is made from.
  const bitmap = await createImageBitmap(await res.blob(), {
    imageOrientation: "none",
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  try {
    const upright = orientation(init.sourceOrientation, bitmap.width, bitmap.height);
    if (upright.width !== init.width || upright.height !== init.height) return null;
    const canvas = new OffscreenCanvas(upright.width, upright.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.setTransform(...upright.transform);
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, upright.width, upright.height).data;
  } finally {
    bitmap.close();
  }
}

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

type Notify = (notice: Notice) => void;

/** Copy the whole markup as JSON (the hidden shortcut, and the menu's Copy All Markup). */
async function copyMarkup(notify: Notify): Promise<void> {
  try {
    await navigator.clipboard.writeText(markupToJson(docStore.getState().doc));
    notify({ text: "Markup copied", success: true });
  } catch (e) {
    notify({ text: `Markup not copied: ${errorText(e)}`, error: true });
  }
}

/** The clipboard's text, from Rust: WebView2 asks permission for navigator.clipboard.readText. */
async function clipboardText(notify: Notify): Promise<string | null> {
  const read = await commands.clipboardText();
  if (read.status === "ok") return read.data;
  notify({ text: `Markup not pasted: ${read.error}`, error: true });
  return null;
}

/** The menu's Paste Markup: the clipboard's objects join the document, in front (PLAN 3R). */
async function pasteMarkup(notify: Notify): Promise<void> {
  const text = await clipboardText(notify);
  if (text === null) return;
  const read = readMarkup(text);
  if (!read.ok) {
    notify({ text: `Markup not pasted: ${read.reason}`, error: true });
    return;
  }
  const n = addCopies(read.markup.annotations).length;
  notify({ text: n === 1 ? "1 object pasted" : `${n} objects pasted`, success: true });
}

/** The hidden shortcut's paste: the clipboard's markup in place of the document's. */
async function replaceMarkup(notify: Notify): Promise<void> {
  const text = await clipboardText(notify);
  if (text === null) return;
  const store = docStore.getState();
  const pasted = markupFromJson(text, store.doc);
  if (!pasted.ok) {
    notify({ text: `Markup not pasted: ${pasted.reason}`, error: true });
    return;
  }
  store.replace(pasted.doc);
  const { madeFor } = pasted;
  notify(
    madeFor
      ? {
          text: `Markup pasted, without its crop: it was made for a ${madeFor.width}×${madeFor.height} image`,
          error: true,
        }
      : { text: "Markup pasted", success: true },
  );
}
