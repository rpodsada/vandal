import styles from "./OverlayApp.module.css";

interface Props {
  /** Window mode (PLAN 3H): click a window. */
  picking: boolean;
  /** Scrolling capture (PLAN 3K.4): click a scrolling area. */
  scrolling: boolean;
  hasSelection: boolean;
  /** Quick edit: the selection has a toolbar and Enter means Done. */
  quick: boolean;
  /** Move out of the way when the selection is near the top. */
  atBottom: boolean;
}

export function HintBar({ picking, scrolling, hasSelection, quick, atBottom }: Props) {
  return (
    <div className={`${styles.hint} ${atBottom ? styles.hintBottom : ""}`}>
      {scrolling ? (
        <>
          <Hint keys={["Click"]} label="capture scrolling area" />
          <Hint keys={["S"]} label="select area" />
          <Hint keys={["W"]} label="window" />
          <Hint keys={["Esc"]} label="back" />
        </>
      ) : picking ? (
        <>
          <Hint keys={["Click"]} label="capture window" />
          <Hint keys={["W"]} label="select area" />
          <Hint keys={["F"]} label="this screen" />
          <Hint keys={["A"]} label="all screens" />
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
          <Hint keys={["S"]} label="scrolling" />
          <Hint keys={["F"]} label="this screen" />
          <Hint keys={["A"]} label="all screens" />
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
