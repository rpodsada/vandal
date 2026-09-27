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

  const scale = load?.scaleFactor ?? window.devicePixelRatio;
  const size = useMemo(() => (load ? { width: load.width, height: load.height } : null), [load]);

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

  const cancel = useCallback(() => {
    if (load) void commands.cancelCapture(load.captureId);
  }, [load]);

  // Quick edit: the toolbar on the selection (PLAN 2B.1).
  const quickEdit = !!load?.quickEdit;
  const quickOutput = useCallback(
    async (action: "copy" | "save") => {
      if (!load || !selection || busy) return;
      const { x, y } = load.physicalBounds;
      setBusy(true);
      try {
        const r = await commands.quickOutput(
          load.captureId,
          { ...selection, x: selection.x + x, y: selection.y + y },
          action,
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

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), notice.error ? 2 * NOTICE_MS : NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  // ---- keyboard ----

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!load) return;
      if (e.key === "Escape") return cancel();
      if (e.key === "Enter") return commitSelection();
      if (quickEdit && selection && e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.code === "KeyC" || e.code === "KeyS") {
          e.preventDefault();
          if (!e.repeat) void quickOutput(e.code === "KeyC" ? "copy" : "save");
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
      cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [load, selection, size, drag, cancel, commitSelection, quickEdit, quickOutput]);

  // ---- pointer ----

  const toLocal = (e: PointerEvent): Point =>
    clampPoint(
      { x: cssToLocalPhysical(e.clientX, scale), y: cssToLocalPhysical(e.clientY, scale) },
      size!,
    );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !load || !size) return;
    e.currentTarget.setPointerCapture(e.pointerId);
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

  const onPointerUp = () => {
    // A click without a drag clears the selection rather than making a 1×1 one.
    if (drag?.mode === "create" && !drag.moved) setSelection(null);
    setDrag(null);
  };

  const onDoubleClick = () => {
    if (selection && pointer && hitTest(selection, pointer, 0)?.kind === "inside") {
      commitSelection();
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
  let cursor = "crosshair";
  if (drag?.mode === "move") cursor = "move";
  else if (drag?.mode === "resize") cursor = cursorFor({ kind: "edge", edges: drag.edges });
  else if (!drag && selection && pointer)
    cursor = cursorFor(hitTest(selection, pointer, HANDLE_TOLERANCE * scale));

  const creating = drag?.mode === "create";
  const showBar = quickEdit && !!selection && !creating;
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
  const showGuides = load && !selection && !drag && pointer;
  const showDimensions = load?.showDimensions ?? true;

  return (
    <div
      className={styles.root}
      style={{ cursor, ["--dim" as string]: load?.dimOpacity ?? 0.4 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !drag && setPointer(null)}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={canvasRef} className={styles.frame} />
      {load && !selection && <div className={styles.dimAll} />}

      {showGuides && (
        <>
          <div className={styles.guideV} style={{ left: css(pointer.x) }} />
          <div className={styles.guideH} style={{ top: css(pointer.y) }} />
        </>
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
          {!creating &&
            HANDLES.map((h) => <span key={h} className={`${styles.handle} ${styles[h]}`} />)}
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
          onExit={cancel}
        />
      )}

      {load && focused && !drag && (
        <HintBar
          hasSelection={!!selection}
          quick={quickEdit}
          atBottom={!!selection && css(selection.y) < 72}
        />
      )}
    </div>
  );
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
