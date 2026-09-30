import { setDragHint, setOverObject } from "./hints";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  Circle,
  Ellipse,
  Group,
  Layer,
  Line,
  Rect as KRect,
  Shape,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import { bendFromPoint, bendPoint } from "./bend";
import {
  calloutBox,
  calloutExtent,
  grabsTip,
  orbitCallout,
  pointerGeometry,
  pointerPivot,
  pointerStart,
  segmentQuad,
  underlineLayout,
} from "./callout";
import { layerOf, registerAnnotationGroup } from "./export";
import {
  annotationBounds,
  arrowGeometry,
  rectFromDrag,
  rectsIntersect,
  simplifyPath,
  snapAngle,
  TEXT_LINE_HEIGHT,
  textLineHeight,
  textPx,
  translateAnnotation,
} from "./geometry";
import { docStore, useDoc } from "./model/store";
import type {
  Annotation,
  AnnotationId,
  ArrowAnnotation,
  CalloutAnnotation,
  HighlighterAnnotation,
  LineAnnotation,
  PenAnnotation,
  Point,
  Rect,
  RedactAnnotation,
  ShapeAnnotation,
  SpotlightAnnotation,
  StepAnnotation,
  StepShape,
  TextAnnotation,
} from "./model/types";
import { redactPixels, redactReads, redactRect, useRedactSource } from "./redact";
import { editStepLabel } from "./stepEditing";
import { StepLabelEditor } from "./StepLabelEditor";
import { nextStepSeq, stepLabels } from "./steps";
import {
  DEFAULT_TEXT_BACKGROUND,
  drawnCornerRadius,
  stepNumbering,
  toolCalloutStyle,
  toolColor,
  toolCornerRadius,
  toolFill,
  toolFont,
  toolRedact,
  toolSpotlight,
  toolStepStyle,
  toolStroke,
  useStyleConfig,
} from "./styles";
import { textBoxPadding, textFontStyle } from "./textMeasure";
import { TextEditor } from "./TextEditor";
import { createText, editText, finishTextEdit } from "./textEditing";
import { markTaken } from "./pressRouting";
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
/** Screen px a pen stroke may stray from the pointer's path when simplified. */
const PEN_TOLERANCE = 0.5;
/** Cardinal-spline tension for freehand strokes: a light smoothing of mouse jitter. */
const PEN_TENSION = 0.3;
/** Transformer anchors for text: width only, since the size comes from the font. */
const TEXT_ANCHORS = ["middle-left", "middle-right"];
const ALL_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-right",
  "middle-left",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];
/** Screen px from the straight line within which a bend handle snaps straight. */
const BEND_SNAP = 6;
/** Screen px up and right of a click where a callout's text goes (its tip is at the click). */
const CALLOUT_OFFSET = 48;
/** Screen px around a callout's pointer end that grab it, as its handle would (radius plus hit margin). */
const TIP_GRAB = 10;
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
  /** Where annotations show, in source px (default: the crop; the editor's crop mode shows all). */
  clip?: Rect;
  /**
   * With the Select tool, a press on empty space draws a marquee, or, with
   * "pass", is left to the host (quick edit moves the selection).
   */
  emptyPress?: "marquee" | "pass";
}

type Drag =
  | {
      mode: "move";
      start: Point;
      client: Point;
      originals: Map<AnnotationId, Annotation>;
      began: boolean;
      /** A lone callout's laid-out text, for Shift's 45° pointer (PLAN 3E.5). */
      textSize: { width: number; height: number } | null;
      /** A callout grabbed by its pointer line: it moves with its tip (PLAN 3E.7). */
      rigid: boolean;
    }
  | { mode: "draw"; start: Point; id: AnnotationId }
  | { mode: "place"; id: AnnotationId }
  | { mode: "endpoint"; id: AnnotationId; end: "from" | "to"; anchor: Point }
  | { mode: "bend"; id: AnnotationId; handle: Point; start: Point; client: Point; began: boolean }
  | { mode: "stroke"; id: AnnotationId; start: Point; last: Point }
  | { mode: "text"; start: Point; client: Point }
  | { mode: "callout"; start: Point; client: Point }
  | { mode: "tip"; id: AnnotationId; pivot: Point }
  | { mode: "marquee"; start: Point; base: AnnotationId[] };

/** Line-like annotations get endpoint handles instead of the transformer. */
function hasEndpoints(a: Annotation): a is ArrowAnnotation | LineAnnotation {
  return a.kind === "arrow" || a.kind === "line";
}

/** The pen and highlighter always draw, whatever is under the pointer. */
function isFreehand(tool: string): boolean {
  return tool === "pen" || tool === "highlighter";
}

/** Freehand strokes: movable, not reshapeable. */
function isStroke(a: Annotation): a is PenAnnotation | HighlighterAnnotation {
  return a.kind === "pen" || a.kind === "highlighter";
}

/** Shapes drawn by dragging out a box. */
function hasRect(a: Annotation): a is ShapeAnnotation | RedactAnnotation | SpotlightAnnotation {
  return a.kind === "rect" || a.kind === "ellipse" || a.kind === "redact" || a.kind === "spotlight";
}

/** Typed text: width-only resizing, and a typing session. */
function isTextual(a: Annotation): a is TextAnnotation | CalloutAnnotation {
  return a.kind === "text" || a.kind === "callout";
}

/** Boxes and text get the resize/rotate transformer. */
function isBoxed(a: Annotation): boolean {
  return hasRect(a) || isTextual(a);
}

/**
 * Kept axis-aligned: no rotate handle. A callout turns only in a group, where
 * it orbits upright (PLAN 3E.6).
 */
function isUnrotatable(a: Annotation, inGroup: boolean): boolean {
  return a.kind === "redact" || a.kind === "spotlight" || (a.kind === "callout" && !inGroup);
}

/**
 * Is `p` on a callout's text (its box, padding included) rather than its
 * pointer? The text wins where they overlap, as on a very short pointer.
 */
