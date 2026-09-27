// The document an editor opens with (PLAN 2B.3): quick edit may hand its
// annotations over, still editable, in virtual-desktop px; Rust says how far
// to shift them into this editor's base image.

import { translateAnnotation } from "../markup/geometry";
import { emptyDoc, type Annotation, type Doc } from "../markup/model/types";
import type { EditorInit } from "../shared/ipc";

export function initialDoc(init: EditorInit): Doc {
  const doc = emptyDoc({ width: init.width, height: init.height }, init.crop);
  if (!init.markup) return doc;
  const annotations = JSON.parse(init.markup.annotations) as Annotation[];
  const { dx, dy } = init.markup;
  return { ...doc, annotations: annotations.map((a) => translateAnnotation(a, dx, dy)) };
}
