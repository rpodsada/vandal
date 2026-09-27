import styles from "./OverlayApp.module.css";

interface Props {
  hasSelection: boolean;
  /** Quick edit: the selection has a toolbar and Enter means Done. */
  quick: boolean;
  /** Move out of the way when the selection is near the top. */
  atBottom: boolean;
}

export function HintBar({ hasSelection, quick, atBottom }: Props) {
  return (
    <div className={`${styles.hint} ${atBottom ? styles.hintBottom : ""}`}>
      {hasSelection && quick ? (
        <>
          <Hint keys={["Enter"]} label="done" />
          <Hint keys={["Ctrl", "C"]} label="copy" />
          <Hint keys={["Ctrl", "S"]} label="save" />
          <Hint keys={["Ctrl", "E"]} label="editor" />
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
