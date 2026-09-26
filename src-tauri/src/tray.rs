//! Tray icon and menu (PLAN Phase 1.1). The app has no main window.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::session;
use crate::settings::{self, Settings};
use crate::state::AppState;

pub fn create(app: &AppHandle, settings: &Settings) -> tauri::Result<()> {
    let hk = &settings.hotkeys;
    let region = MenuItem::with_id(app, "region", "Capture region", true, hk.region.as_deref())?;
    let fullscreen = MenuItem::with_id(
        app,
        "fullscreen",
        "Capture full screen",
        true,
        hk.fullscreen.as_deref(),
    )?;
    let settings_item = MenuItem::with_id(
        app,
        "settings",
        "Settings (coming soon)",
        false,
        None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Launch on login",
        true,
        settings.startup.launch_on_login,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &region,
            &fullscreen,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let tooltip = match &hk.region {
        Some(h) => format!("{} ({h} to capture)", app.package_info().name),
        None => app.package_info().name.clone(),
    };

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "region" => session::start_region(app),
            "fullscreen" => session::capture_fullscreen(app),
            "autostart" => {
                let enabled = toggle_autostart(app);
                let _ = autostart.set_checked(enabled);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                session::start_region(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Flip the setting, persist it, and apply it. Returns the new state.
fn toggle_autostart(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let mut s = state.settings.write().unwrap();
    s.startup.launch_on_login = !s.startup.launch_on_login;
    let enabled = s.startup.launch_on_login;
    if let Err(e) = settings::save(app, &s) {
        eprintln!("[settings] save failed: {e}");
    }
    drop(s);
    apply_autostart(app, enabled);
    enabled
}

pub fn apply_autostart(app: &AppHandle, enabled: bool) {
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    if let Err(e) = result {
        eprintln!("[startup] autostart {enabled}: {e}");
    }
}
