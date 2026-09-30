import { Fragment } from "react";
import type { KeyListItem } from "../schema";
import type { ControlProps } from "./index";
import styles from "./controls.module.css";

/** A read-only table of shortcuts (PLAN 3F.4): key caps, then what they do. */
export function KeyList({ item, id }: ControlProps<KeyListItem>) {
  return (
    <dl id={id} className={styles.keyList}>
      {item.entries.map((entry) => (
        <Fragment key={entry.keys.join()}>
          <dt className={styles.keyListKeys}>
            {entry.keys.map((combo, i) => (
              <Fragment key={combo}>
                {i > 0 && <span className={styles.keyListOr}>or</span>}
                <Combo combo={combo} />
              </Fragment>
            ))}
          </dt>
          <dd className={styles.keyListWhat}>{entry.what}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** "Ctrl+Shift+]" as key caps; a lowercase word ("drag") is a mouse action, as text. */
function Combo({ combo }: { combo: string }) {
  // Split on "+" between parts, keeping a "+" that is itself the key.
  const parts = combo.split(/\+(?=.)/);
  return (
    <span className={styles.keyListCombo}>
      {parts.map((p, i) =>
        /^[a-z]+$/.test(p) ? (
          <span key={i} className={styles.keyListMouse}>
            {p}
          </span>
        ) : (
          <kbd key={i} className={styles.keycap}>
            {p}
          </kbd>
        ),
      )}
    </span>
  );
}
