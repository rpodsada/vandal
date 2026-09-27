//! Editor windows (PLAN §4.1, Phase 2A): one `editor-{id}` per open document,
//! created on demand and destroyed on close.
//!
//! Each editor owns its base image in Rust memory. The page fetches it through
//! the custom protocol (`/editor/{id}`), and dropping the entry when the
//! window is destroyed frees it. The document's `crop` is a rect in that
//! image's pixels. For captures the base is the whole monitor (or monitors)
//! under the selection, so the crop can later grow back out (PLAN §4.6).
//!
//! Export (PLAN §4.6): the page renders only the annotation layer and POSTs it
//! as raw RGBA to `/editor/{id}/layer`; [`export`] crops the base, composites
//! the layer over it and copies or saves in Rust.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::json;
use specta::Type;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window,
};
use tauri_plugin_dialog::{
    DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
};
use tauri_plugin_store::StoreExt;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWMAXIMIZED};

use crate::capture::MonitorFrame;
use crate::compose::{self, RgbaImage};
use crate::frames::Capture;
use crate::geometry::{monitor_at, virtual_bounds, MonitorInfo, PhysicalRect};
use crate::state::AppState;
use crate::{output, overlay, protocol, session};

pub type EditorId = u32;

const PREFIX: &str = "editor-";
const STATE_FILE: &str = "window-state.json";
const STATE_KEY: &str = "editor";

/// Space around the image in a new window (logical px): the command, options
/// and status bars plus a margin.
const CHROME: (f64, f64) = (64.0, 200.0);
const MIN_SIZE: (f64, f64) = (800.0, 560.0);
/// A new window never takes more than this share of the work area unless the
/// user sized it bigger last time.
const MAX_SHARE: f64 = 0.9;

pub struct Editor {
    pub image: Arc<RgbaImage>,
    /// In `image` pixels.
    pub crop: PhysicalRect,
    pub maximized: bool,
    /// The last annotation layer the page uploaded: straight-alpha RGBA.
    pub layer: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct Editors {
    next_id: EditorId,
    open: HashMap<EditorId, Editor>,
}

impl Editors {
    pub fn insert(&mut self, editor: Editor) -> EditorId {
        self.next_id = self.next_id.wrapping_add(1).max(1);
        self.open.insert(self.next_id, editor);
        self.next_id
    }

    pub fn image(&self, id: EditorId) -> Option<Arc<RgbaImage>> {
        self.open.get(&id).map(|e| e.image.clone())
    }

    /// Keep an uploaded annotation layer for the next export. `false` if the
    /// editor is gone.
    pub fn set_layer(&mut self, id: EditorId, layer: Vec<u8>) -> bool {
        match self.open.get_mut(&id) {
            Some(e) => {
                e.layer = Some(layer);
                true
            }
            None => false,
        }
    }
}

/// Editor page → Rust on mount: what to show.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EditorInit {
    pub editor_id: EditorId,
    /// Base image size in pixels.
    pub width: u32,
    pub height: u32,
    /// The visible part of the base image.
    pub crop: PhysicalRect,
    /// Raw RGBA bytes of the base image.
    pub url: String,
    /// Where to POST the annotation layer before an export.
    pub layer_url: String,
}

/// What to do with the finished image.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ExportAction {
    Copy,
    /// Save with the file-name template into the save folder.
    Save,
    /// Ask where to save.
    SaveAs,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ExportOutcome {
    Copied,
    Saved {
        path: String,
    },
    /// Save As was dismissed.
    Cancelled,
}

/// The answer to "save before closing?".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CloseChoice {
    Save,
    Discard,
    Cancel,
}

pub fn label(id: EditorId) -> String {
    format!("{PREFIX}{id}")
}

pub fn id_from_label(label: &str) -> Option<EditorId> {
    label.strip_prefix(PREFIX)?.parse().ok()
}

/// Open an editor on part of a capture. The base image is every monitor the
/// selection touches, composed; `rect` is in virtual-desktop pixels.
pub fn open_capture(app: &AppHandle, capture: &Capture, rect: PhysicalRect) {
    let touched: Vec<&MonitorFrame> = capture
        .frames
        .iter()
        .map(|f| f.as_ref())
        .filter(|f| f.monitor.physical_bounds.intersect(&rect).is_some())
        .collect();
    let monitors: Vec<MonitorInfo> = touched.iter().map(|f| f.monitor.clone()).collect();
    let bounds = virtual_bounds(&monitors);
    let (Some(image), Some(crop)) = (compose::compose(&touched, bounds), rect.intersect(&bounds))
    else {
        eprintln!("[editor] nothing to open for {rect:?}");
        return;
    };
    open(app, Arc::new(image), crop.relative_to(bounds.origin()));
}

