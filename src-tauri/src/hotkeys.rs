//! Global hotkeys. Phase 0: one hardcoded region-capture hotkey.

use tauri::plugin::TauriPlugin;
use tauri::Wry;
use tauri_plugin_global_shortcut::ShortcutState;

use crate::session;

pub const CAPTURE_HOTKEY: &str = "ctrl+shift+F12";

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_shortcut(CAPTURE_HOTKEY)
        .expect("valid hotkey")
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                session::start_capture(app);
            }
        })
        .build()
}
