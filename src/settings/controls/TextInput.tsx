import { useEffect, useState } from "react";
import type { TextItem } from "../schema";
import { useSetting } from "../store";
import type { ControlProps } from "./index";
import { useDraft } from "./useDraft";
import styles from "./controls.module.css";

/** Edits locally; commits on blur or Enter, reverts on Escape. */
export function TextInput({ item, id, disabled }: ControlProps<TextItem>) {
  const [value, setValue] = useSetting(item.path);
  const [draft, setDraft] = useDraft(value);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!item.preview) return;
    let stale = false;
    const t = setTimeout(() => {
      void item.preview!(draft).then((p) => !stale && setPreview(p));
    }, 120);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [draft, item.preview]);

  const commit = () => {
    if (draft !== value) setValue(draft);
  };

  return (
    <div className={styles.stack}>
      <input
        id={id}
        className={styles.input}
        value={draft}
        placeholder={item.placeholder}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(value);
        }}
      />
      {preview && (
        <p className={styles.preview}>
          Example: <span className={styles.previewValue}>{preview}</span>
        </p>
      )}
      {item.help && <p className={styles.help}>{item.help}</p>}
    </div>
  );
}
