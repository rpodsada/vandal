// Remembered tool styles (PLAN 2A.6d): load them when the editor opens, and
// hand every change back to Rust shortly after it happens (and on close), so
// the next window starts the same. Rust ignores both when
// `editor.rememberToolStyles` is off.

import { restoreToolMemory, snapshotToolMemory } from "../markup/toolMemory";
import { useToolStore } from "../markup/toolStore";
import { commands } from "../shared/ipc";

/** Changes within this long are saved together. */
const SAVE_DELAY_MS = 300;

let timer: number | undefined;
let pending: string | null = null;

function save(): Promise<void> {
  window.clearTimeout(timer);
  timer = undefined;
  const json = pending;
  pending = null;
  return json ? commands.setToolStyles(json) : Promise.resolve();
}

/** Save a change still waiting for its delay (call before the window closes). */
export function flushToolStyles(): Promise<void> {
  return save();
}

/** Load the remembered styles, then keep saving changes. Returns a stop function. */
export function startToolStylesSync(): () => void {
  let last = JSON.stringify(snapshotToolMemory());
  let unsubscribe = () => {};
  let stopped = false;

  void commands.getToolStyles().then((json) => {
    if (stopped) return;
    if (json) {
      try {
        restoreToolMemory(JSON.parse(json));
      } catch {
        // Unreadable: start from the defaults; the next change overwrites it.
      }
    }
    last = JSON.stringify(snapshotToolMemory());
    // Only after loading, so the defaults never overwrite what was remembered.
    unsubscribe = useToolStore.subscribe(() => {
      const json = JSON.stringify(snapshotToolMemory());
      if (json === last) return; // e.g. the active tool changed, not a style
      last = json;
      pending = json;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void save(), SAVE_DELAY_MS);
    });
  });

  return () => {
    stopped = true;
    unsubscribe();
    void save();
  };
}
