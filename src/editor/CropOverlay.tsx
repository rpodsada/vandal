import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { setDragHint } from "../markup/hints";
import { dragCrop, drawCrop, inFrame, type Handle, type Rect } from "./cropGeometry";
import { applyCrop, useCropStore } from "./cropStore";
import type { Point } from "./view";
import styles from "./EditorApp.module.css";

interface Props {
  draft: Rect;
  /** What the box can cover (the image as it was when crop mode began). */
  frame: Rect;
  /** CSS px per source px. */
  scale: number;
  /** CSS position of source pixel (0, 0) in the stage. */
  origin: Point;
  /** False while the stage pans. */
  interactive: boolean;
}

const CURSORS: Record<Handle | "new", string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  move: "move",
  new: "crosshair",
};

const EDGES: Handle[] = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

/** Below this many CSS px, a press outside the box is a click, not a new box. */
const DRAW_THRESHOLD = 4;

/**
 * Crop mode's box over the image (mockup "Editor", crop tool): the rest
 * dimmed, a rule-of-thirds grid, corner brackets. Drag an edge or corner to
 * resize (Shift keeps the proportions), inside to move, outside to draw a new
 * box (Shift: square). Double-click inside applies.
 */
export function CropOverlay({ draft, frame, scale, origin, interactive }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | "new" | null>(null);

  const toSource = (clientX: number, clientY: number): Point => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - origin.x) / scale, y: (clientY - r.top - origin.y) / scale };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Middle button and Space+drag pan (the stage handles those).
    if (!interactive || e.button !== 0) return;
    e.preventDefault();
    const handle = ((e.target as HTMLElement)
      .closest("[data-handle]")
      ?.getAttribute("data-handle") ?? "new") as Handle | "new";
    const start = toSource(e.clientX, e.clientY);
    const startRect = draft;
    const client = { x: e.clientX, y: e.clientY };
    const root = e.currentTarget;
    root.setPointerCapture(e.pointerId);
    setDragging(handle);
    setDragHint(handle === "new" ? "square" : handle === "move" ? null : "resize");

    const onMove = (m: globalThis.PointerEvent) => {
      const p = toSource(m.clientX, m.clientY);
      const { setDraft } = useCropStore.getState();
      if (handle === "new") {
        if (Math.hypot(m.clientX - client.x, m.clientY - client.y) < DRAW_THRESHOLD) return;
        setDraft(
          inFrame(frame, (size, local) =>
            drawCrop(local.point(start), local.point(p), size, m.shiftKey),
          ),
        );
      } else {
        setDraft(
          inFrame(frame, (size, local) =>
            dragCrop(local.rect(startRect), handle, p.x - start.x, p.y - start.y, size, m.shiftKey),
          ),
        );
      }
    };
    const onUp = () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      setDragging(null);
      setDragHint(null);
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", onUp);
  };

  const css = (r: Rect) => ({
    left: origin.x + r.x * scale,
    top: origin.y + r.y * scale,
    width: r.width * scale,
    height: r.height * scale,
  });
  const box: CSSProperties = css(draft);
  // The image around the box, dimmed: above, below, left, right.
  const f = frame;
  const d = draft;
  const dims: Rect[] = [
    { x: f.x, y: f.y, width: f.width, height: d.y - f.y },
    { x: f.x, y: d.y + d.height, width: f.width, height: f.y + f.height - d.y - d.height },
    { x: f.x, y: d.y, width: d.x - f.x, height: d.height },
    { x: d.x + d.width, y: d.y, width: f.x + f.width - d.x - d.width, height: d.height },
  ];

  return (
    <div
      ref={rootRef}
      className={styles.cropOverlay}
      style={{
        cursor: dragging ? CURSORS[dragging] : "crosshair",
        pointerEvents: interactive ? undefined : "none",
      }}
      onPointerDown={onPointerDown}
    >
      {dims.map((r, i) => (
        <div key={i} className={styles.cropDim} style={css(r)} />
      ))}
      <div
        className={styles.cropBox}
        style={box}
        data-handle="move"
        onDoubleClick={() => applyCrop()}
      >
        <span className={styles.cropThirds} />
        {(["nw", "ne", "sw", "se"] as const).map((c) => (
          <span key={c} className={`${styles.cropCorner} ${styles[`corner_${c}`]}`} />
        ))}
        {EDGES.map((h) => (
          <span
            key={h}
            data-handle={h}
            className={`${styles.cropHandle} ${styles[`handle_${h}`]}`}
            style={{ cursor: dragging ? undefined : CURSORS[h] }}
          />
        ))}
      </div>
    </div>
  );
}
