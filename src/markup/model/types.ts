// The editor document (PLAN §4.6): plain serializable data. All geometry is in
// source-image pixels, whatever the view zoom. Quick edit and the full editor
// share this model.

export const DOC_VERSION = 1;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AnnotationId = string;

export interface StrokeStyle {
  /** CSS color, e.g. "#e53935". */
  color: string;
  /** Line width in source px. */
  width: number;
  /** 0–1. */
  opacity: number;
}

interface Base {
  id: AnnotationId;
}

/** Freehand stroke; `points` is flat `[x0, y0, x1, y1, …]`. Movable, not reshapeable. */
export interface PenAnnotation extends Base {
  kind: "pen";
  points: number[];
  style: StrokeStyle;
}

/** Like pen, drawn semi-transparent with a multiply blend. */
export interface HighlighterAnnotation extends Base {
  kind: "highlighter";
  points: number[];
  style: StrokeStyle;
}

export interface LineAnnotation extends Base {
  kind: "line";
  from: Point;
  to: Point;
  style: StrokeStyle;
}

export type ArrowHead = "filled" | "open" | "none";

export interface ArrowAnnotation extends Base {
  kind: "arrow";
  from: Point;
  /** The end with the head. */
  to: Point;
  head: ArrowHead;
  style: StrokeStyle;
}

export interface ShapeAnnotation extends Base {
  kind: "rect" | "ellipse";
  /** Unrotated bounds; rotation (degrees) is about the centre. */
  rect: Rect;
  rotation: number;
  /** Filled with the stroke color instead of outlined. */
  filled: boolean;
  style: StrokeStyle;
}

export type TextAlign = "left" | "center" | "right";

export interface TextAnnotation extends Base {
  kind: "text";
  /** Top-left of the box. */
  x: number;
  y: number;
  /** Wrap width in source px. */
  width: number;
  rotation: number;
  text: string;
  fontFamily: string;
  /** Font size in pt at 100% (source px at 96 dpi). */
  fontSize: number;
  color: string;
  align: TextAlign;
  /** Draw a filled box behind the text. */
  background: boolean;
}

export type Annotation =
  | PenAnnotation
  | HighlighterAnnotation
  | LineAnnotation
  | ArrowAnnotation
  | ShapeAnnotation
  | TextAnnotation;

export type AnnotationKind = Annotation["kind"];

/** An annotation before the store gives it an id. */
export type NewAnnotation = Annotation extends infer A
  ? A extends Annotation
    ? Omit<A, "id">
    : never
  : never;

export interface Doc {
  version: typeof DOC_VERSION;
  /** Size of the base image; its pixels are owned by Rust and fetched by the host. */
  source: { width: number; height: number };
  /** The visible, exported part of the source (non-destructive crop). */
  crop: Rect;
  /** Back to front. */
  annotations: Annotation[];
}

export function emptyDoc(source: { width: number; height: number }, crop?: Rect): Doc {
  return {
    version: DOC_VERSION,
    source,
    crop: crop ?? { x: 0, y: 0, width: source.width, height: source.height },
    annotations: [],
  };
}
