//! The settings window (PLAN §4.1): 0–1 instance, created on demand.

use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "settings";

/// Focus the settings window, creating it if needed. It starts hidden and the
/// page shows it after its first render, so it never flashes white.
pub fn open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    // Creating a webview from the main thread's event handlers can deadlock
    // on Windows, so build it elsewhere.
    let app = app.clone();
    std::thread::spawn(move || {
        let builder =
            WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("settings.html".into()));
        let built = crate::appearance::themed(&app, builder)
            .title(format!("{} Settings", crate::product_name(&app)))
            .inner_size(920.0, 680.0)
            .min_inner_size(640.0, 460.0)
            .center()
            .visible(false)
            .build();
        match built {
            Ok(window) => {
                crate::browser_keys::disable(&window);
                // Fallback in case the page never signals it rendered.
                std::thread::sleep(Duration::from_secs(3));
                if !window.is_visible().unwrap_or(true) {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            Err(e) => eprintln!("[settings] window failed: {e}"),
        }
    });
}
