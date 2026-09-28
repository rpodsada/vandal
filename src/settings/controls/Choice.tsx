import type { ChoiceItem } from "../schema";
import { useSetting } from "../store";
import type { ControlProps } from "./index";
import { Segmented } from "./Segmented";
import styles from "./controls.module.css";

/** One value from a fixed list: joined buttons for a few, a dropdown for more. */
export function Choice({ item, id, disabled }: ControlProps<ChoiceItem>) {
  const [value, setValue] = useSetting(item.path);
  if (item.control === "select") {
    return (
      <select
        id={id}
        className={styles.select}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
      >
        {item.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Segmented
      id={id}
      label={item.label}
      options={item.options}
      value={value}
      disabled={disabled}
      onChange={setValue}
    />
  );
}
