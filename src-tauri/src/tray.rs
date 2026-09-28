//! Tray icon and menu (PLAN Phase 1.1). The app has no main window.
//!
//! The menu is rebuilt from settings whenever they change, so its contents
//! (optional items, check states, hotkey labels) always match.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Wry};
use tauri_plugin_autostart::ManagerExt;

use crate::settings::{self, Settings};
use crate::{editor, session, settings_window};

const TRAY_ID: &str = "main";

fn build_menu(app: &AppHandle, s: &Settings) -> tauri::Result<Menu<Wry>> {
    let hk = &s.hotkeys;
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(
        app,
        "region",
        "Capture region",
        true,
        hk.region.as_deref(),
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "fullscreen",
        "Capture full screen",
        true,
        hk.fullscreen.as_deref(),
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "open",
        "Open image…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "clipboard",
        "New from clipboard",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if s.tray.show_auto_save_toggle {
        menu.append(&CheckMenuItem::with_id(
            app,
            "autosave",
            "Save captures to file",
            true,
            s.after_capture.auto_save,
            None::<&str>,
        )?)?;
    }
    menu.append(&CheckMenuItem::with_id(
        app,
        "autostart",
        "Launch on login",
        true,
        s.startup.launch_on_login,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "settings",
        "Settings…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?)?;
    Ok(menu)
}

fn tooltip(app: &AppHandle, s: &Settings) -> String {
    match &s.hotkeys.region {
        Some(h) => format!("{} ({h} to capture)", crate::product_name(app)),
        None => crate::product_name(app),
    }
}

pub fn create(app: &AppHandle, s: &Settings) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(tooltip(app, s))
        .menu(&build_menu(app, s)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let result = match event.id().as_ref() {
                "autosave" => settings::modify(app, |s| {
                    s.after_capture.auto_save = !s.after_capture.auto_save
                }),
                "autostart" => settings::modify(app, |s| {
                    s.startup.launch_on_login = !s.startup.launch_on_login
                }),
                other => {
                    match other {
                        "region" => session::start_region(app),
                        "fullscreen" => session::capture_fullscreen(app),
                        "settings" => settings_window::open(app),
                        "open" => {
                            // The dialog blocks; keep the tray responsive.
                            let app = app.clone();
                            std::thread::spawn(move || editor::ask_open(&app, None));
                        }
                        "clipboard" => editor::open_clipboard(app),
                        "quit" => app.exit(0),
                        _ => {}
                    }
                    return;
                }
            };
            if let Err(e) = result {
                eprintln!("[tray] {e}");
            }
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

/// Rebuild the menu and tooltip from `s`.
pub fn refresh(app: &AppHandle, s: &Settings) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    match build_menu(app, s) {
        Ok(menu) => {
            let _ = tray.set_menu(Some(menu));
        }
        Err(e) => eprintln!("[tray] menu rebuild failed: {e}"),
    }
    let _ = tray.set_tooltip(Some(tooltip(app, s)));
}

pub fn apply_autostart(app: &AppHandle, enabled: bool) {
    // Never register a dev build to start with Windows.
    if cfg!(debug_assertions) {
        eprintln!("[startup] dev build: launch on login = {enabled} (not applied)");
        return;
    }
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
