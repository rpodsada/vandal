//! Tray icon and menu (PLAN Phase 1.1). The app has no main window.
//!
//! The menu is rebuilt from settings whenever they change, so its contents
//! (optional items, check states, hotkey labels) always match.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;

use crate::settings::{self, IconAction, Settings};
use crate::state::AppState;
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
        "window",
        "Capture window",
        true,
        hk.window.as_deref(),
    )?)?;
    // Captures | the two "New…" items | Open (PLAN 3H.10).
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "new-editor",
        "New editor window",
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
    menu.append(&MenuItem::with_id(
        app,
        "open",
        "Open image…",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
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
                "autostart" => settings::modify(app, |s| {
                    s.startup.launch_on_login = !s.startup.launch_on_login
                }),
                other => {
                    match other {
                        "region" => session::start_region(app),
                        "fullscreen" => session::capture_fullscreen(app),
                        "window" => session::start_window(app),
                        "settings" => settings_window::open(app),
                        "open" => {
                            // The dialog blocks; keep the tray responsive.
                            let app = app.clone();
                            std::thread::spawn(move || editor::ask_open(&app));
                        }
                        "clipboard" => editor::open_clipboard(app, None),
                        "new-editor" => editor::open_empty(app),
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
                icon_action(tray.app_handle(), |s| s.tray.click_action);
            }
        });
    builder = builder.icon(tray_icon()?);
    builder.build(app)?;
    Ok(())
}

/// Tray art pre-scaled to each small-icon size Windows uses (16px at 100%
/// scaling up to 48px at 300%), so the shell never has to shrink it itself.
const TRAY_ICONS: [(i32, &[u8]); 7] = [
    (16, include_bytes!("../icons/tray/16.png")),
    (20, include_bytes!("../icons/tray/20.png")),
    (24, include_bytes!("../icons/tray/24.png")),
    (28, include_bytes!("../icons/tray/28.png")),
    (32, include_bytes!("../icons/tray/32.png")),
    (40, include_bytes!("../icons/tray/40.png")),
    (48, include_bytes!("../icons/tray/48.png")),
];

/// The tray art for the system DPI: the smallest size at least as big as the
/// shell's small icon, or the largest we have.
fn tray_icon() -> tauri::Result<tauri::image::Image<'static>> {
    use windows::Win32::UI::HiDpi::{GetDpiForSystem, GetSystemMetricsForDpi};
    use windows::Win32::UI::WindowsAndMessaging::SM_CXSMICON;

    let want = unsafe { GetSystemMetricsForDpi(SM_CXSMICON, GetDpiForSystem()) };
    let (_, bytes) = TRAY_ICONS
        .iter()
        .find(|(size, _)| *size >= want)
        .unwrap_or(&TRAY_ICONS[TRAY_ICONS.len() - 1]);
    tauri::image::Image::from_bytes(bytes)
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

/// Do what the settings say for clicking the tray icon or launching Vandal
/// (PLAN 3G): a region capture, or the editor (the open one, PLAN 3H.9).
pub fn icon_action(app: &AppHandle, which: impl Fn(&Settings) -> IconAction) {
    let action = which(&app.state::<AppState>().settings.read().unwrap());
    match action {
        IconAction::Capture => session::start_region(app),
        IconAction::Editor => editor::show_or_open(app),
    }
}