/// Open an editor on a delivered image (the notification's Edit action).
pub fn open_recent(app: &AppHandle, image_id: u32) {
    let image = app
        .state::<AppState>()
        .recent_images
        .lock()
        .unwrap()
        .get(image_id);
    let Some(image) = image else {
        output::notify_error(
            app,
            "Couldn't open the editor",
            "That screenshot is no longer in memory.",
        );
        return;
    };
    let crop = PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
    open(app, image, crop);
}

fn open(app: &AppHandle, image: Arc<RgbaImage>, crop: PhysicalRect) {
    let remembered = load_window_state(app);
    let state = app.state::<AppState>();
    let id = state.editors.lock().unwrap().insert(Editor {
        image,
        crop,
        maximized: remembered.maximized,
        layer: None,
    });

    let monitors = state.monitors.read().unwrap().clone();
    let Some(monitor) = overlay::cursor_position()
        .and_then(|p| monitor_at(&monitors, p))
        .or_else(|| monitors.iter().find(|m| m.is_primary))
        .or(monitors.first())
        .cloned()
    else {
        return;
    };
    let rect = initial_rect(
        monitor.work_area,
        monitor.scale_factor,
        (crop.width as u32, crop.height as u32),
        remembered.size(),
    );
    let settings = state.settings.read().unwrap().save.clone();
    let title = format!(
        "{} — {}",
        output::render_template(&settings.filename_template, &output::Timestamp::now_local()),
        crate::product_name(app)
    );

    // Creating a webview from the main thread's event handlers can deadlock
    // on Windows, so build it elsewhere.
    let app = app.clone();
    std::thread::spawn(move || {
        let built =
            WebviewWindowBuilder::new(&app, label(id), WebviewUrl::App("editor.html".into()))
                .title(title)
                .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
                .visible(false)
                .build();
        let window = match built {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[editor] window failed: {e}");
                app.state::<AppState>()
                    .editors
                    .lock()
                    .unwrap()
                    .open
                    .remove(&id);
                return;
            }
        };
        // Position first, then size: moving onto a monitor with a different
        // DPI rescales the window (same as the overlays).
        let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
        let _ = window.set_size(PhysicalSize::new(rect.width as u32, rect.height as u32));

        // Fallback in case the page never reports that it has painted.
        std::thread::sleep(Duration::from_secs(3));
        if !window.is_visible().unwrap_or(true) {
            eprintln!(
                "[editor] {} did not report ready; showing anyway",
                label(id)
            );
            reveal(&app, &window);
        }
    });
}

/// Editor page → Rust on mount.
pub fn init(app: &AppHandle, window_label: &str) -> Option<EditorInit> {
    let id = id_from_label(window_label)?;
    let state = app.state::<AppState>();
    let editors = state.editors.lock().unwrap();
    let e = editors.open.get(&id)?;
    Some(EditorInit {
        editor_id: id,
        width: e.image.width,
        height: e.image.height,
        crop: e.crop,
        url: protocol::editor_url(id),
        layer_url: protocol::editor_layer_url(id),
    })
}

/// Crop the base to `crop`, composite the uploaded layer if `with_layer`, and
/// copy or save. Runs dialogs and encoding, so call off the main thread.
pub fn export(
    app: &AppHandle,
    window: &WebviewWindow,
    crop: PhysicalRect,
    with_layer: bool,
    action: ExportAction,
    layer_ms: Option<f64>,
) -> Result<ExportOutcome, String> {
    let started = Instant::now();
    let id = id_from_label(window.label()).ok_or("not an editor window")?;
    let (base, layer) = {
        let state = app.state::<AppState>();
        let mut editors = state.editors.lock().unwrap();
        let e = editors.open.get_mut(&id).ok_or("this editor is closed")?;
        // Take the layer: each upload is used by exactly one export.
        let layer = if with_layer { e.layer.take() } else { None };
        (e.image.clone(), layer)
    };
    let mut image = compose::crop_rgba(&base, crop).ok_or("the crop is empty")?;
    if with_layer {
        let layer = layer.ok_or("the annotation layer didn't arrive")?;
        compose::blend_over(&mut image, &layer)?;
    }
    let composed = started.elapsed();

    let outcome = match action {
        ExportAction::Copy => {
            output::copy_to_clipboard(&image)?;
            ExportOutcome::Copied
        }
        ExportAction::Save => {
            let save = app
                .state::<AppState>()
                .settings
                .read()
                .unwrap()
                .save
                .clone();
            let path = output::save_with_template(&save, &image)?;
            ExportOutcome::Saved {
                path: path.to_string_lossy().into_owned(),
            }
        }
        ExportAction::SaveAs => match ask_save_path(app, window) {
            Some(path) => {
                output::write_png(&image, &path)?;
                ExportOutcome::Saved {
                    path: path.to_string_lossy().into_owned(),
                }
            }
            None => ExportOutcome::Cancelled,
        },
    };
    let layer = layer_ms.map_or(String::new(), |ms| {
        format!(" +layer (render+upload {ms:.1}ms)")
    });
    eprintln!(
        "[perf] editor export {action:?} {}×{}{layer}: compose {:.1}ms, total {:.1}ms",
        image.width,
        image.height,
        composed.as_secs_f64() * 1000.0,
        started.elapsed().as_secs_f64() * 1000.0
    );
    Ok(outcome)
}

