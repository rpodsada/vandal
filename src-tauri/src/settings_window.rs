//! The settings window (PLAN §4.1): 0–1 instance, created on demand.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_specta::Event;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{SetWindowLongPtrW, GWLP_HWNDPARENT};

pub const LABEL: &str = "settings";

/// Rust → the settings window: show this page (a section id, e.g. "about").
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct SettingsShowPage(pub String);

/// Focus the settings window, creating it if needed. It starts hidden and the
/// page shows it after its first render, so it never flashes white.
pub fn open(app: &AppHandle) {
    open_at(app, None);
}

/// [`open`], at one of its pages (a section id in `sections.tsx`).
pub fn open_page(app: &AppHandle, page: &str) {
    open_at(app, Some(page));
}

fn open_at(app: &AppHandle, page: Option<&str>) {
    if let Some(window) = app.get_webview_window(LABEL) {
        follow_overlay(app, &window);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(page) = page {
            let _ = SettingsShowPage(page.to_string()).emit_to(app, LABEL);
        }
        return;
    }
    let url = match page {
        Some(page) => format!("settings.html#{page}"),
        None => "settings.html".to_string(),
    };
    // Creating a webview from the main thread's event handlers can deadlock
    // on Windows, so build it elsewhere.
    let app = app.clone();
    std::thread::spawn(move || {
        let builder = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App(url.into()));
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
                follow_overlay(&app, &window);
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

/// Opened from quick edit, Settings goes above its overlay and stays there
/// while you go back to the markup: owned by the overlay (an owned window is
/// always above its owner) and topmost like it. Otherwise it's a normal window.
fn follow_overlay(app: &AppHandle, window: &WebviewWindow) {
    let owner = crate::overlay::shown(app).and_then(|o| o.hwnd().ok());
    let _ = window.set_always_on_top(owner.is_some());
    set_owner(window, owner.map(|h| HWND(h.0)));
}

/// Quick edit closed: Settings (if open) becomes a normal window again.
pub fn release(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        set_owner(&window, None);
        let _ = window.set_always_on_top(false);
    }
}

fn set_owner(window: &WebviewWindow, owner: Option<HWND>) {
    if let Ok(hwnd) = window.hwnd() {
        let owner = owner.map_or(0, |h| h.0 as isize);
        unsafe {
            SetWindowLongPtrW(HWND(hwnd.0), GWLP_HWNDPARENT, owner);
        }
    }
}
