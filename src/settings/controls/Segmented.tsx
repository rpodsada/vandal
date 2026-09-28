import styles from "./controls.module.css";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  id?: string;
  /** Names the group for screen readers. */
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}

/** One of a few options, all visible: a row of joined buttons. */
export function Segmented<T extends string>({
  id,
  label,
  options,
  value,
  disabled,
  onChange,
}: Props<T>) {
  return (
    <div id={id} role="radiogroup" aria-label={label} className={styles.segmented}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={styles.segment}
          disabled={disabled}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
