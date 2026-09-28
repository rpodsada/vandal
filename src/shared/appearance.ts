// Light / dark / follow Windows and the accent color (PLAN 3A). Rust sets
// `data-theme` on the page root before it paints (appearance.rs); this keeps
// it in step with the setting while the window is open, and sets the accent.
// theme.css does the rest.

import { accentShades, onAccent, type AccentShades } from "./accent";
import { commands, events, type Settings, type WindowsAccent } from "./ipc";

type Appearance = Partial<Settings["appearance"]>;

/** The settings' accent, and Windows' (undefined until asked). */
let accent = "windows";
let windowsAccent: WindowsAccent | null | undefined;

function applyTheme(a: Appearance | undefined): void {
  document.documentElement.dataset.theme = a?.theme ?? "system";
}

/** Override theme.css's accent, or fall back to it (our blue) when there's none. */
function applyAccent(): void {
  const style = document.documentElement.style;
  const shades: AccentShades | null =
    accent === "windows" ? (windowsAccent ?? null) : accentShades(accent);
  if (!shades) {
    style.removeProperty("--accent");
    style.removeProperty("--on-accent");
    return;
  }
  style.setProperty("--accent", `light-dark(${shades.light}, ${shades.dark})`);
  style.setProperty(
    "--on-accent",
    `light-dark(${onAccent(shades.light)}, ${onAccent(shades.dark)})`,
  );
}

function apply(a: Appearance | undefined): void {
  applyTheme(a);
  accent = a?.accent ?? "windows";
  if (accent === "windows" && windowsAccent === undefined) {
    void commands.windowsAccent().then((w) => {
      windowsAccent = w;
      applyAccent();
    });
  }
  applyAccent();
}

/** Follow the appearance settings (and the Windows accent) in this window. */
export function startAppearanceSync(): void {
  void events.settingsChanged.listen(({ payload }) => apply(payload.appearance));
  void events.windowsAccentChanged.listen(({ payload }) => {
    windowsAccent = payload;
    applyAccent();
  });
  void commands.getSettings().then((s) => apply(s.appearance));
}
