import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Ellipse, Group, Layer, Rect as KRect, Stage, Transformer } from "react-konva";
import { registerAnnotationGroup } from "./export";
import { rectFromDrag, rectsIntersect, annotationBounds, translateAnnotation } from "./geometry";
import { docStore, useDoc } from "./model/store";
import type { Annotation, AnnotationId, Point, Rect, ShapeAnnotation } from "./model/types";
import { useToolStore } from "./toolStore";
import styles from "./markup.module.css";

/** Selection chrome color: the overlay accent, readable over any screenshot. */
const CHROME = "#4c8dff";
/** Screen px a press must travel before it counts as a drag. */
const DRAG_THRESHOLD = 3;
/** Screen px of extra grab area around thin outlines. */
const HIT_SLOP = 12;
/** Drawn shapes smaller than this (screen px) are treated as a click and dropped. */
const MIN_DRAWN = 4;
/** Degrees from a 45° step within which rotation snaps to it. */
const ROTATION_SNAP = 6;

/** A circular-arrow cursor for the rotate handle (white-edged to show on any image). */
const ROTATE_CURSOR = (() => {
  const arrow =
    '<path d="M18.5 8.5A7.5 7.5 0 1 0 19.5 14" fill="none" stroke-linecap="round"/>' +
    '<path d="M20 4.5v5h-5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    `<g stroke="#fff" stroke-width="4">${arrow}</g>` +
    `<g stroke="#000" stroke-width="1.8">${arrow}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
})();

interface Props {
  /** Surface size in CSS px. */
  width: number;
  height: number;
  /** CSS px per source px. */
  scale: number;
  /** CSS position of source pixel (0, 0). */
  offset: Point;
  /** Tools respond (false while the host pans). */
  interactive: boolean;
}

type Drag =
  | {
      mode: "move";
      start: Point;
      client: Point;
      originals: Map<AnnotationId, Annotation>;
      began: boolean;
    }
  | { mode: "draw"; start: Point; id: AnnotationId }
  | { mode: "marquee"; start: Point; base: AnnotationId[] };

/**
 * The annotation layer (shared by quick edit and the editor): draws the
 * document over the host's image and runs the tools. Geometry is in source
 * pixels; `scale`/`offset` map it onto the surface.
 */
export function MarkupLayer({ width, height, scale, offset, interactive }: Props) {
  const doc = useDoc((s) => s.doc);
  const selection = useDoc((s) => s.selection);
  const tool = useToolStore((s) => s.tool);
  const stageRef = useRef<Konva.Stage>(null);
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  // Latest view for window-level drag handlers.
  const view = useRef({ scale, offset });
  useLayoutEffect(() => {
    view.current = { scale, offset };
  });

  useEffect(() => {
    registerAnnotationGroup(groupRef.current);
    return () => registerAnnotationGroup(null);
  }, []);

  // Keep the transformer on the selected shapes (and in step with zoom/pan).
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selection
      .map((id) => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [selection, doc, scale, offset.x, offset.y]);

  // The host's cursor (e.g. the pan hand) wins while tools are off.
  useEffect(() => {
    const container = stageRef.current?.container();
    if (container && !interactive) container.style.cursor = "";
  }, [interactive]);

  const toSource = (clientX: number, clientY: number): Point => {
    const r = stageRef.current!.container().getBoundingClientRect();
    const { scale: s, offset: o } = view.current;
    return { x: (clientX - r.left - o.x) / s, y: (clientY - r.top - o.y) / s };
  };

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const ev = e.evt;
    if (!interactive || ev.button !== 0) return;
    // Transformer handles run themselves.
    if (e.target.getParent() instanceof Konva.Transformer) return;

    const store = docStore.getState();
    const p = toSource(ev.clientX, ev.clientY);
    const hit = e.target.name() === "annotation" ? e.target.id() : null;
    let drag: Drag;

    if (hit) {
      let sel = store.selection;
      if (ev.shiftKey) {
        sel = sel.includes(hit) ? sel.filter((id) => id !== hit) : [...sel, hit];
        store.select(sel);
        if (!sel.includes(hit)) return;
      } else if (!sel.includes(hit)) {
        sel = [hit];
        store.select(sel);
      }
      const originals = new Map(
        store.doc.annotations.filter((a) => sel.includes(a.id)).map((a) => [a.id, a]),
      );
      drag = {
        mode: "move",
        start: p,
        client: { x: ev.clientX, y: ev.clientY },
        originals,
        began: false,
      };
    } else if (tool === "select") {
      const base = ev.shiftKey ? store.selection : [];
      store.select(base);
      drag = { mode: "marquee", start: p, base };
    } else {
      const { style, filled } = useToolStore.getState();
      store.select([]);
      store.beginGesture();
      const id = store.add({
        kind: tool,
        rect: { x: p.x, y: p.y, width: 0, height: 0 },
        rotation: 0,
        filled,
        style,
      });
      drag = { mode: "draw", start: p, id };
    }

    const onMove = (m: PointerEvent) => {
      const q = toSource(m.clientX, m.clientY);
      const s = docStore.getState();
      switch (drag.mode) {
        case "move": {
          if (!drag.began) {
            if (Math.hypot(m.clientX - drag.client.x, m.clientY - drag.client.y) < DRAG_THRESHOLD)
              return;
            drag.began = true;
            s.beginGesture();
          }
          const dx = q.x - drag.start.x;
          const dy = q.y - drag.start.y;
          for (const [id, original] of drag.originals) {
            s.update(id, () => translateAnnotation(original, dx, dy));
          }
          break;
        }
        case "draw": {
          const rect = rectFromDrag(drag.start, q, m.shiftKey);
          s.update(drag.id, (a) =>
            a.kind === "rect" || a.kind === "ellipse" ? { ...a, rect } : a,
          );
          break;
        }
        case "marquee":
          setMarquee(rectFromDrag(drag.start, q));
          break;
      }
    };

    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const s = docStore.getState();
      switch (drag.mode) {
        case "move":
          if (drag.began) s.endGesture();
          break;
        case "draw": {
          const a = s.doc.annotations.find((x) => x.id === drag.id) as ShapeAnnotation | undefined;
          const px = view.current.scale;
          if (!a || a.rect.width * px < MIN_DRAWN || a.rect.height * px < MIN_DRAWN) {
            s.cancelGesture();
          } else {
            s.endGesture();
            s.select([drag.id]);
          }
          break;
        }
        case "marquee": {
          const box = rectFromDrag(drag.start, toSource(u.clientX, u.clientY));
          setMarquee(null);
          const px = view.current.scale;
          if (box.width * px < DRAG_THRESHOLD && box.height * px < DRAG_THRESHOLD) break;
          const inside = s.doc.annotations
            .filter((a) => rectsIntersect(annotationBounds(a), box))
            .map((a) => a.id);
          s.select([...drag.base, ...inside]);
          break;
        }
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Hover cursor: move over shapes, crosshair for drawing tools.
  const onPointerMove = (e: KonvaEventObject<PointerEvent>) => {
    if (!interactive || trRef.current?.isTransforming()) return;
    const container = stageRef.current?.container();
    if (!container || e.target.getParent() instanceof Konva.Transformer) return;
    container.style.cursor =
      e.target.name() === "annotation" ? "move" : tool === "select" ? "default" : "crosshair";
  };

  /** Turn the transformer's scale into real size, so strokes keep their width. */
  const bakeTransform = () => {
    const store = docStore.getState();
    for (const node of trRef.current?.nodes() ?? []) {
      const a = store.doc.annotations.find((x) => x.id === node.id());
      if (!a || (a.kind !== "rect" && a.kind !== "ellipse")) continue;
      const w = Math.max(1, a.rect.width * Math.abs(node.scaleX()));
      const h = Math.max(1, a.rect.height * Math.abs(node.scaleY()));
      const cx = node.x();
      const cy = node.y();
      const rotation = node.rotation();
      node.scaleX(1);
      node.scaleY(1);
      store.update(a.id, (x) =>
        x.kind === "rect" || x.kind === "ellipse"
          ? { ...x, rect: { x: cx - w / 2, y: cy - h / 2, width: w, height: h }, rotation }
          : x,
      );
    }
  };

  const { crop } = doc;
  return (
    <div className={styles.surface}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        listening={interactive}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <Layer>
          <Group
            ref={groupRef}
            x={offset.x}
            y={offset.y}
            scaleX={scale}
            scaleY={scale}
            clipX={crop.x}
            clipY={crop.y}
            clipWidth={crop.width}
            clipHeight={crop.height}
          >
            {doc.annotations.map((a) => (
              <AnnotationShape key={a.id} a={a} hitSlop={HIT_SLOP / scale} />
            ))}
          </Group>
        </Layer>
        <Layer>
          <Transformer
            ref={trRef}
            ignoreStroke
            flipEnabled={false}
            // Corners resize freely; Shift keeps the proportions.
            keepRatio={false}
            borderStroke={CHROME}
            anchorStroke={CHROME}
            anchorFill="#ffffff"
            anchorSize={8}
            anchorCornerRadius={1}
            rotateAnchorOffset={24}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={ROTATION_SNAP}
            rotateAnchorCursor={ROTATE_CURSOR}
            boundBoxFunc={(oldBox, newBox) =>
              Math.abs(newBox.width) < 2 || Math.abs(newBox.height) < 2 ? oldBox : newBox
            }
            onTransformStart={() => {
              docStore.getState().beginGesture();
              // Keep the rotate cursor while dragging, even off the handle.
              const container = stageRef.current?.container();
              if (container && trRef.current?.getActiveAnchor() === "rotater") {
                container.style.cursor = ROTATE_CURSOR;
              }
            }}
            onTransform={bakeTransform}
            onTransformEnd={() => {
              bakeTransform();
              docStore.getState().endGesture();
            }}
          />
          {marquee && (
            <KRect
              x={offset.x + marquee.x * scale}
              y={offset.y + marquee.y * scale}
              width={marquee.width * scale}
              height={marquee.height * scale}
              stroke={CHROME}
              strokeWidth={1}
              dash={[4, 3]}
              fill="rgba(76, 141, 255, 0.08)"
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}

/** One annotation as a Konva node, positioned about its centre so rotation works. */
function AnnotationShape({ a, hitSlop }: { a: Annotation; hitSlop: number }) {
  if (a.kind !== "rect" && a.kind !== "ellipse") return null; // other kinds: later steps
  const { rect, style } = a;
  const common = {
    id: a.id,
    name: "annotation",
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    rotation: a.rotation,
    opacity: style.opacity,
    stroke: a.filled ? undefined : style.color,
    strokeWidth: style.width,
    fill: a.filled ? style.color : undefined,
    hitStrokeWidth: style.width + hitSlop,
    perfectDrawEnabled: false,
  };
  return a.kind === "rect" ? (
    <KRect
      {...common}
      width={rect.width}
      height={rect.height}
      offsetX={rect.width / 2}
      offsetY={rect.height / 2}
    />
  ) : (
    <Ellipse {...common} radiusX={rect.width / 2} radiusY={rect.height / 2} />
  );
}
