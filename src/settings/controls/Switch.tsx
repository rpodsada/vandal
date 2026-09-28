import styles from "./controls.module.css";

interface Props {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  /** For screen readers when no <label> points at it. */
  label?: string;
  onChange: (checked: boolean) => void;
}

/** An on/off switch with its state written beside it. */
export function Switch({ id, checked, disabled, label, onChange }: Props) {
  return (
    <div className={styles.toggleWrap}>
      <span className={styles.toggleState} aria-hidden>
        {checked ? "On" : "Off"}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
