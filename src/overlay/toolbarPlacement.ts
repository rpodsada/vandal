// Where quick edit's toolbar goes (PLAN Phase 2, "Quick edit"): below the
// selection, flipped above when there's no room below, inside its bottom edge
// when neither fits; centred on the selection and kept on the monitor. All in
// CSS px of the overlay (one monitor).

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Side = "below" | "above" | "inside";

export interface Placement {
  x: number;
  y: number;
  side: Side;
}

/** Space between the selection and the toolbar. */
export const TOOLBAR_GAP = 12;
/** Space kept between the toolbar and the monitor's edges. */
export const SCREEN_MARGIN = 8;

export function toolbarPlacement(selection: Box, toolbar: Size, screen: Size): Placement {
  const below = selection.y + selection.height + TOOLBAR_GAP;
  const above = selection.y - TOOLBAR_GAP - toolbar.height;
  let side: Side;
  let y: number;
  if (below + toolbar.height <= screen.height - SCREEN_MARGIN) {
    side = "below";
    y = below;
  } else if (above >= SCREEN_MARGIN) {
    side = "above";
    y = above;
  } else {
    // Neither fits: over the selection's bottom edge, still on screen.
    side = "inside";
    y = Math.max(
      SCREEN_MARGIN,
      Math.min(
        selection.y + selection.height - TOOLBAR_GAP - toolbar.height,
        screen.height - SCREEN_MARGIN - toolbar.height,
      ),
    );
  }
  const centred = selection.x + selection.width / 2 - toolbar.width / 2;
  const x = Math.max(
    SCREEN_MARGIN,
    Math.min(centred, screen.width - SCREEN_MARGIN - toolbar.width),
  );
  return { x: Math.round(x), y: Math.round(y), side };
}
