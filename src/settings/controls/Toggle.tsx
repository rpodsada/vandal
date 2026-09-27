import type { ToggleItem } from "../schema";
import { useSetting } from "../store";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

export function Toggle({ item, id, disabled }: ControlProps<ToggleItem>) {
  const [value, setValue] = useSetting(item.path);
  return (
    <div className={styles.toggleWrap}>
      <span className={styles.toggleState} aria-hidden>
        {value ? "On" : "Off"}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        className={styles.switch}
        onClick={() => setValue(!value)}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
