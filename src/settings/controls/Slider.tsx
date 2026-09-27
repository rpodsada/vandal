import { useEffect, useRef } from "react";
import type { SliderItem } from "../schema";
import { useSetting } from "../store";
import type { ControlProps } from "./index";
import { useDraft } from "./useDraft";
import styles from "./controls.module.css";

/** Moves locally; commits once the value settles so a drag is one save. */
export function Slider({ item, id, disabled }: ControlProps<SliderItem>) {
  const [value, setStored] = useSetting(item.path);
  const [draft, setDraft] = useDraft(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next: number) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStored(next), 200);
  };

  const pct = ((draft - item.min) / (item.max - item.min)) * 100;
  return (
    <div className={styles.sliderWrap}>
      <span className={styles.sliderValue}>{item.format ? item.format(draft) : draft}</span>
      <input
        id={id}
        type="range"
        className={styles.slider}
        style={{ ["--fill" as string]: `${pct}%` }}
        min={item.min}
        max={item.max}
        step={item.step}
        value={draft}
        disabled={disabled}
        onChange={(e) => change(Number(e.target.value))}
      />
    </div>
  );
}
