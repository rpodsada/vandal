import { Fragment, useEffect } from "react";
import { useDoc } from "./model/store";
import { chooseHint, parseHint, useHintSources, type ControlHint } from "./hints";
import { styleTarget, targetValues } from "./restyle";
import { useStyleConfig } from "./styles";
import { useToolStore } from "./toolStore";
import styles from "./markup.module.css";

/** Marks a control for the hint line: `<button {...hint("copy")}>`. */
export function hint(id: ControlHint): { "data-hint": ControlHint } {
  return { "data-hint": id };
}

/**
 * The status bar's hint line (PLAN 2A.6e): the keys that do something right
 * now. Off with `editor.showShortcutHints`.
 */
export function HintLine() {
  const { hover, drag, overObject } = useHintSources();
  const tool = useToolStore((s) => s.tool);
  const typing = useToolStore((s) => s.editing !== null);
  const selected = useDoc((s) => s.selection.length);
  const textSelected = useDoc(
    (s) =>
      s.selection.length === 1 &&
      s.doc.annotations.find((a) => a.id === s.selection[0])?.kind === "text",
  );
  const config = useStyleConfig();
  // For naming the second color only when there is one.
  const doc = useDoc((s) => s.doc);
  const selection = useDoc((s) => s.selection);
  const editing = useToolStore((s) => s.editing?.id ?? null);
  useToolStore((s) => s.fills);
  useToolStore((s) => s.textBackground);
  const target = styleTarget(doc, selection, tool, editing);
  const values = target && targetValues(target, doc);
  const twoColors = values?.fill === "both" || !!values?.text?.background;

  // Whatever control is under the pointer, found by its data-hint.
  useEffect(() => {
    const onOver = (e: PointerEvent) => {
      // Dragging across a control (e.g. a slider thumb leaving it) keeps the hint.
      if (e.buttons) return;
      const el = (e.target as Element | null)?.closest?.("[data-hint]");
      const id = (el?.getAttribute("data-hint") ?? null) as ControlHint | null;
      if (useHintSources.getState().hover !== id) useHintSources.setState({ hover: id });
    };
    const onLeave = () => useHintSources.setState({ hover: null });
    window.addEventListener("pointerover", onOver);
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  if (!config.showShortcutHints) return null;
  const text = chooseHint({
    hover,
    drag,
    tool,
    selected,
    textSelected,
    typing,
    overObject,
    twoColors,
    drawingToolsSelect: config.drawingToolsSelect,
  });

  return (
    <span className={styles.hintLine}>
      {parseHint(text).map((part, i) =>
        "text" in part ? (
          <Fragment key={i}>{part.text}</Fragment>
        ) : (
          <span key={i} className={styles.keys}>
            {part.keys.map((k, j) => (
              <Fragment key={j}>
                {j > 0 && "+"}
                <kbd>{k}</kbd>
              </Fragment>
            ))}
          </span>
        ),
      )}
    </span>
  );
}