/// Save As dialog, modal to the editor, starting in the save folder with the
/// template's name. Always returns a `.png` path.
fn ask_save_path(app: &AppHandle, window: &WebviewWindow) -> Option<std::path::PathBuf> {
    let save = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .save
        .clone();
    let dir = output::resolve_dir(&save.directory);
    let name = format!(
        "{}.png",
        output::render_template(&save.filename_template, &output::Timestamp::now_local())
    );
    let mut dialog = window
        .dialog()
        .file()
        .set_title("Save screenshot as")
        .set_parent(window)
        .set_file_name(&name)
        .add_filter("PNG image", &["png"]);
    if dir.is_dir() {
        dialog = dialog.set_directory(&dir);
    }
    let mut path = dialog.blocking_save_file()?.into_path().ok()?;
    if !path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("png"))
    {
        path.set_extension("png");
    }
    Some(path)
}

/// "Save changes before closing?", modal to the editor.
pub fn confirm_close(window: &WebviewWindow) -> CloseChoice {
    let result = window
        .dialog()
        .message("This screenshot has changes that haven't been copied or saved.")
        .title("Save before closing?")
        .kind(MessageDialogKind::Warning)
        .parent(window)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            "Save".into(),
            "Don't save".into(),
            "Cancel".into(),
        ))
        .blocking_show_with_result();
    match result {
        MessageDialogResult::Yes => CloseChoice::Save,
        MessageDialogResult::No => CloseChoice::Discard,
        MessageDialogResult::Custom(label) if label == "Save" => CloseChoice::Save,
        MessageDialogResult::Custom(label) if label == "Don't save" => CloseChoice::Discard,
        _ => CloseChoice::Cancel,
    }
}

/// Start a region capture from an editor: get the editor out of the way first
/// so it isn't in the shot.
pub fn new_capture(app: &AppHandle, window: &WebviewWindow) {
    let _ = window.minimize();
    let app = app.clone();
    std::thread::spawn(move || {
        // Let the minimize animation finish before grabbing the screen.
        std::thread::sleep(Duration::from_millis(300));
        session::start_region(&app);
    });
}

/// Editor page → Rust: the image is painted, show the window.
pub fn ready(app: &AppHandle, window: &WebviewWindow) {
    if !window.is_visible().unwrap_or(false) {
        reveal(app, window);
    }
}

/// Show (maximized if it was last time) and bring to the front.
fn reveal(app: &AppHandle, window: &WebviewWindow) {
    let maximized = id_from_label(window.label()).is_some_and(|id| {
        let state = app.state::<AppState>();
        let editors = state.editors.lock().unwrap();
        editors.open.get(&id).is_some_and(|e| e.maximized)
    });
    let window = window.clone();
    let _ = app.run_on_main_thread(move || {
        let hwnd = window.hwnd().ok().map(|h| HWND(h.0));
        match (maximized, hwnd) {
            // One step, so it never flashes at its restored size first.
            (true, Some(hwnd)) => unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWMAXIMIZED);
            },
            _ => {
                let _ = window.show();
            }
        }
        if let Some(hwnd) = hwnd {
            overlay::force_foreground(hwnd);
        }
    });
}

/// The window is about to close: remember its size for the next one.
pub fn closing(app: &AppHandle, window: &Window) {
    let Ok(scale) = window.scale_factor() else {
        return;
    };
    let mut state = load_window_state(app);
    state.maximized = window.is_maximized().unwrap_or(false);
    // A maximized window's size isn't the one to restore to.
    if !state.maximized {
        if let Ok(size) = window.inner_size() {
            state.width = Some(f64::from(size.width) / scale);
            state.height = Some(f64::from(size.height) / scale);
        }
    }
    save_window_state(app, &state);
}

/// The window is gone: free its image.
pub fn destroyed(app: &AppHandle, window_label: &str) {
    if let Some(id) = id_from_label(window_label) {
        app.state::<AppState>()
            .editors
            .lock()
            .unwrap()
            .open
            .remove(&id);
    }
}

