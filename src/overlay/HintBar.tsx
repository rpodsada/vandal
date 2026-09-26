import styles from "./OverlayApp.module.css";

interface Props {
  hasSelection: boolean;
  /** Move out of the way when the selection is near the top. */
  atBottom: boolean;
}

export function HintBar({ hasSelection, atBottom }: Props) {
  return (
    <div className={`${styles.hint} ${atBottom ? styles.hintBottom : ""}`}>
      {hasSelection ? (
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
