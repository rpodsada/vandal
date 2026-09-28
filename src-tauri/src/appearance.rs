//! Light / dark / follow Windows (PLAN 3A). The pages pick their colors from
//! `data-theme` on their root (see `src/shared/appearance.ts`); Rust sets the
//! native side (title bars) and gives each new page its theme before it
//! paints, so nothing flashes in the wrong colors.

use tauri::{AppHandle, Manager, Theme, WebviewWindowBuilder, Wry};

use crate::settings::ThemeMode;
use crate::state::AppState;

/// The native theme for `mode`; `None` follows Windows.
fn native(mode: ThemeMode) -> Option<Theme> {
    match mode {
        ThemeMode::System => None,
        ThemeMode::Light => Some(Theme::Light),
        ThemeMode::Dark => Some(Theme::Dark),
    }
}

fn attribute(mode: ThemeMode) -> &'static str {
    match mode {
        ThemeMode::System => "system",
        ThemeMode::Light => "light",
        ThemeMode::Dark => "dark",
    }
}

fn current(app: &AppHandle) -> ThemeMode {
    app.state::<AppState>()
        .settings
        .read()
        .unwrap()
        .appearance
        .theme
}

/// A new window starts in the current theme: native title bar, and the page's
/// `data-theme` set before its stylesheet applies.
pub fn themed<'a>(
    app: &AppHandle,
    builder: WebviewWindowBuilder<'a, Wry, AppHandle>,
) -> WebviewWindowBuilder<'a, Wry, AppHandle> {
    let mode = current(app);
    builder.theme(native(mode)).initialization_script(format!(
        "document.documentElement.dataset.theme = {:?};",
        attribute(mode)
    ))
}

/// The setting changed: every open window's title bar follows (the pages
/// follow `SettingsChanged` themselves).
pub fn apply(app: &AppHandle, mode: ThemeMode) {
    for window in app.webview_windows().values() {
        if let Err(e) = window.set_theme(native(mode)) {
            eprintln!("[appearance] {}: {e}", window.label());
        }
    }
}
