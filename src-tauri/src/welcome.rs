//! The welcome notification (PLAN 3S.0.1): on the very first run, say how to
//! start, since all a new install shows is a tray icon.

use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_winrt_notification::Toast;

use crate::{output, session, settings_window, state::AppState};

/// Dev builds only: show the welcome toast now (at launch, or sent to the
/// running app by a second launch), without deleting the settings.
pub const WELCOME_ARG: &str = "--welcome";

/// Long enough for the toast to fade before the screen is grabbed.
const CAPTURE_DELAY: Duration = Duration::from_millis(300);

pub fn show(app: &AppHandle) {
    let region = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .hotkeys
        .region
        .clone()
        .filter(|h| crate::hotkeys::is_registered(app, h));
    let product = crate::product_name(app);
    let (line1, line2) = body(&product, region.as_deref());
    let app = app.clone();
    let toast = Toast::new(&output::app_id(&app))
        .title(&format!("{product} is running"))
        .text1(&line1)
        .text2(&line2)
        .add_button("Capture now", "capture")
        .add_button("Settings", "settings")
        .on_activated(move |action| {
            match action.as_deref() {
                Some("capture") => {
                    let app = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(CAPTURE_DELAY);
                        let main = app.clone();
                        let _ = app.run_on_main_thread(move || session::start_region(&main));
                    });
                }
                Some("settings") => settings_window::open(&app),
                _ => {}
            }
            Ok(())
        });
    if let Err(e) = toast.show() {
        eprintln!("[welcome] toast failed: {e}");
    }
}

/// The toast's two lines. Without a working region shortcut (unset, or taken
/// by another app), the tray icon is the way in.
fn body(product: &str, region: Option<&str>) -> (String, String) {
    match region {
        Some(key) => (
            format!("Press {key} to capture part of your screen."),
            format!("{product} lives in the tray by the clock."),
        ),
        None => (
            format!("Click the {product} icon in the tray to capture part of your screen."),
            "It's by the clock.".to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_shortcut_when_it_works() {
        let (a, b) = body("Vandal", Some("Win+F12"));
        assert_eq!(a, "Press Win+F12 to capture part of your screen.");
        assert!(b.starts_with("Vandal lives in the tray"));
    }

    #[test]
    fn points_at_the_tray_without_one() {
        let (a, _) = body("Vandal", None);
        assert_eq!(
            a,
            "Click the Vandal icon in the tray to capture part of your screen."
        );
    }
}