// ---------- window size ----------

/// Remembered editor window state, in logical px.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
struct WindowState {
    width: Option<f64>,
    height: Option<f64>,
    maximized: bool,
}

impl WindowState {
    fn size(&self) -> Option<(f64, f64)> {
        match (self.width, self.height) {
            (Some(w), Some(h)) if w.is_finite() && h.is_finite() => Some((w, h)),
            _ => None,
        }
    }
}

fn load_window_state(app: &AppHandle) -> WindowState {
    app.store(STATE_FILE)
        .ok()
        .and_then(|s| s.get(STATE_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn save_window_state(app: &AppHandle, state: &WindowState) {
    let Ok(store) = app.store(STATE_FILE) else {
        return;
    };
    store.set(
        STATE_KEY,
        json!({ "width": state.width, "height": state.height, "maximized": state.maximized }),
    );
    if let Err(e) = store.save() {
        eprintln!("[editor] cannot save window state: {e}");
    }
}

/// Where a new editor window goes, in physical px (inner size), centred on
/// `work_area`. Without a remembered size it fits the image at 100% plus
/// chrome, within [`MAX_SHARE`] of the work area; a remembered size is only
/// limited by the work area. Never smaller than [`MIN_SIZE`] unless the work
/// area is.
pub fn initial_rect(
    work_area: PhysicalRect,
    scale: f64,
    image: (u32, u32),
    remembered: Option<(f64, f64)>,
) -> PhysicalRect {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let avail = (
        f64::from(work_area.width) / scale,
        f64::from(work_area.height) / scale,
    );
    let (want, cap) = match remembered {
        Some(size) => (size, avail),
        None => (
            (
                f64::from(image.0) / scale + CHROME.0,
                f64::from(image.1) / scale + CHROME.1,
            ),
            (avail.0 * MAX_SHARE, avail.1 * MAX_SHARE),
        ),
    };
    let w = want.0.min(cap.0).max(MIN_SIZE.0.min(avail.0));
    let h = want.1.min(cap.1).max(MIN_SIZE.1.min(avail.1));
    let (pw, ph) = ((w * scale).round() as i32, (h * scale).round() as i32);
    PhysicalRect::new(
        work_area.x + (work_area.width - pw) / 2,
        work_area.y + (work_area.height - ph) / 2,
        pw,
        ph,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: PhysicalRect = PhysicalRect::new(0, 0, 1920, 1040);

    #[test]
    fn small_image_gets_min_size_centred() {
        let r = initial_rect(WORK, 1.0, (200, 100), None);
        assert_eq!((r.width, r.height), (800, 560));
        assert_eq!((r.x, r.y), (560, 240));
    }

    #[test]
    fn medium_image_fits_at_100_percent_plus_chrome() {
        let r = initial_rect(WORK, 1.0, (1000, 600), None);
        assert_eq!((r.width, r.height), (1064, 800));
    }

    #[test]
    fn large_image_is_capped_to_share_of_work_area() {
        let r = initial_rect(WORK, 1.0, (3840, 2160), None);
        assert_eq!((r.width, r.height), (1728, 936));
    }

    #[test]
    fn scale_converts_image_pixels_to_logical() {
        // 1500×900 physical at 150% is 1000×600 logical.
        let work = PhysicalRect::new(0, 0, 3840, 2080);
        let r = initial_rect(work, 1.5, (1500, 900), None);
        assert_eq!((r.width, r.height), (1596, 1200));
    }

    #[test]
    fn remembered_size_wins_but_stays_on_screen() {
        let r = initial_rect(WORK, 1.0, (200, 100), Some((1200.0, 700.0)));
        assert_eq!((r.width, r.height), (1200, 700));
        let r = initial_rect(WORK, 1.0, (200, 100), Some((5000.0, 5000.0)));
        assert_eq!((r.width, r.height), (1920, 1040));
    }

    #[test]
    fn negative_origin_monitor() {
        let work = PhysicalRect::new(-1920, -200, 1920, 1040);
        let r = initial_rect(work, 1.0, (200, 100), None);
        assert_eq!((r.x, r.y), (-1920 + 560, -200 + 240));
    }

    #[test]
    fn tiny_work_area_wins_over_min_size() {
        let work = PhysicalRect::new(0, 0, 700, 500);
        let r = initial_rect(work, 1.0, (200, 100), None);
        assert_eq!((r.width, r.height), (700, 500));
    }

    #[test]
    fn labels_round_trip() {
        assert_eq!(id_from_label(&label(12)), Some(12));
        assert_eq!(id_from_label("overlay-1"), None);
        assert_eq!(id_from_label("editor-x"), None);
    }
}