function onCalloutText(a: CalloutAnnotation, p: Point, node: Konva.Node | undefined): boolean {
  const box = calloutBox(a.x, a.y, node?.width() ?? a.width, node?.height() ?? 0, a.fontSize);
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

/**
 * The annotation layer (shared by quick edit and the editor): draws the
 * document over the host's image and runs the tools. Geometry is in source
 * pixels; `scale`/`offset` map it onto the surface.
 */
export function MarkupLayer({
  width,
  height,
  scale,
  offset,
  interactive,
  clip,
  emptyPress = "marquee",
}: Props) {
  const doc = useDoc((s) => s.doc);
  const selection = useDoc((s) => s.selection);
  const tool = useToolStore((s) => s.tool);
  const editing = useToolStore((s) => s.editing);
  const labelEditing = useToolStore((s) => s.labelEditing);
  const drawingToolsSelect = useStyleConfig((s) => s.drawingToolsSelect);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  /** What the pointer last hovered, so the cursor can follow Ctrl without a move. */
  const hovered = useRef("");
  const stageRef = useRef<Konva.Stage>(null);
  const groupRef = useRef<Konva.Group>(null);
  const highlightsRef = useRef<Konva.Group>(null);
  const highlightLayerRef = useRef<Konva.Layer>(null);
  const redactionsRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  /**
   * A callout selected by its pointer line (PLAN 3E.7): selected as a whole,
   * it moves rigidly and rotates, with no resize handles. Only while it is
   * the one thing selected (see `whole` below).
   */
  const [wholeId, setWholeId] = useState<AnnotationId | null>(null);
  const whole = wholeId !== null && selection.length === 1 && selection[0] === wholeId;
  /**
   * In a multi-selection each callout is in the transformer as an invisible
   * stand-in the size of everything it draws (PLAN 3E.6), so the frame takes
   * in its pointer, and a group rotation turns the stand-in, which carries
   * the callout around upright.
   */
  const proxies = useRef(new Map<AnnotationId, Konva.Rect>());
  /** Callouts as a group rotation began, with their text's laid-out size and extent. */
  const orbiting = useRef<Map<
    AnnotationId,
    { a: CalloutAnnotation; width: number; height: number; extent: Rect }
  > | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  /** A callout being dragged out: from its tip to where the text goes. */
  const [pointerPreview, setPointerPreview] = useState<{ from: Point; to: Point } | null>(null);
  // Latest view for window-level drag handlers.
  const view = useRef({ scale, offset });
  useLayoutEffect(() => {
    view.current = { scale, offset };
  });

  useEffect(() => {
    registerAnnotationGroup("annotations", groupRef.current);
    registerAnnotationGroup("highlights", highlightsRef.current);
    registerAnnotationGroup("redactions", redactionsRef.current);
    // Highlights multiply with the image under them, like a real highlighter
    // (Rust does the same on export).
    const canvas = highlightLayerRef.current?.getNativeCanvasElement();
    if (canvas) canvas.style.mixBlendMode = "multiply";
    return () => {
      registerAnnotationGroup("annotations", null);
      registerAnnotationGroup("highlights", null);
      registerAnnotationGroup("redactions", null);
    };
  }, []);

  // Keep the transformer on the selected shapes (and in step with zoom/pan).
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const proxied = selection.length > 1 || whole;
    const nodes = doc.annotations
      .filter((a) => selection.includes(a.id) && isBoxed(a))
      .map((a) =>
        // A callout in a group, or selected whole: its stand-in (see `proxies`).
        proxied && a.kind === "callout" ? proxies.current.get(a.id) : stage.findOne(`#${a.id}`),
      )
      .filter((n): n is Konva.Node => !!n);
    // Setting the nodes turns the frame upright for several of them. Keep a
    // group's frame at the angle it was rotated to until the selection
    // changes, so the rotation can be fine-tuned (Richard); one node's frame
    // always follows that node's own rotation.
    const current = tr.nodes();
    const sameGroup =
      (nodes.length > 1 || whole) &&
      nodes.length === current.length &&
      nodes.every((n, i) => n === current[i]);
    if (!sameGroup) tr.nodes(nodes);
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [selection, doc, scale, offset.x, offset.y, whole]);

  // The host's cursor (e.g. the pan hand) wins while tools are off.
  useEffect(() => {
    const container = stageRef.current?.container();
    if (container && !interactive) container.style.cursor = "";
  }, [interactive]);

  /**
   * Does pressing on an object pick it? Always with Select; with a shape, line
   * or text tool per `editor.drawingToolsSelect`, and Ctrl flips that. The pen
   * and highlighter always draw.
   */
  const picksObjects = (ctrl: boolean) =>
    tool === "select" || (!isFreehand(tool) && drawingToolsSelect !== ctrl);
  // Ctrl+drag to draw ignores the selection's handles too, so a line can start
  // right on a box's corner.
  const handlesLive = !(tool !== "select" && !isFreehand(tool) && drawingToolsSelect && ctrlHeld);

  const setCursor = (name: string, ctrl: boolean) => {
    const container = stageRef.current?.container();
    if (!container) return;
    const picks = picksObjects(ctrl);
    container.style.cursor =
      isFreehand(tool) || (name === "endpoint" && picks)
        ? "crosshair"
        : name === "annotation" && picks
          ? "move"
          : tool === "select"
            ? "default"
            : tool === "text"
              ? "text"
              : "crosshair";
  };

  // Track Ctrl for the handles and the cursor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Control") setCtrlHeld(e.type === "keydown");
    };
    const reset = () => setCtrlHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", reset);
    };
  }, []);

  useEffect(() => {
    if (interactive && !trRef.current?.isTransforming()) setCursor(hovered.current, ctrlHeld);
    // setCursor reads the current tool and setting; rerun when those change too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrlHeld, tool, drawingToolsSelect, interactive]);

  const toSource = (clientX: number, clientY: number): Point => {
    const r = stageRef.current!.container().getBoundingClientRect();
    const { scale: s, offset: o } = view.current;
    return { x: (clientX - r.left - o.x) / s, y: (clientY - r.top - o.y) / s };
  };

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const ev = e.evt;
    if (!interactive || ev.button !== 0) return;
    const hitsObject = e.target.name() === "annotation" && picksObjects(ev.ctrlKey);
    if (
      tool === "select" &&
      emptyPress === "pass" &&
      !hitsObject &&
      !useToolStore.getState().editing
    ) {
      // Empty space with Select, or a transformer handle: see below.
      if (!(e.target.getParent() instanceof Konva.Transformer) && e.target.name() !== "endpoint")
        return;
    }
    markTaken(ev);
    // A click while typing just finishes the text.
    if (useToolStore.getState().editing) {
      finishTextEdit();
      return;
    }
    // Transformer handles run themselves.
    if (e.target.getParent() instanceof Konva.Transformer) return;

    const store = docStore.getState();
    const p = toSource(ev.clientX, ev.clientY);
    const picks = picksObjects(ev.ctrlKey);
    const hit = picks && e.target.name() === "annotation" ? e.target.id() : null;
    const hitCallout = store.doc.annotations.find(
      (a): a is CalloutAnnotation => a.id === hit && a.kind === "callout",
    );
    let drag: Drag;

    if (tool === "pen" || tool === "highlighter") {
      // Freehand tools always draw, even over other annotations.
      const style = toolStroke(tool);
      store.select([]);
      store.beginGesture();
      const id = store.add({ kind: tool, points: [p.x, p.y], style });
      drag = { mode: "stroke", id, start: p, last: { x: ev.clientX, y: ev.clientY } };
    } else if (picks && e.target.name() === "endpoint") {
      const attrs = (e.target as Konva.Node).attrs as {
        annotationId: AnnotationId;
        end: "from" | "to" | "bend" | "tip";
      };
      const { annotationId: id, end } = attrs;
      const a = store.doc.annotations.find((x) => x.id === id);
      if (a?.kind === "callout") {
        // A callout's one handle: where its pointer points (PLAN 3E). Shift
        // snaps the pointer to 45° steps around where it starts.
        const node = stageRef.current?.findOne(`#${id}`);
        store.beginGesture();
        drag = {
          mode: "tip",
          id,
          pivot: pointerPivot(a, node?.width() ?? a.width, node?.height() ?? 0),
        };
      } else {
        if (!a || !hasEndpoints(a) || end === "tip") return;
        store.beginGesture();
        drag =
          end === "bend"
            ? {
                mode: "bend",
                id,
                handle: bendPoint(a.from, a.to, a.bend),
                start: p,
                client: { x: ev.clientX, y: ev.clientY },
                began: false,
              }
            : { mode: "endpoint", id, end, anchor: end === "from" ? a.to : a.from };
      }
    } else if (
      hitCallout &&
      !ev.shiftKey &&
      !(store.selection.includes(hitCallout.id) && store.selection.length > 1) &&
      grabsTip(hitCallout, p, TIP_GRAB / view.current.scale) &&
      // The text wins where they meet, as for the pointer line.
      !onCalloutText(hitCallout, p, e.target)
    ) {
      // The pointer's end before its handle shows: select the callout as its
      // text would and move the end, as the handle does (PLAN 3E.7).
      setWholeId(null);
      store.select([hitCallout.id]);
      store.beginGesture();
      drag = {
        mode: "tip",
        id: hitCallout.id,
        pivot: pointerPivot(hitCallout, e.target.width(), e.target.height()),
      };
    } else if (hit) {
      let sel = store.selection;
      // A callout's pointer line selects it whole, unless it's being moved
      // with others; its text selects it as before (PLAN 3E.7).
      const hitA = store.doc.annotations.find((a) => a.id === hit);
      const rigid =
        !ev.shiftKey &&
        !(sel.includes(hit) && sel.length > 1) &&
        hitA?.kind === "callout" &&
        !onCalloutText(hitA, p, e.target);
      setWholeId(rigid ? hit : null);
      if (rigid) {
        sel = [hit];
        store.select(sel);
      } else if (ev.shiftKey) {
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
      const node = sel.length === 1 ? stageRef.current?.findOne(`#${sel[0]}`) : undefined;
      drag = {
        mode: "move",
        start: p,
        client: { x: ev.clientX, y: ev.clientY },
        originals,
        began: false,
        textSize: node ? { width: node.width(), height: node.height() } : null,
        rigid,
      };
    } else if (tool === "select") {
      setWholeId(null);
      const base = ev.shiftKey ? store.selection : [];
      store.select(base);
      drag = { mode: "marquee", start: p, base };
    } else if (tool === "text") {
      store.select([]);
      drag = { mode: "text", start: p, client: { x: ev.clientX, y: ev.clientY } };
    } else if (tool === "callout") {
      // Press on what it points at, release where the text goes (PLAN 3E).
      store.select([]);
      drag = { mode: "callout", start: p, client: { x: ev.clientX, y: ev.clientY } };
    } else if (tool === "redact") {
      store.select([]);
      store.beginGesture();
      const id = store.add({
        kind: "redact",
        rect: { x: p.x, y: p.y, width: 0, height: 0 },
        ...toolRedact(),
      });
      drag = { mode: "draw", start: p, id };
    } else if (tool === "spotlight") {
      store.select([]);
      store.beginGesture();
      const id = store.add({
        kind: "spotlight",
        rect: { x: p.x, y: p.y, width: 0, height: 0 },
        ...toolSpotlight(),
        cornerRadius: toolCornerRadius("spotlight"),
      });
      drag = { mode: "draw", start: p, id };
    } else if (tool === "step") {
      // A click places the next marker; dragging before letting go moves it.
      store.select([]);
      store.beginGesture();
      const id = store.add({
        kind: "step",
        x: p.x,
        y: p.y,
        seq: nextStepSeq(store.doc),
        ...toolStepStyle(),
        ...stepNumbering(store.doc),
      });
      drag = { mode: "place", id };
    } else {
      const style = toolStroke(tool);
      const { arrowHead, arrowEnds } = useToolStore.getState();
      const shapeFill = toolFill(tool);
      store.select([]);
      store.beginGesture();
      const id =
        tool === "arrow"
          ? store.add({ kind: "arrow", from: p, to: p, head: arrowHead, ends: arrowEnds, style })
          : tool === "line"
            ? store.add({ kind: "line", from: p, to: p, style })
            : store.add({
                kind: tool,
                rect: { x: p.x, y: p.y, width: 0, height: 0 },
                rotation: 0,
                fill: shapeFill.fill,
                fillColor: shapeFill.color ?? style.color,
                ...(tool === "rect" && { cornerRadius: toolCornerRadius("rect") }),
                style,
              });
      drag = { mode: "draw", start: p, id };
    }

    setDragHint(
      drag.mode === "move"
        ? drag.originals.size === 1 &&
          !drag.rigid &&
          [...drag.originals.values()][0]?.kind === "callout"
          ? "calloutMove"
          : "move"
        : drag.mode === "stroke"
          ? "stroke"
          : drag.mode === "endpoint" ||
              drag.mode === "tip" ||
              (drag.mode === "draw" && (tool === "line" || tool === "arrow"))
            ? "segment"
            : drag.mode === "draw"
              ? tool === "ellipse" ||
                (tool === "spotlight" && useToolStore.getState().spotlightShape === "ellipse")
                ? "circle"
                : "square"
              : drag.mode === "text"
                ? "text"
                : drag.mode === "callout"
                  ? "callout"
                  : drag.mode === "bend"
                    ? "bend"
                    : null,
    );

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
          // A callout moved on its own keeps pointing where it did (PLAN 3E).
          const alone = drag.originals.size === 1 && !drag.rigid;
          // Shift: moves only across or up and down (diagonals felt jumpy at
          // the start of a move), except a callout's text on its own, where
          // Shift keeps its pointer at 45° steps instead (below).
          const step = { x: q.x - drag.start.x, y: q.y - drag.start.y };
          const calloutText = alone && [...drag.originals.values()][0]?.kind === "callout";
          const { x: dx, y: dy } =
            m.shiftKey && !calloutText
              ? Math.abs(step.x) >= Math.abs(step.y)
                ? { x: step.x, y: 0 }
                : { x: 0, y: step.y }
              : step;
          for (const [id, original] of drag.originals) {
            let moved = translateAnnotation(original, dx, dy, alone);
            // Shift: the pointer in 45° steps from where it points, as when
            // drawing it or dragging its end.
            if (alone && m.shiftKey && moved.kind === "callout" && drag.textSize) {
              const pivot = pointerPivot(moved, drag.textSize.width, drag.textSize.height);
              const snapped = snapAngle(moved.tip, pivot);
              moved = translateAnnotation(moved, snapped.x - pivot.x, snapped.y - pivot.y, true);
            }
            s.update(id, () => moved);
          }
          break;
        }
        case "draw": {
          const start = drag.start;
          s.update(drag.id, (a) => {
            if (hasEndpoints(a)) return { ...a, to: m.shiftKey ? snapAngle(start, q) : q };
            if (hasRect(a)) return { ...a, rect: rectFromDrag(start, q, m.shiftKey) };
            return a;
          });
          break;
        }
        case "place":
          s.update(drag.id, (a) => (a.kind === "step" ? { ...a, x: q.x, y: q.y } : a));
          break;
        case "tip": {
          const tip = m.shiftKey ? snapAngle(drag.pivot, q) : q;
          s.update(drag.id, (a) => (a.kind === "callout" ? { ...a, tip } : a));
          break;
        }
        case "callout":
          setPointerPreview({ from: drag.start, to: m.shiftKey ? snapAngle(drag.start, q) : q });
          break;
        case "endpoint": {
          const pt = m.shiftKey ? snapAngle(drag.anchor, q) : q;
          const end = drag.end;
          s.update(drag.id, (a) => (hasEndpoints(a) ? { ...a, [end]: pt } : a));
          break;
        }
        case "bend": {
          // A click (or double-click) on the handle leaves the bend alone.
          if (!drag.began) {
            if (Math.hypot(m.clientX - drag.client.x, m.clientY - drag.client.y) < DRAG_THRESHOLD)
              return;
            drag.began = true;
          }
          const handle = {
            x: drag.handle.x + q.x - drag.start.x,
            y: drag.handle.y + q.y - drag.start.y,
          };
          const snap = BEND_SNAP / view.current.scale;
          s.update(drag.id, (a) =>
            hasEndpoints(a)
              ? { ...a, bend: bendFromPoint(a.from, a.to, handle, m.shiftKey, snap) }
              : a,
          );
          break;
        }
        case "stroke": {
          if (m.shiftKey) {
            // Shift: a straight stroke from where it started (45° steps).
            const end = snapAngle(drag.start, q);
            const points = [drag.start.x, drag.start.y, end.x, end.y];
            drag.last = { x: m.clientX, y: m.clientY };
            s.update(drag.id, (a) => (isStroke(a) ? { ...a, points } : a));
            break;
          }
          // Coalesced events keep fast strokes smooth.
          const added: number[] = [];
          for (const c of m.getCoalescedEvents?.() ?? [m]) {
            if (Math.hypot(c.clientX - drag.last.x, c.clientY - drag.last.y) < 1) continue;
            drag.last = { x: c.clientX, y: c.clientY };
            const pt = toSource(c.clientX, c.clientY);
            added.push(pt.x, pt.y);
          }
          if (added.length)
            s.update(drag.id, (a) => (isStroke(a) ? { ...a, points: [...a.points, ...added] } : a));
          break;
        }
        case "marquee":
        case "text":
          setMarquee(rectFromDrag(drag.start, q));
          break;
      }
    };

    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragHint(null);
      const s = docStore.getState();
      switch (drag.mode) {
        case "move":
          if (drag.began) s.endGesture();
          break;
        case "draw": {
          const a = s.doc.annotations.find((x) => x.id === drag.id);
          if (a && drawnBigEnough(a, view.current.scale)) {
            s.endGesture();
            s.select([drag.id]);
          } else {
            s.cancelGesture();
          }
          break;
        }
        case "endpoint":
        case "bend":
        case "tip":
          s.endGesture();
          break;
        case "callout": {
          // A drag puts the text where it ends; a click, up and to the right.
          setPointerPreview(null);
          // Shift: the pointer in 45° steps, as for lines.
          const raw = toSource(u.clientX, u.clientY);
          const q = u.shiftKey ? snapAngle(drag.start, raw) : raw;
          const dragged =
            Math.hypot(u.clientX - drag.client.x, u.clientY - drag.client.y) >= 2 * DRAG_THRESHOLD;
          const off = CALLOUT_OFFSET / view.current.scale;
          const at = dragged ? q : { x: drag.start.x + off, y: drag.start.y - off };
          const style = toolCalloutStyle();
          createText({
            kind: "callout",
            ...style,
            x: at.x,
            // The first line's middle at the pointer, as for text.
            y: at.y - textLineHeight(style.fontSize) / 2,
            width: 0,
            autoWidth: true,
            text: "",
            tip: drag.start,
          });
          break;
        }
        case "place":
          s.endGesture();
          s.select([drag.id]);
          break;
        case "stroke": {
          // A click leaves a dot; strokes lose the points that add nothing.
          const tolerance = PEN_TOLERANCE / view.current.scale;
          s.update(drag.id, (a) => {
            if (!isStroke(a)) return a;
            const points =
              a.points.length === 2
                ? [...a.points, ...a.points]
                : simplifyPath(a.points, tolerance);
            return { ...a, points };
          });
          s.endGesture();
          break;
        }
        case "text": {
          // A click makes a box that grows as you type; a drag sets the wrap width.
          setMarquee(null);
          const q = toSource(u.clientX, u.clientY);
          const dragged = Math.abs(u.clientX - drag.client.x) >= 2 * DRAG_THRESHOLD;
          const font = toolFont();
          const { textAlign, textBold, textItalic, textBackground, textBackgroundColor } =
            useToolStore.getState();
          createText({
            kind: "text",
            x: dragged ? Math.min(drag.start.x, q.x) : drag.start.x,
            // A click puts the first line's middle at the pointer.
            y: dragged ? Math.min(drag.start.y, q.y) : drag.start.y - textLineHeight(font.size) / 2,
            width: dragged ? Math.abs(q.x - drag.start.x) : 0,
            autoWidth: !dragged,
            rotation: 0,
            text: "",
            fontFamily: font.family,
            fontSize: font.size,
            bold: textBold,
            italic: textItalic,
            color: toolColor("text"),
            align: textAlign,
            background: textBackground,
            backgroundColor: textBackgroundColor ?? DEFAULT_TEXT_BACKGROUND,
          });
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
    if (e.target.getParent() instanceof Konva.Transformer) return;
    hovered.current = e.target.name();
    setCursor(hovered.current, e.evt.ctrlKey);
    setOverObject(hovered.current === "annotation" || hovered.current === "endpoint");
  };

  const onDblClick = (e: KonvaEventObject<MouseEvent>) => {
    if (!interactive) return;
    // Double-clicking the bend handle straightens the line (PLAN 3D.6).
    const attrs = e.target.attrs as { annotationId?: AnnotationId; end?: string };
    if (e.target.name() === "endpoint" && attrs.end === "bend" && attrs.annotationId) {
      markTaken(e.evt);
      const store = docStore.getState();
      store.beginGesture();
      store.update(attrs.annotationId, (a) => (hasEndpoints(a) ? { ...a, bend: undefined } : a));
      store.endGesture();
      return;
    }
    if (e.target.name() !== "annotation") return;
    markTaken(e.evt);
    editText(e.target.id());
    editStepLabel(e.target.id());
  };

  /** Turn the transformer's scale into real size, so strokes keep their width. */
  const bakeTransform = () => {
    const store = docStore.getState();
    for (const node of trRef.current?.nodes() ?? []) {
      const a = store.doc.annotations.find((x) => x.id === node.id());
      if (a?.kind === "callout") {
        // Width only; the tip stays where it points.
        const sx = Math.abs(node.scaleX());
        const resized = Math.abs(sx - 1) > 1e-6;
        const w = Math.max(textPx(a.fontSize), node.width() * sx);
        const x = node.x();
        const y = node.y();
        node.scaleX(1);
        node.scaleY(1);
        store.update(a.id, (t) =>
          t.kind === "callout"
            ? { ...t, x, y, ...(resized ? { width: w, autoWidth: false } : {}) }
            : t,
        );
        continue;
      }
      if (a?.kind === "text") {
        // Only the width changes (the anchors allow nothing else); rotation is
        // about the top-left corner, which Konva keeps in x/y.
        const sx = Math.abs(node.scaleX());
        const resized = Math.abs(sx - 1) > 1e-6;
        const w = Math.max(textPx(a.fontSize), node.width() * sx);
        const x = node.x();
        const y = node.y();
        const rotation = node.rotation();
        node.scaleX(1);
        node.scaleY(1);
        store.update(a.id, (t) =>
          t.kind === "text"
            ? { ...t, x, y, rotation, ...(resized ? { width: w, autoWidth: false } : {}) }
            : t,
        );
        continue;
      }
      if (!a || !hasRect(a)) continue;
      const w = Math.max(1, a.rect.width * Math.abs(node.scaleX()));
      const h = Math.max(1, a.rect.height * Math.abs(node.scaleY()));
      const cx = node.x();
      const cy = node.y();
      const rotation = node.rotation();
      node.scaleX(1);
      node.scaleY(1);
      const rect = { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
      store.update(a.id, (x) =>
        x.kind === "redact" || x.kind === "spotlight"
          ? { ...x, rect }
          : x.kind === "rect" || x.kind === "ellipse"
            ? { ...x, rect, rotation }
            : x,
      );
    }
  };

  const crop = clip ?? doc.crop;
  const textSelected = doc.annotations.some((a) => isTextual(a) && selection.includes(a.id));
  // Several objects with text among them don't resize: scaling the group
  // moved and stretched the text boxes, which wasn't useful (Richard).
  const textGroup = textSelected && selection.length > 1;
  const anchors = textGroup || whole ? [] : textSelected ? TEXT_ANCHORS : ALL_ANCHORS;
  // Redactions (Rust bakes whole-pixel rectangles) and spotlights stay axis-aligned.
  const unrotatableSelected = doc.annotations.some(
    (a) => isUnrotatable(a, selection.length > 1 || whole) && selection.includes(a.id),
  );
  // Callouts shown by their stand-ins: in a group, or one selected whole.
  const groupCallouts = doc.annotations.filter(
    (a): a is CalloutAnnotation =>
      a.kind === "callout" && (selection.length > 1 || whole) && selection.includes(a.id),
  );
  /** Everything a callout draws, as laid out now (or as a group rotation began). */
  const extentOf = (a: CalloutAnnotation): Rect => {
    const frozen = orbiting.current?.get(a.id);
    if (frozen) return frozen.extent;
    const node = stageRef.current?.findOne(`#${a.id}`);
    return calloutExtent(a, node?.width() ?? a.width, node?.height() ?? 0);
  };
  const spotlights = doc.annotations.filter(
    (a): a is SpotlightAnnotation => a.kind === "spotlight",
  );
  const labels = stepLabels(doc);
  const editedStep = doc.annotations.find(
    (a): a is StepAnnotation => a.kind === "step" && a.id === labelEditing,
  );
  const editedText = doc.annotations.find(
    (a): a is TextAnnotation | CalloutAnnotation => isTextual(a) && a.id === editing?.id,
  );
  const groupProps = {
    x: offset.x,
    y: offset.y,
    scaleX: scale,
    scaleY: scale,
    clipX: crop.x,
    clipY: crop.y,
    clipWidth: crop.width,
    clipHeight: crop.height,
  };
  return (
    <div className={styles.surface}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        listening={interactive}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onMouseLeave={() => setOverObject(false)}
        onDblClick={onDblClick}
      >
        {/* Under everything, whatever the z-order: redactions hide the image only. */}
        <Layer imageSmoothingEnabled={scale < 1}>
          <Group ref={redactionsRef} {...groupProps}>
            {doc.annotations
              .filter((a): a is RedactAnnotation => a.kind === "redact")
              .map((a) => (
                <RedactShape key={a.id} a={a} />
              ))}
          </Group>
        </Layer>
        <Layer ref={highlightLayerRef}>
          <Group ref={highlightsRef} {...groupProps}>
            {doc.annotations
              .filter((a) => layerOf(a) === "highlights")
              .map((a) => (
                <AnnotationShape key={a.id} a={a} hitSlop={HIT_SLOP / scale} />
              ))}
          </Group>
        </Layer>
        <Layer>
          <Group ref={groupRef} {...groupProps}>
            {/* First in this layer: it punches its holes into nothing else. */}
            {spotlights.length > 0 && <SpotlightDim spots={spotlights} source={doc.source} />}
            {doc.annotations
              .filter((a) => layerOf(a) === "annotations")
              .map((a) => (
                <AnnotationShape
                  key={a.id}
                  a={a}
                  hitSlop={HIT_SLOP / scale}
                  hidden={a.id === editing?.id || a.id === labelEditing}
                  label={labels.get(a.id)}
                />
              ))}
          </Group>
        </Layer>
        <Layer>
          {/* Invisible: only the frame measures them (see `proxies`). */}
          <Group x={offset.x} y={offset.y} scaleX={scale} scaleY={scale} listening={false}>
            {groupCallouts.map((a) => (
              <KRect
                key={`${a.id}-proxy`}
                ref={(node) => {
                  if (!node) {
                    proxies.current.delete(a.id);
                    return;
                  }
                  proxies.current.set(a.id, node);
                  node.getSelfRect = () => extentOf(a);
                }}
              />
            ))}
          </Group>
          <Transformer
            ref={trRef}
            listening={handlesLive}
            ignoreStroke
            flipEnabled={false}
            rotateEnabled={!unrotatableSelected}
            // Corners resize freely; Shift keeps the proportions.
            keepRatio={false}
            enabledAnchors={anchors}
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
              // A group rotation carries its callouts from where they are now.
              if (trRef.current?.getActiveAnchor() === "rotater" && groupCallouts.length) {
                orbiting.current = new Map(
                  groupCallouts.map((a) => {
                    const node = stageRef.current?.findOne(`#${a.id}`);
                    const width = node?.width() ?? a.width;
                    const height = node?.height() ?? 0;
                    return [a.id, { a, width, height, extent: calloutExtent(a, width, height) }];
                  }),
                );
              }
              setDragHint(trRef.current?.getActiveAnchor() === "rotater" ? "rotate" : "resize");
              // Keep the rotate cursor while dragging, even off the handle.
              const container = stageRef.current?.container();
              if (container && trRef.current?.getActiveAnchor() === "rotater") {
                container.style.cursor = ROTATE_CURSOR;
              }
            }}
            onTransform={() => {
              // Rotating several objects: the frame turns them as one and
              // they're saved on release. Saving each step re-fitted an
              // upright frame around them, and the next step then rotated
              // from that frame, so the turns compounded into a spin.
              const tr = trRef.current;
              if (
                tr &&
                (tr.nodes().length > 1 || orbiting.current) &&
                tr.getActiveAnchor() === "rotater"
              ) {
                // Callouts follow live: each goes where its turning stand-in
                // carries its text's centre and its tip.
                const store = docStore.getState();
                for (const [id, o] of orbiting.current ?? []) {
                  const turn = proxies.current.get(id)?.getTransform();
                  if (!turn) continue;
                  const moved = orbitCallout(o.a, o.width, o.height, (p) => turn.point(p));
                  store.update(id, () => moved);
                }
                return;
              }
              bakeTransform();
            }}
            onTransformEnd={() => {
              setDragHint(null);
              bakeTransform();
              // The callouts are where they belong now: stand their stand-ins
              // back up, around them.
              if (orbiting.current) {
                for (const id of orbiting.current.keys()) {
                  proxies.current.get(id)?.setAttrs({ x: 0, y: 0, rotation: 0 });
                }
                orbiting.current = null;
                trRef.current?.forceUpdate();
              }
              docStore.getState().endGesture();
            }}
          />
          {doc.annotations
            .filter(hasEndpoints)
            .map((a) =>
              selection.includes(a.id) ? (
                <BendHandle
                  key={`${a.id}-bend`}
                  a={a}
                  scale={scale}
                  offset={offset}
                  listening={handlesLive}
                />
              ) : null,
            )}
          {doc.annotations
            .filter(hasEndpoints)
            .flatMap((a) =>
              selection.includes(a.id)
                ? (["from", "to"] as const).map((end) => (
                    <Circle
                      key={`${a.id}-${end}`}
                      name="endpoint"
                      listening={handlesLive}
                      annotationId={a.id}
                      end={end}
                      x={offset.x + a[end].x * scale}
                      y={offset.y + a[end].y * scale}
                      radius={6}
                      fill="#ffffff"
                      stroke={CHROME}
                      strokeWidth={1.5}
                      hitStrokeWidth={8}
                    />
                  ))
                : [],
            )}
          {doc.annotations.map((a) =>
            a.kind === "callout" && selection.includes(a.id) ? (
              <Circle
                key={`${a.id}-tip`}
                name="endpoint"
                listening={handlesLive}
                annotationId={a.id}
                end="tip"
                x={offset.x + a.tip.x * scale}
                y={offset.y + a.tip.y * scale}
                radius={6}
                fill="#ffffff"
                stroke={CHROME}
                strokeWidth={1.5}
                hitStrokeWidth={8}
              />
            ) : null,
          )}
          {pointerPreview && (
            <Line
              points={[
                offset.x + pointerPreview.from.x * scale,
                offset.y + pointerPreview.from.y * scale,
                offset.x + pointerPreview.to.x * scale,
                offset.y + pointerPreview.to.y * scale,
              ]}
              stroke={CHROME}
              strokeWidth={1.5}
              dash={[4, 3]}
              listening={false}
            />
          )}
          {doc.annotations.map((a) =>
            (isStroke(a) || a.kind === "step") &&
            selection.includes(a.id) &&
            a.id !== labelEditing ? (
              <SelectionBounds
                key={`${a.id}-bounds`}
                bounds={annotationBounds(a)}
                pad={isStroke(a) ? a.style.width / 2 : 0}
                scale={scale}
                offset={offset}
              />
            ) : null,
          )}
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
      {editedText && <TextEditor a={editedText} scale={scale} offset={offset} />}
      {editedStep && (
        <StepLabelEditor
          key={editedStep.id}
          a={editedStep}
          label={labels.get(editedStep.id) ?? ""}
          scale={scale}
          offset={offset}
        />
      )}
    </div>
  );
}

