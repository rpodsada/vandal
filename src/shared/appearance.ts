// Light / dark / follow Windows (PLAN 3A). Rust sets `data-theme` on the
// page root before it paints (appearance.rs); this keeps it in step with the
// setting while the window is open. theme.css does the rest.

import { commands, events, type Settings } from "./ipc";

type Theme = Settings["appearance"]["theme"];

function apply(theme: Theme | undefined): void {
  document.documentElement.dataset.theme = theme ?? "system";
}

/** Follow the appearance setting in this window. */
export function startAppearanceSync(): void {
  void events.settingsChanged.listen(({ payload }) => apply(payload.appearance?.theme));
  void commands.getSettings().then((s) => apply(s.appearance?.theme));
}
