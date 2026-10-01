import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, events, type OverlayLoad } from "../shared/ipc";
import { cssToLocalPhysical } from "../shared/geometry";
import { drawFrame } from "./frame";
import { HintBar } from "./HintBar";
import { MarkupLayer } from "../markup/MarkupLayer";
import { useDoc } from "../markup/model/store";
import { wasTaken } from "../markup/pressRouting";
import { finishTextEdit } from "../markup/textEditing";
import { useToolStore } from "../markup/toolStore";
import { useMarkupKeys } from "../markup/useMarkupKeys";
import { useStyleSettings } from "../markup/useStyleSettings";
import { startToolStylesSync } from "../editor/toolStylesSync";
import { isTyping } from "../shared/dom";
import { handoffAnnotations, resetMarkup, uploadMarkup } from "./quickEdit";
import { QuickBar } from "./QuickBar";
import { toolbarPlacement, type Size } from "./toolbarPlacement";
import {
  arrowDelta,
  clampPoint,
  cursorFor,
  growRect,
  hitTest,
  moveRect,
  rectFromDrag,
  resizeRect,
  type Edges,
  type Point,
  type Rect,
} from "./selection";
import { visiblePart, windowAt } from "./windowPick";
import styles from "./OverlayApp.module.css";

const monitorIndex = Number(getCurrentWebviewWindow().label.replace("overlay-", ""));

/** CSS px a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 3;
/** How long the quick-edit toolbar's message stays up. */
const NOTICE_MS = 4000;
/** CSS px around the selection border that grab a resize handle. */
const HANDLE_TOLERANCE = 6;

type Drag =
  | { mode: "create"; anchor: Point; moved: boolean }
  | { mode: "move"; start: Point; orig: Rect }
  | { mode: "resize"; start: Point; orig: Rect; edges: Edges };

