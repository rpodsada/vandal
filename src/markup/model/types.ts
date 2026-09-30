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

/**
 * Where a segment's bend handle sits, relative to its chord (PLAN 3D.6): `t`
 * of the way from `from` to `to`, then `d` source px to the side (positive:
 * to the right of the direction of travel, as seen on screen). The segment is the circular arc through
 * both ends and that point.
 */
export interface Bend {
  t: number;
  d: number;
}

export interface LineAnnotation extends Base {
  kind: "line";
  from: Point;
  to: Point;
  /** Absent: straight. */
  bend?: Bend;
  style: StrokeStyle;
}

/** No-head arrows are lines: the line tool draws them. */
export type ArrowHead = "filled" | "open";

/** Where the heads go: `to` (where the drag ended), `from` (where it started) or both. */
export type ArrowEnds = "end" | "start" | "both";

export interface ArrowAnnotation extends Base {
  kind: "arrow";
  from: Point;
  /** The end with the head. */
  to: Point;
  head: ArrowHead;
  ends: ArrowEnds;
  /** Absent: straight. */
  bend?: Bend;
  style: StrokeStyle;
}

export type ShapeFill = "none" | "solid" | "both";

export interface ShapeAnnotation extends Base {
  kind: "rect" | "ellipse";
  /** Unrotated bounds; rotation (degrees) is about the centre. */
  rect: Rect;
  rotation: number;
  /** Border only, filled with the border color (no border), or both. */
  fill: ShapeFill;
  /** The fill with `fill: "both"`. */
  fillColor: string;
  style: StrokeStyle;
}

export type TextAlign = "left" | "center" | "right";

export interface TextAnnotation extends Base {
  kind: "text";
  /** Top-left of the box; rotation (degrees) is about this corner. */
  x: number;
  y: number;
  /** Wrap width in source px (with `autoWidth`, the measured width of the longest line). */
  width: number;
  /** Grows to fit the text instead of wrapping (a click-created box, until resized). */
  autoWidth: boolean;
  rotation: number;
  text: string;
  fontFamily: string;
  /** Font size in pt at 100% (source px at 96 dpi). */
  fontSize: number;
  /** For the whole text (no rich text in Phase 2). */
  bold: boolean;
  italic: boolean;
  color: string;
  align: TextAlign;
  /** Draw a filled box behind the text. */
  background: boolean;
  /** The box's color. */
  backgroundColor: string;
}

export type RedactMode = "pixelate" | "blur";

/**
 * Pixelates or blurs the image under it (PLAN 3D.3). Always sits under every
 * other annotation, and Rust bakes it into the exported pixels.
 */
export interface RedactAnnotation extends Base {
  kind: "redact";
  /** Axis-aligned, no rotation. */
  rect: Rect;
  mode: RedactMode;
  /** Pixelate: block size. Blur: radius. Source px. */
  strength: number;
}

export type SpotlightShape = "rect" | "ellipse";

/**
 * Keeps its area bright and darkens everything else (PLAN 3D.7). All
 * spotlights cut holes in one shared dark layer, under the other annotations.
 */
export interface SpotlightAnnotation extends Base {
  kind: "spotlight";
  /** Axis-aligned, no rotation. */
  rect: Rect;
  shape: SpotlightShape;
  /** How dark outside, in %. Shared: every spotlight in a document has the same. */
  dim: number;
}

export type StepShape = "circle" | "square" | "rounded";

/** 1, 2, 3… or A, B, C… */
export type StepFormat = "numbers" | "letters";

/**
 * A numbered or lettered marker (PLAN 3D.11). Its label isn't stored: the
 * markers count up in creation order (`seq`), whatever the z-order, so
 * deleting one renumbers the rest.
 */
export interface StepAnnotation extends Base {
  kind: "step";
  /** The centre. */
  x: number;
  y: number;
  /** Creation order; auto labels count the markers in this order. */
  seq: number;
  /** Width and height in source px. */
  size: number;
  shape: StepShape;
  /** The marker's fill. */
  color: string;
  /** The label's color. */
  textColor: string;
  fontFamily: string;
  /** Shared: every marker in a document has the same. */
  format: StepFormat;
  /** The first auto label (1 is "1" or "A"). Shared, like `format`. */
  start: number;
}

export type Annotation =
  | PenAnnotation
  | HighlighterAnnotation
  | LineAnnotation
  | ArrowAnnotation
  | ShapeAnnotation
  | TextAnnotation
  | RedactAnnotation
  | SpotlightAnnotation
  | StepAnnotation;

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
