// Keyboard shortcuts shared by quick edit and the editor: tools, undo/redo,
// delete, nudge, duplicate, select all, stacking order, the style digits and
// the Esc ladder.
// Host-specific keys (copy, save, zoom, close) live in the host.

import { useEffect, useRef } from "react";
import { isTyping } from "../shared/dom";
import { translateAnnotation } from "./geometry";
import { docStore } from "./model/store";
import { digitSlot, pickByDigit, slotIndex } from "./pickers";
import { applyStyle, colorSlots, styleTarget, targetSections, targetValues } from "./restyle";
import {
  fontChoices,
  paletteFor,
  stepFontChoices,
  strengthPickerFor,
  useStyleConfig,
  widthPickerFor,
} from "./styles";
import { editStepLabel } from "./stepEditing";
import { nextStepSeq } from "./steps";
import { editText } from "./textEditing";
import type { Annotation, NewAnnotation, StepAnnotation } from "./model/types";
import { TOOL_KEYS, useToolStore } from "./toolStore";

/** Duplicates land this far (source px) down-right of the original. */
const DUPLICATE_OFFSET = 10;

/**
 * The markup's shortcuts. `active` (read on each key) lets a host switch them
 * off, e.g. quick edit before there's a selection.
 */
export function useMarkupKeys(active?: () => boolean): void {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeRef.current && !activeRef.current()) return;
      const slot = digitSlot(e.code);
      // Exactly one of Ctrl and Alt: Ctrl+Alt is AltGr, which types characters.
      const styleDigit = slot !== null && e.ctrlKey !== e.altKey;
      const boldItalic = e.ctrlKey && !e.altKey && (e.code === "KeyB" || e.code === "KeyI");
      // Ctrl/Alt+digit and Ctrl+B/I still restyle text while typing into it (PLAN Phase 2).
      if (isTyping(e.target) && !styleDigit && !boldItalic) return;
      if (e.altKey) {
        if (styleDigit && !e.shiftKey && pickFont(slot)) e.preventDefault();
        return;
      }
      if (e.ctrlKey ? handleCtrl(e) : handlePlain(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Digit: line width of the tool or selection, or the size of text (by the pickers' slots). */
function pickWidth(slot: number): boolean {
  const target = styleTarget();
  if (!target) return false;
  const sections = targetSections(target);
  if (sections.text) {
    const fontSize = pickByDigit(useStyleConfig.getState().styles.fontSize, slot);
    if (fontSize !== null) applyStyle({ fontSize });
    return true;
  }
  if (sections.step) {
    const stepSize = pickByDigit(useStyleConfig.getState().styles.stepSize, slot);
    if (stepSize !== null) applyStyle({ stepSize });
    return true;
  }
  if (sections.spotlight) {
    const dim = pickByDigit(useStyleConfig.getState().styles.spotlight, slot);
    if (dim !== null) applyStyle({ dim });
    return true;
  }
  if (sections.redact) {
    const mode = targetValues(target, docStore.getState().doc).redact?.mode;
    const strength = mode ? pickByDigit(strengthPickerFor(mode), slot) : null;
    if (strength !== null) applyStyle({ strength });
    return true;
  }
  if (!sections.width) return false;
  const width = pickByDigit(widthPickerFor(target.tool), slot);
  if (width !== null) applyStyle({ width });
  return true;
}

/** Alt+digit: font slot (tenths of the way along a long list), for text or step markers. */
function pickFont(slot: number): boolean {
  const target = styleTarget();
  if (!target) return false;
  const sections = targetSections(target);
  if (!sections.text && !sections.step) return false;
  const fonts = sections.step ? stepFontChoices() : fontChoices();
  const i = slotIndex(fonts.length, slot);
  if (i !== null) applyStyle({ fontFamily: fonts[i] });
  return true;
}

/** Ctrl+B / Ctrl+I: bold / italic for the text being typed, the selected text or the text tool. */
function toggleTextStyle(code: string): boolean {
  const target = styleTarget();
  if (!target || !targetSections(target).text) return false;
  const text = targetValues(target, docStore.getState().doc).text;
  if (!text) return false;
  applyStyle(code === "KeyB" ? { bold: !text.bold } : { italic: !text.italic });
  return true;
}

/**
 * Ctrl+digit: color preset slot. With Shift, the second color (see
 * {@link colorSlots}): a shape's border when it has a fill too, the box
 * behind text, or a step marker.
 */
function pickColor(slot: number, second: boolean): boolean {
  const target = styleTarget();
  if (!target) return false;
  const sections = targetSections(target);
  if (!sections.color) return false;
  const slots = colorSlots(targetValues(target, docStore.getState().doc), sections);
  const into = second ? slots.second : slots.first;
  if (!into) return false;
  const palette = paletteFor(target.tool);
  const i = slotIndex(palette.length, slot);
  if (i !== null) applyStyle({ [into.key]: palette[i] });
  return true;
}

function handlePlain(e: KeyboardEvent): boolean {
  const store = docStore.getState();
  const tools = useToolStore.getState();
  const slot = digitSlot(e.code);
  if (slot !== null) return !e.shiftKey && pickWidth(slot);
  const tool = TOOL_KEYS[e.code];
  if (tool && !e.shiftKey) {
    tools.setTool(tool);
    return true;
  }
  switch (e.code) {
    case "Enter":
    case "NumpadEnter": {
      // Enter on one selected text object starts typing into it, and on a
      // step marker, its label.
      const [id] = store.selection;
      const a = store.doc.annotations.find((x) => x.id === id);
      if (store.selection.length !== 1) return false;
      if (a?.kind === "text") editText(id);
      else if (a?.kind === "step") editStepLabel(id);
      else return false;
      return true;
    }
    case "Delete":
    case "Backspace":
      if (!store.selection.length) return false;
      store.remove(store.selection);
      return true;
    case "Escape":
      // One step back at a time: selection, then tool (PLAN Phase 2).
      if (store.selection.length) store.select([]);
      else if (tools.tool !== "select") tools.setTool("select");
      else return false;
      return true;
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown": {
      if (!store.selection.length) return false;
      const step = e.shiftKey ? 10 : 1;
      const dx = e.code === "ArrowLeft" ? -step : e.code === "ArrowRight" ? step : 0;
      const dy = e.code === "ArrowUp" ? -step : e.code === "ArrowDown" ? step : 0;
      store.beginGesture();
      for (const id of store.selection) store.update(id, (a) => translateAnnotation(a, dx, dy));
      store.endGesture();
      return true;
    }
  }
  return false;
}

function handleCtrl(e: KeyboardEvent): boolean {
  const store = docStore.getState();
  const slot = digitSlot(e.code);
  if (slot !== null) return pickColor(slot, e.shiftKey);
  if ((e.code === "KeyB" || e.code === "KeyI") && !e.shiftKey) return toggleTextStyle(e.code);
  switch (e.code) {
    case "KeyZ":
      if (e.shiftKey) store.redo();
      else store.undo();
      return true;
    case "KeyY":
    case "KeyR": // habit from other editors; the webview's reload is blocked
      if (e.shiftKey) return false;
      store.redo();
      return true;
    case "KeyA":
      if (e.shiftKey) return false;
      store.select(store.doc.annotations.map((a) => a.id));
      return true;
    case "KeyD": {
      if (e.shiftKey || !store.selection.length) return false;
      const picked = store.doc.annotations.filter((a) => store.selection.includes(a.id));
      store.beginGesture();
      // Duplicated step markers are the newest, so they take the next labels,
      // in the order of the originals.
      const firstSeq = nextStepSeq(store.doc);
      const stepOrder = picked
        .filter((a): a is StepAnnotation => a.kind === "step")
        .sort((a, b) => a.seq - b.seq)
        .map((a) => a.id);
      const ids = picked.map((a) => {
        const copy = withoutId(translateAnnotation(a, DUPLICATE_OFFSET, DUPLICATE_OFFSET));
        if (copy.kind === "step") copy.seq = firstSeq + stepOrder.indexOf(a.id);
        return store.add(copy);
      });
      store.endGesture();
      store.select(ids);
      return true;
    }
    case "BracketRight":
      if (!store.selection.length) return false;
      store.reorder(store.selection, e.shiftKey ? "front" : "forward");
      return true;
    case "BracketLeft":
      if (!store.selection.length) return false;
      store.reorder(store.selection, e.shiftKey ? "back" : "backward");
      return true;
  }
  return false;
}

function withoutId(a: Annotation): NewAnnotation {
  const copy: Partial<Annotation> = { ...a };
  delete copy.id;
  return copy as NewAnnotation;
}
