import { commands } from "../../shared/ipc";
import type { FolderItem } from "../schema";
import { useSetting, useSettingsStore } from "../store";
import type { ControlProps } from "./index";
import { useDraft } from "./useDraft";
import styles from "./controls.module.css";

/** A path you can type (env vars like %USERPROFILE% allowed), browse or open. */
export function FolderInput({ item, id, disabled }: ControlProps<FolderItem>) {
  const [value, setValue] = useSetting(item.path);
  const [draft, setDraft] = useDraft(value);

  const commit = (next: string) => {
    if (next !== value) setValue(next);
  };

  const browse = async () => {
    const picked = await commands.pickFolder(draft);
    if (picked) {
      setDraft(picked);
      commit(picked);
    }
  };

  const open = async () => {
    const result = await commands.openFolder(value);
    if (result.status === "error") useSettingsStore.setState({ error: result.error });
  };

  return (
    <div className={styles.folderRow}>
      <input
        id={id}
        className={styles.input}
        value={draft}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") setDraft(value);
        }}
      />
      <button type="button" className={styles.button} disabled={disabled} onClick={browse}>
        Browse…
      </button>
      <button type="button" className={styles.button} disabled={disabled} onClick={open}>
        Open
      </button>
    </div>
  );
}
