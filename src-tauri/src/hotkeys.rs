//! Global hotkeys, registered from settings (PLAN Phase 1.3).

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::settings::Hotkeys;
use crate::{output, session};

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new().build()
}

/// Settings use the Windows spelling (`Win+Shift+F12`); the parser wants `Super`.
pub fn to_accelerator(hotkey: &str) -> String {
    hotkey
        .split('+')
        .map(|part| match part.trim() {
            p if p.eq_ignore_ascii_case("win") || p.eq_ignore_ascii_case("windows") => "Super",
            p => p,
        })
        .collect::<Vec<_>>()
        .join("+")
}

#[derive(Clone, Copy)]
enum Action {
    Region,
    Fullscreen,
}

impl Action {
    fn describe(self) -> &'static str {
        match self {
            Self::Region => "region capture",
            Self::Fullscreen => "full-screen capture",
        }
    }
}

/// Unregister our shortcuts while Settings records a new one (PLAN 3B).
pub fn pause(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
}

/// Register our shortcuts again, as settings have them now.
pub fn resume(app: &AppHandle) {
    use tauri::Manager;
    let hotkeys = app
        .state::<crate::state::AppState>()
        .settings
        .read()
        .unwrap()
        .hotkeys
        .clone();
    register(app, &hotkeys);
}

/// (Re)register all hotkeys. Failures are reported in one notification.
pub fn register(app: &AppHandle, hotkeys: &Hotkeys) {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let bindings = [
        (hotkeys.region.as_deref(), Action::Region),
        (hotkeys.fullscreen.as_deref(), Action::Fullscreen),
    ];
    let mut failures = Vec::new();
    for (hotkey, action) in bindings {
        let Some(hotkey) = hotkey.filter(|h| !h.trim().is_empty()) else {
            continue;
        };
        let result = gs.on_shortcut(to_accelerator(hotkey).as_str(), move |app, _, event| {
            if event.state == ShortcutState::Pressed {
                match action {
                    Action::Region => session::start_region(app),
                    Action::Fullscreen => session::capture_fullscreen(app),
                }
            }
        });
        match result {
            Ok(()) => eprintln!("[hotkeys] {hotkey} → {}", action.describe()),
            Err(e) => {
                eprintln!("[hotkeys] {hotkey} failed: {e}");
                failures.push(hotkey.to_string());
            }
        }
    }

    if !failures.is_empty() {
        let mut body = format!(
            "{} {} already in use by another app. Use the tray icon to capture, or close the other app.",
            failures.join(", "),
            if failures.len() == 1 { "is" } else { "are" }
        );
        if failures
            .iter()
            .any(|h| h.to_ascii_lowercase().contains("printscreen"))
        {
            body.push_str(
                " For Print Screen, turn off Settings › Accessibility › Keyboard › \
                 \"Use the Print Screen key to open screen capture\".",
            );
        }
        output::notify_error(app, "Hotkey unavailable", &body);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn win_becomes_super() {
        assert_eq!(to_accelerator("Win+F12"), "Super+F12");
        assert_eq!(to_accelerator("Win+Shift+F12"), "Super+Shift+F12");
        assert_eq!(to_accelerator("ctrl + WIN + s"), "ctrl+Super+s");
        assert_eq!(to_accelerator("Shift+PrintScreen"), "Shift+PrintScreen");
    }

    #[test]
    fn converted_defaults_parse() {
        use tauri_plugin_global_shortcut::Shortcut;
        let defaults = Hotkeys::default();
        for h in [defaults.region, defaults.fullscreen, defaults.window]
            .into_iter()
            .flatten()
        {
            assert!(to_accelerator(&h).parse::<Shortcut>().is_ok(), "{h}");
        }
    }
}
