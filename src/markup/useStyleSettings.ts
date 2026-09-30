// Feed the markup's style config from the app settings, and keep it in step
// with `SettingsChanged` (both hosts: the editor and quick edit).

import { useEffect } from "react";
import { commands, events, type Settings } from "../shared/ipc";
import { useStyleConfig } from "./styles";

export function applyStyleSettings(s: Settings): void {
  useStyleConfig.setState({
    styles: s.styles,
    shareColor: s.editor.shareColor,
    showShortcutHints: s.editor.showShortcutHints,
    showButtonUnits: s.editor.showButtonUnits,
    drawingToolsSelect: s.editor.drawingToolsSelect,
    shortcuts: s.shortcuts,
  });
}

/** Load the settings and installed fonts into the style config, and follow changes. */
export function useStyleSettings(onSettings?: (s: Settings) => void): void {
  useEffect(() => {
    const apply = (s: Settings) => {
      applyStyleSettings(s);
      onSettings?.(s);
    };
    void commands.getSettings().then((s) => apply(s as Settings));
    // The font picker's list (DirectWrite, cached in Rust).
    void commands.listFonts().then((fonts) => useStyleConfig.setState({ fonts }));
    const unlisten = events.settingsChanged.listen(({ payload }) => apply(payload as Settings));
    return () => void unlisten.then((f) => f());
    // `onSettings` is read once; the hosts pass a stable function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
