import { useState } from "react";

/**
 * Local edit state that follows the stored value whenever it changes from
 * outside (validation, another window, the tray). Uses React's "adjust state
 * during render" pattern instead of an effect.
 */
export function useDraft<T>(value: T): [T, (next: T) => void] {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (!Object.is(value, seen)) {
    setSeen(value);
    setDraft(value);
  }
  return [draft, setDraft];
}