/** A just-drawn annotation smaller than this on screen was a click: drop it. */
function drawnBigEnough(a: Annotation, scale: number): boolean {
  if (hasRect(a)) return a.rect.width * scale >= MIN_DRAWN && a.rect.height * scale >= MIN_DRAWN;
  if (hasEndpoints(a))
    return Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) * scale >= 2 * MIN_DRAWN;
  return true;
}

/** One annotation as a Konva node. Shapes are positioned about their centre so rotation works. */
function AnnotationShape({
  a,
  hitSlop,
  hidden = false,
  label = "",
}: {
  a: Annotation;
  hitSlop: number;
  /** Being typed into: the text editor shows it instead. */
  hidden?: boolean;
  /** A step marker's label. */
  label?: string;
}) {
  if (a.kind === "step") return <StepMarker a={a} label={label} hidden={hidden} />;
  if (a.kind === "callout") return <CalloutShape a={a} hitSlop={hitSlop} typing={hidden} />;
  if (a.kind === "text") {
    return (
      <Text
        id={a.id}
        name="annotation"
        x={a.x}
        y={a.y}
        rotation={a.rotation}
        text={a.text}
        fontFamily={a.fontFamily}
        fontSize={textPx(a.fontSize)}
        fontStyle={textFontStyle(a.bold, a.italic)}
        lineHeight={TEXT_LINE_HEIGHT}
        fill={a.color}
        align={a.align}
        width={a.autoWidth ? undefined : a.width}
        wrap={a.autoWidth ? "none" : "word"}
        visible={!hidden}
        perfectDrawEnabled={false}
        sceneFunc={(ctx, shape) => {
          // The background box first, then Konva's own text drawing.
          const t = shape as Konva.Text;
          if (a.background) {
            const pad = textBoxPadding(textPx(a.fontSize));
            ctx.save();
            ctx.translate(-pad, -pad);
            ctx.beginPath();
            Konva.Util.drawRoundedRectPath(ctx, t.width() + 2 * pad, t.height() + 2 * pad, pad);
            ctx.closePath();
            ctx.setAttr("fillStyle", a.backgroundColor);
            ctx.fill();
            ctx.restore();
          }
          t._sceneFunc(ctx as Parameters<Konva.Text["_sceneFunc"]>[0]);
        }}
      />
    );
  }
  if (hasEndpoints(a)) return <SegmentShape a={a} hitSlop={hitSlop} />;
  if (a.kind === "spotlight") return <SpotlightEdge a={a} hitSlop={hitSlop} />;
  if (isStroke(a)) {
    const { color, width, opacity } = a.style;
    // Within the highlight layer, overlapping highlights darken like ink.
    const blend = a.kind === "highlighter" ? "multiply" : undefined;
    const b = annotationBounds(a);
    if (b.width === 0 && b.height === 0) {
      // A click: canvas doesn't reliably draw a zero-length line, so draw the dot.
      return (
        <Circle
          id={a.id}
          name="annotation"
          x={b.x}
          y={b.y}
          radius={width / 2}
          fill={color}
          opacity={opacity}
          globalCompositeOperation={blend}
          perfectDrawEnabled={false}
          // The same grab margin as strokes get.
          hitFunc={(ctx, shape) => {
            ctx.beginPath();
            ctx.arc(0, 0, (width + hitSlop) / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillShape(shape);
          }}
        />
      );
    }
    return (
      <Line
        id={a.id}
        name="annotation"
        points={a.points}
        stroke={color}
        strokeWidth={width}
        opacity={opacity}
        globalCompositeOperation={blend}
        tension={PEN_TENSION}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={width + hitSlop}
        perfectDrawEnabled={false}
      />
    );
  }
  if (a.kind !== "rect" && a.kind !== "ellipse") return null; // other kinds: later steps
  const { rect, style } = a;
  const common = {
    id: a.id,
    name: "annotation",
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    rotation: a.rotation,
    opacity: style.opacity,
    stroke: a.fill === "solid" ? undefined : style.color,
    strokeWidth: style.width,
    fill: a.fill === "none" ? undefined : a.fill === "solid" ? style.color : a.fillColor,
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
      cornerRadius={drawnCornerRadius(a.cornerRadius, rect.width, rect.height)}
    />
  ) : (
    <Ellipse {...common} radiusX={rect.width / 2} radiusY={rect.height / 2} />
  );
}

/**
 * A callout (PLAN 3E): the pointer, then the box over its start (or the
 * underline, PLAN 3E.3), then the text. One Konva text node, so the transformer resizes its width like text's
 * and the pointer follows the laid-out box. While it's being typed into, the
 * box and pointer stay and the text editor shows the text.
 */
function CalloutShape({
  a,
  hitSlop,
  typing,
}: {
  a: CalloutAnnotation;
  hitSlop: number;
  typing: boolean;
}) {
  // The box (drawn, or with an underline only hit), the underline, and the
  // pointer from where it starts, relative to the text's top-left.
  const layout = (t: Konva.Text) => {
    const w = t.width();
    const h = t.height();
    const box = calloutBox(0, 0, w, h, a.fontSize);
    const tip = { x: a.tip.x - a.x, y: a.tip.y - a.y };
    const under = a.shape === "underline" ? underlineLayout(0, 0, w, h, a.fontSize, tip) : null;
    const start = under ? under.start : pointerStart(box, a.cornerRadius, tip);
    return {
      box,
      tip,
      under,
      start,
      pointer: start && pointerGeometry(start, tip, a.end, a.lineWidth),
    };
  };
  return (
    <Text
      id={a.id}
      name="annotation"
      x={a.x}
      y={a.y}
      text={a.text}
      fontFamily={a.fontFamily}
      fontSize={textPx(a.fontSize)}
      fontStyle={textFontStyle(a.bold, a.italic)}
      lineHeight={TEXT_LINE_HEIGHT}
      fill={a.textColor}
      align={a.align}
      width={a.autoWidth ? undefined : a.width}
      wrap={a.autoWidth ? "none" : "word"}
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        const t = shape as Konva.Text;
        const { box, under, pointer } = layout(t);
        const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
        c.save();
        if (pointer) {
          const [from, to] = pointer.shaft;
          c.beginPath();
          c.moveTo(from.x, from.y);
          c.lineTo(to.x, to.y);
          c.strokeStyle = a.color;
          c.lineWidth = a.lineWidth;
          c.lineCap = "round";
          c.stroke();
          c.fillStyle = a.color;
          if (pointer.head) {
            const [l, tp, r] = pointer.head;
            c.beginPath();
            c.moveTo(l.x, l.y);
            c.lineTo(tp.x, tp.y);
            c.lineTo(r.x, r.y);
            c.closePath();
            c.fill();
          }
          if (pointer.dot) {
            c.beginPath();
            c.arc(pointer.dot.center.x, pointer.dot.center.y, pointer.dot.radius, 0, 2 * Math.PI);
            c.fill();
          }
        }
        if (under) {
          const [l, r] = under.line;
          c.beginPath();
          c.moveTo(l.x, l.y);
          c.lineTo(r.x, r.y);
          c.strokeStyle = a.color;
          c.lineWidth = a.lineWidth;
          c.lineCap = "round";
          c.stroke();
        } else {
          c.beginPath();
          c.roundRect(
            box.x,
            box.y,
            box.width,
            box.height,
            drawnCornerRadius(a.cornerRadius, box.width, box.height),
          );
          c.fillStyle = a.color;
          c.fill();
        }
        c.restore();
        if (!typing) t._sceneFunc(ctx as Parameters<Konva.Text["_sceneFunc"]>[0]);
      }}
      // The box and the pointer (a text node has no stroke to hit with).
      hitFunc={(ctx, shape) => {
        const { box, tip, under, start, pointer } = layout(shape as Konva.Text);
        const fillPath = (points: Point[]) => {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (const q of points.slice(1)) ctx.lineTo(q.x, q.y);
          ctx.closePath();
          ctx.fillShape(shape);
        };
        fillPath([
          { x: box.x, y: box.y },
          { x: box.x + box.width, y: box.y },
          { x: box.x + box.width, y: box.y + box.height },
          { x: box.x, y: box.y + box.height },
        ]);
        if (under) fillPath(segmentQuad(under.line[0], under.line[1], a.lineWidth + hitSlop));
        if (!start || !pointer) return;
        fillPath(segmentQuad(start, tip, a.lineWidth + hitSlop));
        if (pointer.head) fillPath(pointer.head);
        if (pointer.dot) {
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, pointer.dot.radius + hitSlop / 2, 0, 2 * Math.PI);
          ctx.closePath();
          ctx.fillShape(shape);
        }
      }}
    />
  );
}

