import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, events, type OverlayLoad } from "../shared/ipc";
import { cssToLocalPhysical } from "../shared/geometry";
import { drawFrame } from "./frame";
import { HintBar } from "./HintBar";
import {
  arrowDelta,
  clampPoint,
  cursorFor,
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

  // ---- keyboard ----

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!load) return;
      if (e.key === "Escape") return cancel();
      if (e.key === "Enter") return commitSelection();
      if (e.key === "f" || e.key === "F") {
        void commands.commitSelection(load.captureId, { kind: "monitorUnderCursor" });
        return;
      }
      if (e.key === "a" || e.key === "A") {
        void commands.commitSelection(load.captureId, { kind: "allMonitors" });
        return;
      }
      const delta = arrowDelta(e.key, e.shiftKey ? 10 : 1);
      if (delta && selection && size && !drag) {
        e.preventDefault();
        setSelection(moveRect(selection, delta.x, delta.y, size));
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
  }, [load, selection, size, drag, cancel, commitSelection]);

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

  // ---- render ----

  const css = (v: number) => v / scale;
  let cursor = "crosshair";
  if (drag?.mode === "move") cursor = "move";
  else if (drag?.mode === "resize") cursor = cursorFor({ kind: "edge", edges: drag.edges });
  else if (!drag && selection && pointer)
    cursor = cursorFor(hitTest(selection, pointer, HANDLE_TOLERANCE * scale));

  const creating = drag?.mode === "create";
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

      {load && focused && !drag && (
        <HintBar hasSelection={!!selection} atBottom={!!selection && css(selection.y) < 72} />
      )}
    </div>
  );
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