export function OverlayApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [load, setLoad] = useState<OverlayLoad | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [focused, setFocused] = useState(() => document.hasFocus());
  const barRef = useRef<HTMLDivElement>(null);
  const [barSize, setBarSize] = useState<Size | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  // Window mode (PLAN 3H, key W), shared by every overlay through Rust: the
  // window under the pointer, as an index into `load.windows`.
  const [picking, setPicking] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  /** The window a click started on; it's picked if the click ends there too. */
  const pressedWindow = useRef<number | null>(null);

  const scale = load?.scaleFactor ?? window.devicePixelRatio;
  const size = useMemo(() => (load ? { width: load.width, height: load.height } : null), [load]);

  // Quick edit's markup (PLAN 2B.2): the tools work while there's a selection.
  const quickEdit = !!load?.quickEdit;
  const creating = drag?.mode === "create";
  const quickActive = quickEdit && !!selection && !creating;
  const quickActiveRef = useRef(quickActive);
  useEffect(() => {
    quickActiveRef.current = quickActive;
  });
  // First, so the markup's keys (Esc steps, arrows on objects...) come before ours.
  useMarkupKeys(() => quickActiveRef.current);
  useStyleSettings();
  useEffect(() => startToolStylesSync(), []);
  const hasMarkup = useDoc((s) => s.doc.annotations.length > 0);
  // The overlay (monitor) whose selection has markup, if any: the others
  // leave the capture alone so the markup can't be thrown away from there.
  const [markupOwner, setMarkupOwner] = useState<number | null>(null);
  const lockedOut = markupOwner !== null && markupOwner !== monitorIndex;
  const tool = useToolStore((s) => s.tool);

  // ---- Rust â†’ overlay ----

  useEffect(() => {
    const canvas = canvasRef.current!;
    let captureId: number | null = null;

    const handleLoad = async (payload: OverlayLoad) => {
      if (payload.monitorIndex !== monitorIndex) return;
      captureId = payload.captureId;
      setLoad(payload);
      setSelection(null);
      setDrag(null);
      setPointer(null);
      setNotice(null);
      setBusy(false);
      setPicking(false);
      setHovered(null);
      resetMarkup(payload);
      setMarkupOwner(null);
      try {
        const report = await drawFrame(canvas, payload);
        await commands.overlayReady(payload.captureId, report);
      } catch (e) {
        // Rust shows the overlays after a timeout regardless.
        console.error(e);
      }
    };

    const listeners = [
      events.overlayLoad.listen(({ payload }) => void handleLoad(payload)),
      events.overlayShown.listen(({ payload }) => {
        if (payload.captureId !== captureId) return;
        // Two frames: the first rAF runs before paint, the second after it.
        requestAnimationFrame(() =>
          requestAnimationFrame(
            () => void commands.overlayVisible(payload.captureId, monitorIndex),
          ),
        );
      }),
      events.overlayMarkupOwner.listen(({ payload }) => {
        if (payload.captureId === captureId) setMarkupOwner(payload.owner);
      }),
      events.overlayWindowPick.listen(({ payload }) => {
        if (payload.captureId !== captureId) return;
        setPicking(payload.picking);
        setHovered(payload.hovered);
        if (payload.picking) {
          setSelection(null);
          setDrag(null);
        }
      }),
      events.overlayClearSelection.listen(({ payload }) => {
        if (payload.captureId === captureId && payload.monitorIndex !== monitorIndex) {
          setSelection(null);
          setDrag(null);
        }
      }),
    ];

    // Created after a capture started (display change)? Pick up our frame.
    void commands.overlayPendingLoad(monitorIndex).then((pending) => {
      if (pending) void handleLoad(pending);
    });

    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      for (const l of listeners) void l.then((unlisten) => unlisten());
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // ---- actions ----

  const commitSelection = useCallback(() => {
    if (!load || !selection) return;
    const { x, y } = load.physicalBounds;
    void commands.commitSelection(load.captureId, {
      kind: "region",
      rect: { ...selection, x: selection.x + x, y: selection.y + y },
    });
  }, [load, selection]);

  /** Window mode on or off, and the window under the pointer, on every overlay. */
  const setWindowPick = useCallback(
    (on: boolean, window: number | null) => {
      if (!load) return;
      setPicking(on);
      setHovered(window);
      void commands.windowPickChanged(load.captureId, on, window);
    },
    [load],
  );

  /** The window under a monitor-local point. */
  const windowUnder = useCallback(
    (p: Point) =>
      load
        ? windowAt(load.windows, { x: p.x + load.physicalBounds.x, y: p.y + load.physicalBounds.y })
        : null,
    [load],
  );

  const pickWindow = useCallback(
    (index: number) => {
      if (load) void commands.commitSelection(load.captureId, { kind: "window", index });
    },
    [load],
  );

  const cancel = useCallback(() => {
    if (load) void commands.cancelCapture(load.captureId);
  }, [load]);

  // Quick edit: the toolbar on the selection (PLAN 2B.1).
  const quickOutput = useCallback(
    async (action: "copy" | "save") => {
      if (!load || !selection || busy) return;
      const { x, y } = load.physicalBounds;
      setBusy(true);
      try {
        const markup = await uploadMarkup(load, selection);
        const r = await commands.quickOutput(
          load.captureId,
          { ...selection, x: selection.x + x, y: selection.y + y },
          action,
          markup,
        );
        if (r.status === "error") setNotice({ text: r.error, error: true });
        else if (!r.data.closed)
          setNotice({
            text: r.data.path ? `Saved ${r.data.path.split(/[\\/]/).pop()}` : "Copied",
          });
      } finally {
        setBusy(false);
      }
    },
    [load, selection, busy],
  );

  // Tell the other overlays when this selection gains or loses its markup.
  useEffect(() => {
    if (load?.quickEdit) void commands.quickMarkupChanged(load.captureId, monitorIndex, hasMarkup);
  }, [load, hasMarkup]);

  /** Enter / double-click: deliver the selection (with its markup, in quick edit). */
  const done = useCallback(async () => {
    if (!load || !selection) return;
    if (!quickEdit) return commitSelection();
    if (busy) return;
    const { x, y } = load.physicalBounds;
    setBusy(true);
    try {
      const markup = await uploadMarkup(load, selection);
      const r = await commands.quickDone(
        load.captureId,
        { ...selection, x: selection.x + x, y: selection.y + y },
        markup,
      );
      if (r.status === "error") setNotice({ text: r.error, error: true });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }, [load, selection, quickEdit, busy, commitSelection]);

  /** Quick edit's "Open in editor": the selection and its markup move to an editor window. */
  const openInEditor = useCallback(async () => {
    if (!load || !selection || busy) return;
    const { x, y } = load.physicalBounds;
    setBusy(true);
    try {
      const r = await commands.quickOpenEditor(
        load.captureId,
        { ...selection, x: selection.x + x, y: selection.y + y },
        handoffAnnotations(load),
      );
      if (r.status === "error") setNotice({ text: r.error, error: true });
    } finally {
      setBusy(false);
    }
  }, [load, selection, busy]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), notice.error ? 2 * NOTICE_MS : NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  // ---- keyboard ----

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Taken by the markup (or typed into a text box).
      if (!load || e.defaultPrevented || isTyping(e.target)) return;
      // The markup is on another monitor: its overlay has the keys.
      if (lockedOut) return;
      if (picking) {
        // Esc / W go back to selecting an area; Enter picks the highlighted window.
        if (e.key === "Escape" || (e.code === "KeyW" && !e.repeat && !hasModifier(e))) {
          setWindowPick(false, null);
          return;
        }
        if (e.key === "Enter") {
          if (hovered !== null) pickWindow(hovered);
          return;
        }
      }
      if (e.key === "Escape") return cancel();
      if (e.key === "Enter") return void done();
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "Comma") {
        e.preventDefault();
        if (!e.repeat) void commands.openSettings();
        return;
      }
      if (quickEdit && selection && e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.code === "KeyC" || e.code === "KeyS") {
          e.preventDefault();
          if (!e.repeat) void quickOutput(e.code === "KeyC" ? "copy" : "save");
          return;
        }
        if (e.code === "KeyE") {
          e.preventDefault();
          if (!e.repeat) void openInEditor();
          return;
        }
      }
      // With quick edit, F and A work only before there's a selection (A
      // becomes the arrow tool once the tools arrive).
      const wholeScreens = !(quickEdit && selection);
      if (wholeScreens && (e.key === "f" || e.key === "F")) {
        void commands.commitSelection(load.captureId, { kind: "monitorUnderCursor" });
        return;
      }
      if (wholeScreens && (e.key === "a" || e.key === "A")) {
        void commands.commitSelection(load.captureId, { kind: "allMonitors" });
        return;
      }
      if (wholeScreens && !picking && e.code === "KeyW" && !e.repeat && !hasModifier(e)) {
        setSelection(null);
        setDrag(null);
        setWindowPick(true, pointer ? windowUnder(pointer) : null);
        return;
      }
      const delta = arrowDelta(e.key, e.shiftKey ? 10 : 1);
      if (delta && selection && size && !drag) {
        e.preventDefault();
        // Ctrl resizes from the bottom-right edge; plain arrows move.
        setSelection(
          e.ctrlKey
            ? growRect(selection, delta.x, delta.y, size)
            : moveRect(selection, delta.x, delta.y, size),
        );
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      // The quick edit card has right-clicks of its own (edit a preset, open
      // the custom color picker), and none of them mean cancel.
      if (barRef.current?.contains(e.target as Node)) return;
      // Once there's markup (here or on another monitor), a stray right-click
      // doesn't throw it away.
      if (!hasMarkup && !lockedOut) cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [
    load,
    selection,
    size,
    drag,
    cancel,
    done,
    quickEdit,
    quickOutput,
    openInEditor,
    hasMarkup,
    lockedOut,
    picking,
    hovered,
    pointer,
    setWindowPick,
    windowUnder,
    pickWindow,
  ]);

  // ---- pointer ----

  const toLocal = (e: PointerEvent): Point =>
    clampPoint(
      { x: cssToLocalPhysical(e.clientX, scale), y: cssToLocalPhysical(e.clientY, scale) },
      size!,
    );

  /**
   * Quick edit shares the pointer with the markup: the selection's grips
   * always resize, a press outside the selection starts a new one (none once
   * there's markup), and inside it the markup goes first. What the markup
   * leaves (Select on empty space) moves the selection.
   */
  const onPointerDownCapture = (e: PointerEvent<HTMLDivElement>) => {
    if (!quickActive || e.button !== 0 || !selection) return;
    const target = e.target as Element;
    if (target.closest("[data-grip]") || barRef.current?.contains(target)) return;
    if (hitTest(selection, toLocal(e), 0)?.kind === "inside") return;
    // Outside: not the markup's.
    e.stopPropagation();
    if (useToolStore.getState().editing) finishTextEdit();
    if (!hasMarkup) onPointerDown(e);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !load || !size) return;
    // Selecting text in the box being typed into.
    if (wasTaken(e.nativeEvent) || isTyping(e.target)) return;
    if (lockedOut) {
      void commands.quickFocusOverlay(markupOwner);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (picking) {
      pressedWindow.current = windowUnder(toLocal(e));
      return;
    }
    const p = toLocal(e);
    const hit = selection ? hitTest(selection, p, HANDLE_TOLERANCE * scale) : null;
    if (selection && hit?.kind === "edge") {
      setDrag({ mode: "resize", start: p, orig: selection, edges: hit.edges });
    } else if (selection && hit?.kind === "inside") {
      setDrag({ mode: "move", start: p, orig: selection });
    } else {
      setDrag({ mode: "create", anchor: p, moved: false });
      setSelection(null);
      void commands.selectionStarted(load.captureId, monitorIndex);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!size) return;
    const p = toLocal(e);
    setPointer(p);
    if (picking) {
      const w = windowUnder(p);
      if (w !== hovered) setWindowPick(true, w);
      return;
    }
    if (!drag) return;
    switch (drag.mode) {
      case "create": {
        const threshold = DRAG_THRESHOLD * scale;
        const moved =
          drag.moved ||
          Math.abs(p.x - drag.anchor.x) >= threshold ||
          Math.abs(p.y - drag.anchor.y) >= threshold;
        if (moved) {
          if (!drag.moved) setDrag({ ...drag, moved: true });
          setSelection(rectFromDrag(drag.anchor, p, size));
        }
        break;
      }
      case "move":
        setSelection(moveRect(drag.orig, p.x - drag.start.x, p.y - drag.start.y, size));
        break;
      case "resize":
        setSelection(
          resizeRect(drag.orig, drag.edges, p.x - drag.start.x, p.y - drag.start.y, size),
        );
        break;
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (picking) {
      // Picked on release, so the release can't land on the window below.
      const w = pressedWindow.current;
      pressedWindow.current = null;
      if (e.button === 0 && w !== null && w === windowUnder(toLocal(e))) pickWindow(w);
      return;
    }
    // A click without a drag clears the selection rather than making a 1×1 one.
    if (drag?.mode === "create" && !drag.moved) setSelection(null);
    setDrag(null);
  };

  const onDoubleClick = (e: { nativeEvent: Event }) => {
    if (wasTaken(e.nativeEvent) || picking) return;
    // In quick edit only with the Select tool: otherwise it's a drawing gesture.
    if (quickEdit && tool !== "select") return;
    if (selection && pointer && hitTest(selection, pointer, 0)?.kind === "inside") {
      void done();
    }
  };

  // The toolbar's size, for its placement.
  const barShown = quickEdit && !!selection && drag?.mode !== "create";
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!barShown || !el) return;
    const measure = () => setBarSize({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [barShown]);

  // ---- render ----

  const css = (v: number) => v / scale;
  let cursor = picking ? "default" : "crosshair";
  if (drag?.mode === "move") cursor = "move";
  else if (drag?.mode === "resize") cursor = cursorFor({ kind: "edge", edges: drag.edges });
  else if (!drag && selection && pointer)
    cursor = cursorFor(hitTest(selection, pointer, HANDLE_TOLERANCE * scale));

  const showBar = quickActive;
  const placement =
    showBar && size && barSize
      ? toolbarPlacement(
          {
            x: css(selection.x),
            y: css(selection.y),
            width: css(selection.width),
            height: css(selection.height),
          },
          barSize,
          { width: css(size.width), height: css(size.height) },
        )
      : null;
  const showGuides = load && !selection && !drag && pointer && !picking;
  // The highlighted window: its part on this monitor, and the whole of it in
  // this monitor's pixels (it may run off the edges).
  const picked = picking && load && hovered !== null ? load.windows[hovered] : undefined;
  const windowShown = picked && load ? visiblePart(picked, load.physicalBounds) : null;
  const windowRect = picked &&
    load && {
      ...picked,
      x: picked.x - load.physicalBounds.x,
      y: picked.y - load.physicalBounds.y,
    };
  const showDimensions = load?.showDimensions ?? true;

  return (
    <div
      className={styles.root}
      style={{ cursor, ["--dim" as string]: load?.dimOpacity ?? 0.4 }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !drag && setPointer(null)}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={canvasRef} className={styles.frame} />
      {load && !selection && !windowShown && <div className={styles.dimAll} />}

      {windowRect && windowShown && (
        <>
          <div
            className={`${styles.selection} ${styles.window}`}
            style={{
              left: css(windowRect.x),
              top: css(windowRect.y),
              width: css(windowRect.width),
              height: css(windowRect.height),
            }}
          />
          {showDimensions && (
            <span
              className={styles.windowSize}
              style={{ left: css(windowShown.x) + 8, top: css(windowShown.y) + 8 }}
            >
              {windowRect.width} × {windowRect.height}
            </span>
          )}
        </>
      )}

      {showGuides && (
        <>
          <div className={styles.guideV} style={{ left: css(pointer.x) }} />
          <div className={styles.guideH} style={{ top: css(pointer.y) }} />
        </>
      )}

      {quickEdit && selection && size && (
        <MarkupLayer
          width={css(size.width)}
          height={css(size.height)}
          scale={1 / scale}
          offset={{ x: 0, y: 0 }}
          clip={selection}
          interactive={quickActive && !drag}
          emptyPress="pass"
        />
      )}

      {selection && (
        <div
          className={styles.selection}
          style={{
            left: css(selection.x),
            top: css(selection.y),
            width: css(selection.width),
            height: css(selection.height),
          }}
        >
          {!creating && (
            <>
              {quickEdit &&
                EDGES.map((edge) => (
                  <span
                    key={edge}
                    data-grip
                    className={`${styles.grip} ${styles[`grip_${edge}`]}`}
                  />
                ))}
              {HANDLES.map((h) => (
                <span
                  key={h}
                  data-grip={quickEdit || undefined}
                  className={`${styles.handle} ${styles[h]} ${quickEdit ? styles.handleLive : ""}`}
                />
              ))}
            </>
          )}
          {showDimensions && (
            <span className={css(selection.y) < 32 ? styles.sizeInside : styles.sizeAbove}>
              {selection.width} × {selection.height}
            </span>
          )}
        </div>
      )}

      {showBar && (
        <QuickBar
          ref={barRef}
          // Off screen until measured, so it never flashes in the wrong place.
          x={placement?.x ?? -10000}
          y={placement?.y ?? -10000}
          busy={busy}
          notice={notice}
          onCopy={() => void quickOutput("copy")}
          onSave={() => void quickOutput("save")}
          onOpenEditor={() => void openInEditor()}
          onExit={cancel}
        />
      )}

      {load && focused && !drag && !lockedOut && (
        <HintBar
          picking={picking}
          hasSelection={!!selection}
          quick={quickEdit}
          atBottom={!!selection && css(selection.y) < 72}
        />
      )}
    </div>
  );
}

const hasModifier = (e: KeyboardEvent) => e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
/** Grab strips along the edges (quick edit, where the markup covers the rest). */
const EDGES = ["n", "e", "s", "w"] as const;