/**
 * The shared dark layer (PLAN 3D.7): the whole image darkened by the last
 * spotlight's amount (they're kept equal), with every spotlight cut out, so
 * overlaps don't darken twice. Exported with the annotation layer.
 */
function SpotlightDim({
  spots,
  source,
}: {
  spots: SpotlightAnnotation[];
  source: { width: number; height: number };
}) {
  const dim = Math.min(100, Math.max(0, spots[spots.length - 1].dim)) / 100;
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
        c.save();
        c.fillStyle = `rgba(0, 0, 0, ${dim})`;
        c.fillRect(0, 0, source.width, source.height);
        c.globalCompositeOperation = "destination-out";
        c.fillStyle = "#000";
        for (const spot of spots) {
          const { rect: r, shape } = spot;
          c.beginPath();
          if (shape === "ellipse") {
            c.ellipse(
              r.x + r.width / 2,
              r.y + r.height / 2,
              r.width / 2,
              r.height / 2,
              0,
              0,
              2 * Math.PI,
            );
          } else {
            c.roundRect(
              r.x,
              r.y,
              r.width,
              r.height,
              drawnCornerRadius(spot.cornerRadius, r.width, r.height),
            );
          }
          c.fill();
        }
        c.restore();
      }}
    />
  );
}

/**
 * A spotlight's own object: invisible (the dark layer shows where it is), and
 * picked anywhere inside, like a filled box. Ctrl draws over it instead.
 */
