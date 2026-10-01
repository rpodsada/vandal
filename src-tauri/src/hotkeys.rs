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
    Window,
}

impl Action {
    fn describe(self) -> &'static str {
        match self {
            Self::Region => "region capture",
            Self::Fullscreen => "full-screen capture",
            Self::Window => "window capture",
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

/// Whether `hotkey` can be ours: it parses and no other app (or Windows)
/// holds it. Registers it for a moment, so call it while ours are paused.
pub fn check(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::Shortcut;
    let shortcut: Shortcut = to_accelerator(hotkey)
        .parse()
        .map_err(|_| format!("{hotkey} can't be a shortcut. Pick another one."))?;
    let gs = app.global_shortcut();
    match gs.register(shortcut) {
        Ok(()) => {
            let _ = gs.unregister(shortcut);
            Ok(())
        }
        Err(e) => {
            eprintln!("[hotkeys] check {hotkey}: {e}");
            if hotkey.to_ascii_lowercase().contains("printscreen") && print_screen_opens_snipping()
            {
                Err(format!(
                    "Windows uses {hotkey} to open its own screen capture. \
                     Turn that off in Windows Settings, or pick another shortcut."
                ))
            } else {
                Err(format!(
                    "{hotkey} is already used by Windows or another app. Pick another one."
                ))
            }
        }
    }
}

/// Windows 11's "Use the Print Screen key to open screen capture" (on unless
/// turned off; Windows 10 leaves the value unset, and the key free).
pub fn print_screen_opens_snipping() -> bool {
    use windows::core::w;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let mut value = 0u32;
    let mut size = std::mem::size_of::<u32>() as u32;
    let result = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Control Panel\\Keyboard"),
            w!("PrintScreenKeyForSnippingEnabled"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut value as *mut u32 as *mut _),
            Some(&mut size),
        )
    };
    if result.is_ok() {
        value != 0
    } else {
        windows_11()
    }
}

fn windows_11() -> bool {
    use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(info: *mut OSVERSIONINFOW) -> i32;
    }
    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    unsafe { RtlGetVersion(&mut info) == 0 && info.dwBuildNumber >= 22000 }
}

/// (Re)register all hotkeys. Failures are reported in one notification.
pub fn register(app: &AppHandle, hotkeys: &Hotkeys) {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let bindings = [
        (hotkeys.region.as_deref(), Action::Region),
        (hotkeys.fullscreen.as_deref(), Action::Fullscreen),
        (hotkeys.window.as_deref(), Action::Window),
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
                    Action::Window => session::start_window(app),
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
