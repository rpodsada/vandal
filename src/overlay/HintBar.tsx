import styles from "./OverlayApp.module.css";

interface Props {
  /** Window mode (PLAN 3H): click a window. */
  picking: boolean;
  hasSelection: boolean;
  /** Quick edit: the selection has a toolbar and Enter means Done. */
  quick: boolean;
  /** Move out of the way when the selection is near the top. */
  atBottom: boolean;
  /** More than one monitor: otherwise A (all screens) is just F. */
  screens: number;
}

export function HintBar({ picking, hasSelection, quick, atBottom, screens }: Props) {
  return (
    <div className={`${styles.hint} ${atBottom ? styles.hintBottom : ""}`}>
      {picking ? (
        <>
          <Hint keys={["Click"]} label="capture window" />
          <Hint keys={["W"]} label="select area" />
          <Hint keys={["F"]} label="this screen" />
          {screens > 1 && <Hint keys={["A"]} label="all screens" />}
          <Hint keys={["Esc"]} label="back" />
        </>
      ) : hasSelection && quick ? (
        <>
          <Hint keys={["Enter"]} label="done" />
          <Hint keys={["Ctrl", "C"]} label="copy" />
          <Hint keys={["Ctrl", "S"]} label="save" />
          <Hint keys={["Ctrl", "E"]} label="editor" />
          <Hint keys={["Ctrl", ","]} label="settings" />
          <Hint keys={["Drag"]} label="adjust" />
          <Hint keys={["Esc"]} label="exit" />
        </>
      ) : hasSelection ? (
        <>
          <Hint keys={["Enter"]} label="capture" />
          <Hint keys={["Drag"]} label="adjust" />
          <Hint keys={["←↑↓→"]} label="nudge" />
          <Hint keys={["Ctrl", "←↑↓→"]} label="resize" />
          <Hint keys={["Esc"]} label="cancel" />
        </>
      ) : (
        <>
          <Hint keys={["Drag"]} label="select area" />
          <Hint keys={["W"]} label="window" />
          <Hint keys={["F"]} label="this screen" />
          {screens > 1 && <Hint keys={["A"]} label="all screens" />}
          <Hint keys={["Esc"]} label="cancel" />
        </>
      )}
    </div>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className={styles.hintItem}>
      {keys.map((k) => (
        <kbd key={k}>{k}</kbd>
      ))}
      {label}
    </span>
  );
}