function SpotlightEdge({ a, hitSlop }: { a: SpotlightAnnotation; hitSlop: number }) {
  const { rect } = a;
  const common = {
    id: a.id,
    name: "annotation",
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    fill: "rgba(0, 0, 0, 0)",
    stroke: "rgba(0, 0, 0, 0)",
    strokeWidth: 1,
    hitStrokeWidth: 2 * hitSlop,
    perfectDrawEnabled: false,
  };
  return a.shape === "ellipse" ? (
    <Ellipse {...common} radiusX={rect.width / 2} radiusY={rect.height / 2} />
  ) : (
    <KRect
      {...common}
      width={rect.width}
      height={rect.height}
      offsetX={rect.width / 2}
      offsetY={rect.height / 2}
      cornerRadius={drawnCornerRadius(a.cornerRadius, rect.width, rect.height)}
    />
  );
}

/** Largest label width, as a share of the marker, so it stays inside a circle. */
const STEP_LABEL_FIT = 0.72;
/** A short label's font size, as a share of the marker. */
const STEP_FONT = 0.56;

/** A step marker's outline about its centre. */
function stepPath(c: CanvasRenderingContext2D, shape: StepShape, r: number): void {
  c.beginPath();
  if (shape === "circle") c.arc(0, 0, r, 0, 2 * Math.PI);
  else if (shape === "rounded") c.roundRect(-r, -r, 2 * r, 2 * r, r * 0.45);
  else c.rect(-r, -r, 2 * r, 2 * r);
}

