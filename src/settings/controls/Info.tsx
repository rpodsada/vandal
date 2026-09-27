import type { InfoItem } from "../schema";
import { useSettingsStore } from "../store";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

export function Info({ item, id }: ControlProps<InfoItem>) {
  const text = useSettingsStore((s) => item.value(s.settings!));
  return (
    <span id={id} className={styles.info}>
      {text}
    </span>
  );
}
