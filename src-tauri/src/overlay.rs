//! Overlay window pool: one pre-created, hidden, borderless window per monitor,
//! sized in physical pixels to the full monitor bounds (PLAN §4.1, §4.4).

use tauri::webview::Color;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::SetFocus;
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetCursorPos, GetForegroundWindow, GetWindowThreadProcessId,
    SetForegroundWindow, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
};

use crate::geometry::{monitor_at, MonitorInfo, PhysicalPoint, PhysicalRect};

const PREFIX: &str = "overlay-";

pub fn label(monitor_index: u32) -> String {
    format!("{PREFIX}{monitor_index}")
}

pub fn is_overlay(label: &str) -> bool {
    label.starts_with(PREFIX)
}

pub fn create_pool(app: &AppHandle, monitors: &[MonitorInfo]) -> tauri::Result<()> {
    for m in monitors {
        create(app, m)?;
    }
    Ok(())
}

fn create(app: &AppHandle, m: &MonitorInfo) -> tauri::Result<()> {
    let window = tauri::WebviewWindowBuilder::new(
        app,
        label(m.index),
        WebviewUrl::App("overlay.html".into()),
    )
    .title("capture-app overlay")
    .decorations(false)
    .resizable(false)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(false)
    .focused(false)
    .background_color(Color(0, 0, 0, 255))
    .build()?;
    place(&window, m.physical_bounds)
}

/// Match the pool to a new monitor layout: re-place existing overlays, create
/// missing ones, destroy extras. Call off the main thread.
pub fn reconcile_pool(app: &AppHandle, monitors: &[MonitorInfo]) -> tauri::Result<()> {
    for m in monitors {
        match app.get_webview_window(&label(m.index)) {
            Some(window) => place(&window, m.physical_bounds)?,
            None => create(app, m)?,
        }
    }
    for (l, window) in app.webview_windows() {
        let index = l.strip_prefix(PREFIX).and_then(|i| i.parse::<u32>().ok());
        if index.is_some_and(|i| i as usize >= monitors.len()) {
            window.destroy()?;
        }
    }
    Ok(())
}

/// Position first, then size: moving onto a monitor with a different DPI makes
/// Windows rescale the window, so the size must be applied afterwards.
fn place(window: &WebviewWindow, r: PhysicalRect) -> tauri::Result<()> {
    window.set_position(PhysicalPosition::new(r.x, r.y))?;
    window.set_size(PhysicalSize::new(r.width as u32, r.height as u32))?;
    ensure_placed(window, r);
    Ok(())
}

/// Verify the window covers exactly `r`; fix it via `SetWindowPos` if not
/// (PLAN §7: tao can misplace windows across mixed-DPI monitors).
fn ensure_placed(window: &WebviewWindow, r: PhysicalRect) {
    let actual = match (window.outer_position(), window.outer_size()) {
        (Ok(p), Ok(s)) => PhysicalRect::new(p.x, p.y, s.width as i32, s.height as i32),
        _ => return,
    };
    if actual == r {
        return;
    }
    eprintln!(
        "[overlay] {} misplaced at {actual:?}, expected {r:?}; correcting",
        window.label()
    );
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = SetWindowPos(
                HWND(hwnd.0),
                None,
                r.x,
                r.y,
                r.width,
                r.height,
                SWP_NOACTIVATE | SWP_NOZORDER,
            );
        }
    }
}

pub fn cursor_position() -> Option<PhysicalPoint> {
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some(PhysicalPoint::new(p.x, p.y))
}

/// Show every overlay, topmost; the one under the cursor last, with focus.
pub fn show_all(app: &AppHandle, monitors: &[MonitorInfo]) {
    let focus_index = cursor_position()
        .and_then(|p| monitor_at(monitors, p))
        .map_or(0, |m| m.index);
    let mut ordered: Vec<&MonitorInfo> = monitors.iter().collect();
    ordered.sort_by_key(|m| m.index == focus_index);

    for m in ordered {
        let Some(window) = app.get_webview_window(&label(m.index)) else {
            continue;
        };
        ensure_placed(&window, m.physical_bounds);
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        if m.index == focus_index {
            if let Ok(hwnd) = window.hwnd() {
                force_foreground(HWND(hwnd.0));
            }
        }
    }
}

/// Make `hwnd` the foreground window so the overlay gets keyboard input.
///
/// By the time overlays are shown we may have lost the foreground rights the
/// hotkey granted (and we're not on the thread that received it), so a plain
/// `SetForegroundWindow` can be refused. Fall back to briefly attaching to the
/// current foreground thread's input queue, which lifts the restriction.
fn force_foreground(hwnd: HWND) {
    unsafe {
        if SetForegroundWindow(hwnd).as_bool() {
            return;
        }
        let fg_thread = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let me = GetCurrentThreadId();
        let attached =
            fg_thread != 0 && fg_thread != me && AttachThreadInput(me, fg_thread, true).as_bool();
        let _ = BringWindowToTop(hwnd);
        let ok = SetForegroundWindow(hwnd).as_bool();
        let _ = SetFocus(Some(hwnd));
        if attached {
            let _ = AttachThreadInput(me, fg_thread, false);
        }
        if !ok {
            eprintln!(
                "[overlay] could not take foreground; keyboard input will not reach the overlay"
            );
        }
    }
}

pub fn hide_all(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if is_overlay(&label) {
            let _ = window.hide();
        }
    }
}

/// Rebuild the pool when monitors are plugged/unplugged or rescaled, so the
/// next capture is instant. (Captures also detect changes themselves.)
pub fn watch_displays(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let state = app.state::<crate::state::AppState>();
        if state.session.lock().unwrap().is_some() {
            continue;
        }
        let Ok(current) = crate::monitors::enumerate() else {
            continue;
        };
        if *state.monitors.read().unwrap() == current {
            continue;
        }
        eprintln!("[overlay] display layout changed; rebuilding pool");
        *state.monitors.write().unwrap() = current.clone();
        if let Err(e) = reconcile_pool(&app, &current) {
            eprintln!("[overlay] rebuild failed: {e}");
        }
    });
}