/**
 * A step marker (PLAN 3D.11): its shape filled, and the label in bold,
 * centred, shrunk to fit when it's long. Positioned about its centre.
 */
function StepMarker({ a, label, hidden }: { a: StepAnnotation; label: string; hidden: boolean }) {
  const r = a.size / 2;
  return (
    <Shape
      id={a.id}
      name="annotation"
      x={a.x}
      y={a.y}
      visible={!hidden}
      // For the hit area only; the scene draws itself.
      fill={a.color}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
        c.save();
        stepPath(c, a.shape, r);
        c.fillStyle = a.color;
        c.fill();
        const font = (px: number) => `bold ${px}px "${a.fontFamily}"`;
        let px = a.size * STEP_FONT;
        c.font = font(px);
        const w = c.measureText(label).width;
        if (w > a.size * STEP_LABEL_FIT) {
          px *= (a.size * STEP_LABEL_FIT) / w;
          c.font = font(px);
        }
        const m = c.measureText(label);
        c.fillStyle = a.textColor;
        c.textAlign = "center";
        c.textBaseline = "alphabetic";
        // Centred on the ink, not the font's line box.
        c.fillText(label, 0, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
        c.restore();
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(-r, -r, 2 * r, 2 * r);
        ctx.closePath();
        ctx.fillShape(shape);
      }}
    />
  );
}

