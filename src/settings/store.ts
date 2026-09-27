// Settings state for the settings window. Rust is the source of truth: every
// change is sent to `update_settings`, which validates, saves and applies it,
// and the stored result (possibly normalized) replaces the optimistic value.
// Changes made elsewhere (e.g. the tray menu) arrive via `SettingsChanged`.
// Wire types have optional fields (see `Settings` in ipc.ts); Rust always
// sends complete objects, hence the casts at this boundary.
import { create } from "zustand";
import { commands, events, type Settings } from "../shared/ipc";
import { getIn, setIn, type Path, type PathValue } from "./path";

interface SettingsState {
  settings: Settings | null;
  error: string | null;
  init: () => Promise<void>;
  set: <P extends Path<Settings>>(path: P, value: PathValue<Settings, P>) => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  error: null,

  init: async () => {
    void events.settingsChanged.listen(({ payload }) => set({ settings: payload as Settings }));
    set({ settings: (await commands.getSettings()) as Settings });
  },

  set: async (path, value) => {
    const current = get().settings;
    if (!current) return;
    const next = setIn(current, path, value);
    set({ settings: next, error: null });
    const result = await commands.updateSettings(next);
    if (result.status === "ok") {
      set({ settings: result.data as Settings });
    } else {
      // Resync with what Rust actually has rather than guessing.
      set({ error: result.error, settings: (await commands.getSettings()) as Settings });
    }
  },

  clearError: () => set({ error: null }),
}));

/** `[value, setValue]` for one setting. */
export function useSetting<P extends Path<Settings>>(
  path: P,
): [PathValue<Settings, P>, (value: PathValue<Settings, P>) => void] {
  const value = useSettingsStore((s) => getIn(s.settings!, path));
  const setSetting = useSettingsStore((s) => s.set);
  return [value, (v) => void setSetting(path, v)];
}