/** Shown when there's no image to preview from (it shouldn't happen): a gray box. */
const REDACT_PLACEHOLDER = "#808080";

/**
 * A redaction's preview: the image under it, pixelated or blurred exactly as
 * Rust will export it. Positioned about its centre like the shapes, so the
 * transformer resizes it the same way.
 */
function RedactShape({ a }: { a: RedactAnnotation }) {
  const source = useRedactSource((s) => s.image);
  const px = redactRect(a.rect);
  const { mode, strength } = a;
  const preview = useMemo(() => {
    if (!source) return null;
    const r = redactReads(px, mode, strength, source);
    if (!r) return null;
    const pixels = redactPixels(source, r.region, mode, strength, r.reads);
    const canvas = document.createElement("canvas");
    canvas.width = r.region.width;
    canvas.height = r.region.height;
    canvas
      .getContext("2d")
      ?.putImageData(new ImageData(pixels, r.region.width, r.region.height), 0, 0);
    return { canvas, x: r.region.x, y: r.region.y };
    // The rounded rect decides the pixels, not its fractional edges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, px.x, px.y, px.width, px.height, mode, strength]);
  const { rect } = a;
  return (
    <Shape
      id={a.id}
      name="annotation"
      x={rect.x + rect.width / 2}
      y={rect.y + rect.height / 2}
      width={rect.width}
      height={rect.height}
      offsetX={rect.width / 2}
      offsetY={rect.height / 2}
      fill={REDACT_PLACEHOLDER}
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        if (preview) {
          ctx.drawImage(preview.canvas, preview.x - rect.x, preview.y - rect.y);
        } else {
          ctx.beginPath();
          ctx.rect(0, 0, rect.width, rect.height);
          ctx.fillShape(shape);
        }
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(0, 0, rect.width, rect.height);
        ctx.fillShape(shape);
      }}
    />
  );
}

/** A line, or an arrow's shaft plus head, drawn from {@link arrowGeometry} so export matches exactly. */
function SegmentShape({ a, hitSlop }: { a: ArrowAnnotation | LineAnnotation; hitSlop: number }) {
  const { color, width, opacity } = a.style;
  const head = a.kind === "arrow" ? a.head : "none";
  const ends = a.kind === "arrow" ? a.ends : "end";
  return (
    <Shape
      id={a.id}
      name="annotation"
      stroke={color}
      strokeWidth={width}
      fill={head === "filled" ? color : undefined}
      lineCap="round"
      lineJoin="round"
      opacity={opacity}
      hitStrokeWidth={width + hitSlop}
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        const g = arrowGeometry(a.from, a.to, head, width, ends, a.bend);
        const s = g.shaft;
        ctx.beginPath();
        if (s.kind === "curve") {
          const [p0, p1, p2, p3] = s.curve;
          ctx.moveTo(p0.x, p0.y);
          ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        } else {
          ctx.moveTo(s.points[0], s.points[1]);
          ctx.lineTo(s.points[2], s.points[3]);
        }
        if (head === "open") {
          for (const [l, t, r] of g.heads) {
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(t.x, t.y);
            ctx.lineTo(r.x, r.y);
          }
        }
        ctx.strokeShape(shape);
        if (head === "filled" && g.heads.length) {
          ctx.beginPath();
          for (const [l, t, r] of g.heads) {
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(t.x, t.y);
            ctx.lineTo(r.x, r.y);
            ctx.closePath();
          }
          ctx.fillShape(shape);
        }
      }}
    />
  );
}

/**
 * The handle that bends a selected line or arrow (PLAN 3D.6): a small diamond
 * on the segment, in the middle when straight. Drag to bend, Shift for a
 * symmetric arc, double-click to straighten.
 */
function BendHandle({
  a,
  scale,
  offset,
  listening,
}: {
  a: ArrowAnnotation | LineAnnotation;
  scale: number;
  offset: Point;
  listening: boolean;
}) {
  const p = bendPoint(a.from, a.to, a.bend);
  const size = 9;
  return (
    <KRect
      name="endpoint"
      annotationId={a.id}
      end="bend"
      listening={listening}
      x={offset.x + p.x * scale}
      y={offset.y + p.y * scale}
      width={size}
      height={size}
      offsetX={size / 2}
      offsetY={size / 2}
      rotation={45}
      fill={CHROME}
      stroke="#ffffff"
      strokeWidth={1.5}
      hitStrokeWidth={8}
    />
  );
}

/**
 * A dashed box around a selected object that can move but not be reshaped
 * (strokes, step markers). `pad` (source px) takes in a stroke's width.
 */
function SelectionBounds({
  bounds: b,
  pad,
  scale,
  offset,
}: {
  bounds: Rect;
  pad: number;
  scale: number;
  offset: Point;
}) {
  return (
    <KRect
      x={offset.x + (b.x - pad) * scale}
      y={offset.y + (b.y - pad) * scale}
      width={(b.width + 2 * pad) * scale}
      height={(b.height + 2 * pad) * scale}
      stroke={CHROME}
      strokeWidth={1}
      dash={[4, 3]}
      listening={false}
    />
  );
}
