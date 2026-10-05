//! Editor windows (PLAN §4.1, Phase 2A): one `editor-{id}` per open document,
//! created on demand and destroyed on close.
//!
//! Each editor owns its base image in Rust memory. The page fetches it through
//! the custom protocol (`/editor/{id}`), and dropping the entry when the
//! window is destroyed frees it. The document's `crop` is a rect in that
//! image's pixels. For captures the base is the whole monitor (or monitors)
//! under the selection, so the crop can later grow back out (PLAN §4.6).
//!
//! Export (PLAN §4.6): the page renders only the annotations and POSTs them as
//! raw RGBA: highlighter strokes to `/editor/{id}/highlights` and everything
//! else to `/editor/{id}/layer`. [`export`] crops the base, multiplies the
//! highlights into it, composites the layer over that, and copies or saves in
//! Rust.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
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
use windows::Win32::UI::WindowsAndMessaging::{IsIconic, IsZoomed, ShowWindow, SW_SHOWMAXIMIZED};

use crate::capture::MonitorFrame;
use crate::compose::{self, RgbaImage};
use crate::encode::{self, FileFormat};
use crate::folder::{self, FolderPosition, FolderStep};
use crate::frames::Capture;
use crate::geometry::{monitor_at, virtual_bounds, MonitorInfo, PhysicalPoint, PhysicalRect};
use crate::redact::{self, Redaction};
use crate::state::AppState;
use crate::{decode, output, overlay, protocol, session, settings};

pub type EditorId = u32;

const PREFIX: &str = "editor-";
const STATE_FILE: &str = "window-state.json";
const STATE_KEY: &str = "editor";
/// The folder files were last picked from in Open.
const OPEN_FOLDER_KEY: &str = "openFolder";
/// The folder the last Save As saved to.
const SAVE_FOLDER_KEY: &str = "saveFolder";

/// Space around the image in a new window (logical px): the command, options
/// and status bars plus a margin.
const CHROME: (f64, f64) = (64.0, 200.0);
const MIN_SIZE: (f64, f64) = (800.0, 560.0);
/// A new window never takes more than this share of the work area unless the
/// user sized it bigger last time.
const MAX_SHARE: f64 = 0.9;
/// How far a new window steps from one already in its place (logical px).
const CASCADE: f64 = 30.0;

pub struct Editor {
    /// None: an empty editor (PLAN 3G), waiting for an image to load into it.
    pub image: Option<Arc<RgbaImage>>,
    /// In `image` pixels.
    pub crop: PhysicalRect,
    pub maximized: bool,
    /// Where the window is when not maximized or minimized, kept up to date as
    /// it moves, so closing it maximized still remembers where it was.
    pub normal: Option<Placement>,
    /// The last annotation layer the page uploaded: straight-alpha RGBA.
    pub layer: Option<Vec<u8>>,
    /// The last highlight layer (multiplied into the image): straight-alpha RGBA.
    pub highlights: Option<Vec<u8>>,
    /// Annotations handed over from quick edit, for the page to load.
    pub markup: Option<HandoffMarkup>,
    /// The image file this editor works on (PLAN 2D); None for captures.
    pub file: Option<PathBuf>,
    /// The file's bytes, if the page can decode them itself (PLAN 3Q).
    pub source: Option<Source>,
    /// Saving over `file` was confirmed (or it was just chosen in Save As).
    pub overwrite_confirmed: bool,
    /// Reopened from a notification: the document was already delivered.
    pub delivered: bool,
}

/// An image file's bytes as read when it was decoded, served to the editor
/// page (`/editor/{id}/source`) for formats its browser engine decodes: about
/// 1 MB instead of 48 MB of raw pixels for a 12 MP photo (PLAN 3Q). Kept, not
/// re-read, so the page always gets the image Rust decoded, even after a Save
/// has flattened markup into the file on disk.
#[derive(Clone)]
pub struct Source {
    pub bytes: Arc<Vec<u8>>,
    pub mime: &'static str,
    /// The EXIF orientation Rust turned the image upright from: the page
    /// decodes the file unrotated and turns it the same way.
    pub orientation: u16,
}

/// An image file opened in an editor: its path, and its [`Source`] if the
/// page can decode it.
#[derive(Clone)]
pub struct OpenedFile {
    pub path: PathBuf,
    pub source: Option<Source>,
}

/// Decode an image file for an editor, keeping its bytes for the page when it
/// can decode them itself. Errors are sentences for the user. Blocking.
fn read_image_file(path: &Path) -> Result<(RgbaImage, OpenedFile), String> {
    let (image, orientation) = decode::decode_file_oriented(path)?;
    let source = decode::browser_mime(path).and_then(|mime| {
        let bytes = std::fs::read(path).ok()?;
        Some(Source {
            bytes: Arc::new(bytes),
            mime,
            orientation,
        })
    });
    let file = OpenedFile {
        path: path.to_path_buf(),
        source,
    };
    Ok((image, file))
}

/// How [`load_into`] treats an editor that already has a document.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Load {
    /// Only into an empty editor (PLAN 3G).
    IfEmpty,
    /// In place of its document; the page reloads (its on-close actions or
    /// "save first?" have already run).
    Replace,
    /// In place of its document, with no reload: the page asked for it and
    /// fetches the new one itself (flipping through a folder, PLAN 3Q).
    Swap,
}

/// Quick edit's annotations, handed to the editor still editable (PLAN 2B.3).
/// The page's own JSON: Rust only carries it and says how to shift it.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HandoffMarkup {
    /// A JSON array of annotations, in virtual-desktop physical px.
    pub annotations: String,
    /// Add to the annotations' coordinates to get base-image pixels.
    pub dx: i32,
    pub dy: i32,
}

/// Which uploaded layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayerKind {
    /// Everything but highlights, composited on top.
    Annotations,
    /// Highlighter strokes, multiplied into the image underneath the rest.
    Highlights,
}

#[derive(Default)]
pub struct Editors {
    next_id: EditorId,
    open: HashMap<EditorId, Editor>,
    /// The editor that last had focus, for the tray click (PLAN 3H.9).
    last_focused: Option<EditorId>,
    /// Editors whose document has changes not copied or saved (the page says).
    unsaved: HashSet<EditorId>,
}

impl Editors {
    pub fn insert(&mut self, editor: Editor) -> EditorId {
        self.next_id = self.next_id.wrapping_add(1).max(1);
        self.open.insert(self.next_id, editor);
        self.next_id
    }

    /// The editor to bring back: the one last focused, else the newest.
    fn latest(&self) -> Option<EditorId> {
        self.last_focused
            .filter(|id| self.open.contains_key(id))
            .or_else(|| self.open.keys().max().copied())
    }

    pub fn set_unsaved(&mut self, id: EditorId, unsaved: bool) {
        if unsaved && self.open.contains_key(&id) {
            self.unsaved.insert(id);
        } else {
            self.unsaved.remove(&id);
        }
    }

    /// Whether any editor would ask "save first?" before closing (PLAN 3P.4).
    pub fn any_unsaved(&self) -> bool {
        !self.unsaved.is_empty()
    }

    /// The editor's image file bytes, for the page to decode (PLAN 3Q).
    pub fn source(&self, id: EditorId) -> Option<Source> {
        self.open.get(&id).and_then(|e| e.source.clone())
    }

    pub fn image(&self, id: EditorId) -> Option<Arc<RgbaImage>> {
        self.open.get(&id).and_then(|e| e.image.clone())
    }

    /// Keep an uploaded layer for the next export. `false` if the editor is
    /// gone.
    pub fn set_layer(&mut self, id: EditorId, kind: LayerKind, layer: Vec<u8>) -> bool {
        match self.open.get_mut(&id) {
            Some(e) => {
                match kind {
                    LayerKind::Annotations => e.layer = Some(layer),
                    LayerKind::Highlights => e.highlights = Some(layer),
                }
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
    /// The image file itself, when the page can decode it: much faster to
    /// fetch than `url` (PLAN 3Q). The page falls back to `url` if its decode
    /// doesn't come out `width` × `height`.
    pub source_url: Option<String>,
    /// The EXIF orientation (1–8) to turn `source_url`'s image upright with,
    /// as Rust did (`decode::orient`).
    pub source_orientation: u16,
    /// Where to POST the annotation layer before an export.
    pub layer_url: String,
    /// Where to POST the highlight layer before an export.
    pub highlights_url: String,
    /// Annotations from quick edit, if it handed the capture over.
    pub markup: Option<HandoffMarkup>,
    /// The name of the image file being edited; None for captures. Files
    /// ask before closing with unsaved changes instead of running the
    /// capture on-close actions.
    pub file: Option<String>,
    /// Reopened from a notification (PLAN 3D.1): the document as loaded was
    /// already delivered, so it counts as copied and saved.
    pub delivered: bool,
    /// No image yet (PLAN 3G): the page shows how to get one.
    pub empty: bool,
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

/// Why an editor's document is about to go, for the "save first?" question.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LeaveReason {
    Close,
    /// Another image opens in its place (PLAN 3H.6).
    Open,
    /// A capture started from it will take its place (PLAN 3H.7).
    Capture,
    /// An update is about to install (PLAN 3P).
    Update,
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
/// selection touches, composed; `rect` is in virtual-desktop pixels, and so
/// are the coordinates in `annotations` (quick edit's JSON, if any).
pub fn open_capture(
    app: &AppHandle,
    capture: &Capture,
    rect: PhysicalRect,
    annotations: Option<String>,
) {
    open_frames(app, &capture.frames, rect, annotations, false, None);
}

/// [`open_capture`] for a capture started from the editor `into` (PLAN 3G): it
/// loads there, in place of any image it had (PLAN 3H.7: the page dealt with
/// that before the capture started). A new window only if `into` is gone.
pub fn open_capture_into(app: &AppHandle, capture: &Capture, rect: PhysicalRect, into: EditorId) {
    open_frames(app, &capture.frames, rect, None, false, Some(into));
}

/// [`open_capture`] on some of a capture's frames. `delivered`: the document
/// was already delivered (a notification's Edit).
fn open_frames(
    app: &AppHandle,
    frames: &[Arc<MonitorFrame>],
    rect: PhysicalRect,
    annotations: Option<String>,
    delivered: bool,
    into: Option<EditorId>,
) {
    let touched = output::touched_frames(frames, rect);
    let touched: Vec<&MonitorFrame> = touched.iter().map(|f| f.as_ref()).collect();
    let monitors: Vec<MonitorInfo> = touched.iter().map(|f| f.monitor.clone()).collect();
    let bounds = virtual_bounds(&monitors);
    let (Some(image), Some(crop)) = (compose::compose(&touched, bounds), rect.intersect(&bounds))
    else {
        eprintln!("[editor] nothing to open for {rect:?}");
        return;
    };
    let markup = annotations.map(|annotations| HandoffMarkup {
        annotations,
        dx: -bounds.x,
        dy: -bounds.y,
    });
    let title = capture_title(app);
    let image = Arc::new(image);
    if let Some(id) = into {
        let loaded = load_into(
            app,
            id,
            image.clone(),
            crop.relative_to(bounds.origin()),
            &title,
            None,
            Load::Replace,
        );
        bring_back(app, id);
        if loaded {
            return;
        }
    }
    open(
        app,
        Some(image),
        crop.relative_to(bounds.origin()),
        markup,
        title,
        None,
        delivered,
    );
}

/// Open an editor on an image file (PLAN 2D). Decodes on a worker thread; a
/// file that can't be opened gets an error notification.
pub fn open_file(app: &AppHandle, path: &Path) {
    open_file_in(app, path, None);
}

/// [`open_file`], into the editor `into` if it's empty (PLAN 3G).
pub fn open_file_in(app: &AppHandle, path: &Path, into: Option<EditorId>) {
    let app = app.clone();
    let path = path.to_path_buf();
    std::thread::spawn(move || match read_image_file(&path) {
        Ok((image, file)) => {
            let crop = PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
            let title = file_title(&app, &path);
            open_or_load(&app, into, Arc::new(image), crop, title, Some(file));
        }
        Err(message) => output::notify_error(&app, "Couldn't open the image", &message),
    });
}

/// A capture from the browser extension (PLAN 3N.7): the native host wrote it
/// to a temp file, with the page title beside it. It opens like a new
/// capture, unsaved and titled with the page, not as that file (Save would
/// write back into the temp folder), and the temp files go once it's decoded.
pub fn open_browser_capture(app: &AppHandle, path: &Path) {
    let app = app.clone();
    let path = path.to_path_buf();
    std::thread::spawn(move || {
        let page_title = crate::native_host::take_title(&path);
        let decoded = decode::decode_file(&path);
        if let Err(e) = std::fs::remove_file(&path) {
            eprintln!("[editor] couldn't delete {}: {e}", path.display());
        }
        match decoded {
            Ok(image) => {
                let crop = PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
                let title = match page_title {
                    Some(page) if !page.is_empty() => {
                        format!("{page} — {}", crate::product_name(&app))
                    }
                    _ => capture_title(&app),
                };
                open_or_load(&app, None, Arc::new(image), crop, title, None);
            }
            Err(message) => output::notify_error(&app, "Couldn't open the capture", &message),
        }
    });
}

/// The tray click or launching Vandal, set to open the editor: bring back the
/// editor last used, and open an empty one only if there's none (PLAN 3H.9:
/// a click per window piled up empty editors).
pub fn show_or_open(app: &AppHandle) {
    let latest = app.state::<AppState>().editors.lock().unwrap().latest();
    match latest {
        Some(id) if app.get_webview_window(&label(id)).is_some() => bring_back(app, id),
        _ => open_empty(app),
    }
}

/// An editor window got focus: it's the one the tray brings back.
pub fn focused(app: &AppHandle, window_label: &str) {
    if let Some(id) = id_from_label(window_label) {
        app.state::<AppState>().editors.lock().unwrap().last_focused = Some(id);
    }
}

/// An editor with no image (PLAN 3G): the tray's "New editor window".
pub fn open_empty(app: &AppHandle) {
    let title = crate::product_name(app).to_string();
    open(
        app,
        None,
        PhysicalRect::new(0, 0, 0, 0),
        None,
        title,
        None,
        false,
    );
}

/// The editor `window_label` if it has no image yet: documents opened from
/// it load into it instead of a new window (PLAN 3G).
pub fn empty_editor(app: &AppHandle, window_label: &str) -> Option<EditorId> {
    let id = id_from_label(window_label)?;
    let state = app.state::<AppState>();
    let editors = state.editors.lock().unwrap();
    editors
        .open
        .get(&id)
        .filter(|e| e.image.is_none())
        .map(|_| id)
}

/// Open an image with no markup: into `into` if it's still empty, else in a
/// new window.
fn open_or_load(
    app: &AppHandle,
    into: Option<EditorId>,
    image: Arc<RgbaImage>,
    crop: PhysicalRect,
    title: String,
    file: Option<OpenedFile>,
) {
    if let Some(id) = into {
        if load_into(
            app,
            id,
            image.clone(),
            crop,
            &title,
            file.clone(),
            Load::IfEmpty,
        ) {
            return;
        }
    }
    open(app, Some(image), crop, None, title, file, false);
}

/// Put a document into an empty editor (PLAN 3G), or with `replace` in place
/// of the one it has (PLAN 3H.6: its page has already run its on-close
/// actions or asked). Its page reloads and shows it. False if the editor is
/// gone, or already has an image and `replace` is off.
fn load_into(
    app: &AppHandle,
    id: EditorId,
    image: Arc<RgbaImage>,
    crop: PhysicalRect,
    title: &str,
    file: Option<OpenedFile>,
    mode: Load,
) -> bool {
    let Some(window) = app.get_webview_window(&label(id)) else {
        return false;
    };
    {
        let state = app.state::<AppState>();
        let mut editors = state.editors.lock().unwrap();
        let Some(e) = editors
            .open
            .get_mut(&id)
            .filter(|e| mode != Load::IfEmpty || e.image.is_none())
        else {
            return false;
        };
        let (file, source) = file.map_or((None, None), |f| (Some(f.path), f.source));
        *e = Editor {
            image: Some(image),
            crop,
            maximized: e.maximized,
            normal: e.normal,
            layer: None,
            highlights: None,
            markup: None,
            file,
            source,
            overwrite_confirmed: false,
            delivered: false,
        };
    }
    let _ = window.set_title(title);
    if mode != Load::Swap {
        if let Err(e) = window.eval("location.reload()") {
            eprintln!("[editor] couldn't reload {}: {e}", label(id));
        }
    }
    true
}

/// Ask for image files, modal to `parent` if given, starting where
/// [`open_start`] says. Blocks: call off the main thread.
pub fn pick_images(app: &AppHandle, parent: Option<&WebviewWindow>) -> Vec<PathBuf> {
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Open image")
        .add_filter("Images", decode::EXTENSIONS)
        .add_filter("All files", &["*"]);
    if let Some(start) = open_start(app) {
        dialog = dialog.set_directory(start);
    }
    if let Some(parent) = parent {
        dialog = dialog.set_parent(parent);
    }
    let files: Vec<PathBuf> = dialog
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|path| {
            path.into_path()
                .map_err(|e| eprintln!("[editor] can't open a picked file: {e}"))
                .ok()
        })
        .collect();
    if let Some(folder) = files.first().and_then(|f| f.parent()) {
        remember_folder(app, OPEN_FOLDER_KEY, folder);
    }
    files
}

/// Where Open starts (Settings › Copying & Saving): the last folder opened
/// from or the save folder, else the Desktop.
fn open_start(app: &AppHandle) -> Option<PathBuf> {
    let save = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .save
        .clone();
    match save.open_starts_in {
        settings::OpenStartsIn::LastOpened => remembered_folder(app, OPEN_FOLDER_KEY),
        settings::OpenStartsIn::SaveFolder => existing_dir(output::resolve_dir(&save.directory)),
    }
    .or_else(|| app.path().desktop_dir().ok())
}

/// Where Save As starts for the opened image `file`, or a capture
/// (Settings › Copying & Saving). If that folder isn't there: the image's
/// own folder, else the save folder.
fn save_as_start(app: &AppHandle, file: Option<&Path>) -> Option<PathBuf> {
    let save = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .save
        .clone();
    let save_dir = || existing_dir(output::resolve_dir(&save.directory));
    let file_dir = || {
        file.and_then(Path::parent)
            .and_then(|d| existing_dir(d.into()))
    };
    match save.save_as_starts_in {
        settings::SaveAsStartsIn::LastSaved => remembered_folder(app, SAVE_FOLDER_KEY),
        settings::SaveAsStartsIn::ImageFolder if file.is_some() => file_dir(),
        settings::SaveAsStartsIn::ImageFolder => remembered_folder(app, OPEN_FOLDER_KEY),
        settings::SaveAsStartsIn::SaveFolder => save_dir(),
    }
    .or_else(file_dir)
    .or_else(save_dir)
}

fn existing_dir(dir: PathBuf) -> Option<PathBuf> {
    dir.is_dir().then_some(dir)
}

/// A folder a dialog remembered under `key`, if it's still there.
fn remembered_folder(app: &AppHandle, key: &str) -> Option<PathBuf> {
    app.store(STATE_FILE)
        .ok()?
        .get(key)?
        .as_str()
        .map(PathBuf::from)
        .filter(|d| d.is_dir())
}

/// Remember `folder` under `key` for the next dialog.
fn remember_folder(app: &AppHandle, key: &str, folder: &Path) {
    let Ok(store) = app.store(STATE_FILE) else {
        return;
    };
    let folder = json!(folder.display().to_string());
    if store.get(key).as_ref() == Some(&folder) {
        return;
    }
    store.set(key, folder);
    if let Err(e) = store.save() {
        eprintln!("[editor] cannot save {key}: {e}");
    }
}

/// The tray's "Open image…": each picked file in its own editor.
pub fn ask_open(app: &AppHandle) {
    for path in pick_images(app, None) {
        open_file(app, &path);
    }
}

/// The editor `id`'s Open (PLAN 3H.6): the first file takes the place of its
/// image (the page has run its on-close actions or asked first), the rest
/// open in new windows.
pub fn open_files_here(app: &AppHandle, id: EditorId, paths: Vec<PathBuf>) {
    let mut paths = paths.into_iter();
    let Some(first) = paths.next() else {
        return;
    };
    let handle = app.clone();
    std::thread::spawn(move || match read_image_file(&first) {
        Ok((image, file)) => {
            let crop = PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
            let title = file_title(&handle, &first);
            let image = Arc::new(image);
            let file = Some(file);
            if !load_into(
                &handle,
                id,
                image.clone(),
                crop,
                &title,
                file.clone(),
                Load::Replace,
            ) {
                open(&handle, Some(image), crop, None, title, file, false);
            }
        }
        Err(message) => output::notify_error(&handle, "Couldn't open the image", &message),
    });
    for path in paths {
        open_file(app, &path);
    }
}

/// The clipboard's image in a new editor ("New from clipboard"), or in the
/// empty editor `into` (Ctrl+V there, PLAN 3G).
pub fn open_clipboard(app: &AppHandle, into: Option<EditorId>) {
    match output::paste_image() {
        Ok(image) => {
            let crop = PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
            let title = format!("Clipboard image — {}", crate::product_name(app));
            open_or_load(app, into, Arc::new(image), crop, title, None);
        }
        Err(message) => output::notify_error(app, "Nothing to open", &message),
    }
}

fn file_name(path: &Path) -> String {
    path.file_name().map_or_else(
        || path.display().to_string(),
        |n| n.to_string_lossy().into_owned(),
    )
}

/// A file's window title: its name.
/// The image file an editor works on; None for captures and pasted images.
fn file_of(app: &AppHandle, id: EditorId) -> Option<PathBuf> {
    let state = app.state::<AppState>();
    let editors = state.editors.lock().unwrap();
    editors.open.get(&id).and_then(|e| e.file.clone())
}

/// Where the editor's file is among its folder's images (PLAN 3Q).
pub fn folder_position(app: &AppHandle, id: EditorId) -> Option<FolderPosition> {
    folder::position(&file_of(app, id)?)
}

/// Open the folder's previous/next/first/last image in this editor (PLAN 3Q),
/// `by` images along for previous/next (presses that piled up while one was
/// loading), skipping any that won't open. The page has already asked about
/// unsaved changes, and loads the new image itself (no reload). Ok(None):
/// nowhere to go. Blocking: decodes.
pub fn flip(
    app: &AppHandle,
    id: EditorId,
    step: FolderStep,
    by: u32,
) -> Result<Option<FolderPosition>, String> {
    let Some(file) = file_of(app, id) else {
        return Ok(None);
    };
    let candidates = folder::step_from(&file, step, by as usize);
    if candidates.is_empty() {
        return Ok(None);
    }
    for path in candidates {
        match read_image_file(&path) {
            Ok((image, opened)) => {
                let crop = PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
                let title = file_title(app, &path);
                load_into(
                    app,
                    id,
                    Arc::new(image),
                    crop,
                    &title,
                    Some(opened),
                    Load::Swap,
                );
                return Ok(folder::position(&path));
            }
            Err(e) => eprintln!("[folder] skipped {}: {e}", path.display()),
        }
    }
    Err("None of the other images in this folder could be opened.".into())
}

fn file_title(app: &AppHandle, path: &Path) -> String {
    format!("{} — {}", file_name(path), crate::product_name(app))
}

/// A capture's window title: the name it would be saved under.
fn capture_title(app: &AppHandle) -> String {
    let save = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .save
        .clone();
    format!(
        "{} — {}",
        output::file_stem(
            &output::resolve_dir(&save.directory),
            &save.filename_template
        ),
        crate::product_name(app)
    )
}

/// Open an editor on a delivered capture (the notification's Edit action),
/// just as "Open in editor" would have: its monitors, its crop and quick
/// edit's annotations, still editable (PLAN 3D.1).
pub fn open_recent(app: &AppHandle, image_id: u32) {
    let recent = app
        .state::<AppState>()
        .recent_images
        .lock()
        .unwrap()
        .get(image_id);
    let Some(recent) = recent else {
        output::notify_error(
            app,
            "Couldn't open the editor",
            "That screenshot is no longer in memory.",
        );
        return;
    };
    let doc = recent.doc;
    open_frames(app, &doc.frames, doc.rect, doc.annotations, true, None);
}

fn open(
    app: &AppHandle,
    image: Option<Arc<RgbaImage>>,
    crop: PhysicalRect,
    markup: Option<HandoffMarkup>,
    title: String,
    file: Option<OpenedFile>,
    delivered: bool,
) {
    let remembered = load_window_state(app);
    let state = app.state::<AppState>();
    let (file, source) = file.map_or((None, None), |f| (Some(f.path), f.source));
    let id = state.editors.lock().unwrap().insert(Editor {
        image,
        crop,
        maximized: remembered.maximized,
        normal: None,
        layer: None,
        highlights: None,
        markup,
        file,
        source,
        overwrite_confirmed: false,
        delivered,
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
    // Where the last one was left, else centred on the cursor's monitor; a
    // step down and right of any editor already there.
    let (rect, scale) = remembered
        .placement()
        .and_then(|p| remembered_rect(&monitors, p))
        .unwrap_or_else(|| {
            let rect = initial_rect(
                monitor.work_area,
                monitor.scale_factor,
                (crop.width as u32, crop.height as u32),
                remembered.size(),
            );
            (rect, monitor.scale_factor)
        });
    let taken: Vec<PhysicalPoint> = app
        .webview_windows()
        .into_iter()
        .filter(|(l, _)| *l != label(id) && id_from_label(l).is_some())
        .filter_map(|(_, w)| w.outer_position().ok())
        .map(|p| PhysicalPoint::new(p.x, p.y))
        .collect();
    let rect = cascade(rect, scale, &taken);

    // Creating a webview from the main thread's event handlers can deadlock
    // on Windows, so build it elsewhere.
    let app = app.clone();
    std::thread::spawn(move || {
        let built = crate::appearance::themed(
            &app,
            WebviewWindowBuilder::new(&app, label(id), WebviewUrl::App("editor.html".into())),
        )
        .title(title)
        .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
        .visible(false)
        .build();
        let window = match built {
            Ok(w) => {
                crate::browser_keys::disable(&w);
                w
            }
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
        width: e.image.as_ref().map_or(0, |i| i.width),
        height: e.image.as_ref().map_or(0, |i| i.height),
        crop: e.crop,
        url: protocol::editor_url(id),
        source_url: e.source.as_ref().map(|_| protocol::editor_source_url(id)),
        source_orientation: e.source.as_ref().map_or(1, |s| s.orientation),
        layer_url: protocol::editor_layer_url(id, LayerKind::Annotations),
        highlights_url: protocol::editor_layer_url(id, LayerKind::Highlights),
        markup: e.markup.clone(),
        file: e.file.as_deref().map(file_name),
        delivered: e.delivered,
        empty: e.image.is_none(),
    })
}

/// What goes onto the cropped base in an export, bottom to top.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportMarkup {
    /// Pixelated or blurred areas, in base-image px (PLAN 3D.3).
    pub redactions: Vec<Redaction>,
    /// Multiply in the highlight layer POSTed to `highlightsUrl` just before.
    pub with_highlights: bool,
    /// Composite the annotation layer POSTed to `layerUrl` just before.
    pub with_layer: bool,
}

/// Crop the base to `crop`, apply `markup`, and copy or save. Runs dialogs and
/// encoding, so call off the main thread.
pub fn export(
    app: &AppHandle,
    window: &WebviewWindow,
    crop: PhysicalRect,
    markup: ExportMarkup,
    action: ExportAction,
    layer_ms: Option<f64>,
) -> Result<ExportOutcome, String> {
    let started = Instant::now();
    let ExportMarkup {
        redactions,
        with_highlights,
        with_layer,
    } = markup;
    let id = id_from_label(window.label()).ok_or("not an editor window")?;
    let (base, layer, highlights, file) = {
        let state = app.state::<AppState>();
        let mut editors = state.editors.lock().unwrap();
        let e = editors.open.get_mut(&id).ok_or("this editor is closed")?;
        // Take the layers: each upload is used by exactly one export.
        let layer = if with_layer { e.layer.take() } else { None };
        let highlights = if with_highlights {
            e.highlights.take()
        } else {
            None
        };
        let image = e.image.clone().ok_or("there's no image to copy or save")?;
        (image, layer, highlights, e.file.clone())
    };
    let mut image = compose::crop_rgba(&base, crop).ok_or("the crop is empty")?;
    redact::apply(&base, crop, &mut image, &redactions);
    if with_highlights {
        let highlights = highlights.ok_or("the highlights didn't arrive")?;
        compose::blend_multiply(&mut image, &highlights)?;
    }
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
        ExportAction::Save => match &file {
            Some(file) => save_over(app, window, id, &image, file)?,
            None => {
                let save = app
                    .state::<AppState>()
                    .settings
                    .read()
                    .unwrap()
                    .save
                    .clone();
                let path = output::save_with_template(&save, &image)?;
                saved(&path)
            }
        },
        ExportAction::SaveAs => match &file {
            Some(file) => save_file_as(app, window, id, &image, file)?,
            None => match ask_save_path(app, window) {
                Some(path) => {
                    output::write_png(&image, &path)?;
                    saved(&path)
                }
                None => ExportOutcome::Cancelled,
            },
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

fn saved(path: &Path) -> ExportOutcome {
    ExportOutcome::Saved {
        path: path.to_string_lossy().into_owned(),
    }
}

/// Save over the editor's file (PLAN 2D), in its own format, after a warning
/// the first time in this window (unless turned off). A format we can't
/// write goes to Save As instead.
fn save_over(
    app: &AppHandle,
    window: &WebviewWindow,
    id: EditorId,
    image: &RgbaImage,
    file: &Path,
) -> Result<ExportOutcome, String> {
    let Some(format) = FileFormat::for_path(file) else {
        return save_file_as(app, window, id, image, file);
    };
    if !confirm_overwrite(app, window, id, file) {
        return Ok(ExportOutcome::Cancelled);
    }
    encode::write_file(image, file, format)?;
    Ok(saved(file))
}

/// Save As for a file: a new file, in the format its extension names. The
/// editor then works on that file.
fn save_file_as(
    app: &AppHandle,
    window: &WebviewWindow,
    id: EditorId,
    image: &RgbaImage,
    file: &Path,
) -> Result<ExportOutcome, String> {
    let Some(path) = ask_file_save_path(window, file) else {
        return Ok(ExportOutcome::Cancelled);
    };
    let format = FileFormat::for_path(&path).unwrap_or(FileFormat::Png);
    encode::write_file(image, &path, format)?;
    if let Some(e) = app
        .state::<AppState>()
        .editors
        .lock()
        .unwrap()
        .open
        .get_mut(&id)
    {
        e.file = Some(path.clone());
        // The dialog already asked about replacing an existing file.
        e.overwrite_confirmed = true;
    }
    let _ = window.set_title(&file_title(app, &path));
    Ok(saved(&path))
}

/// "Save over the original?" once per window, unless turned off in Settings
/// (which the dialog's second button does).
fn confirm_overwrite(app: &AppHandle, window: &WebviewWindow, id: EditorId, file: &Path) -> bool {
    let state = app.state::<AppState>();
    let confirmed = state
        .editors
        .lock()
        .unwrap()
        .open
        .get(&id)
        .is_some_and(|e| e.overwrite_confirmed);
    if confirmed || !state.settings.read().unwrap().editor.confirm_overwrite {
        return true;
    }
    const SAVE: &str = "Save";
    const ALWAYS: &str = "Save, don't ask again";
    let result = window
        .dialog()
        .message(format!(
            "Saving replaces {} with the edited image. The markup becomes part of the picture for good.",
            file_name(file)
        ))
        .title("Save over the original?")
        .kind(MessageDialogKind::Warning)
        .parent(window)
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            SAVE.into(),
            ALWAYS.into(),
            "Cancel".into(),
        ))
        .blocking_show_with_result();
    let always = match result {
        MessageDialogResult::Yes => false,
        MessageDialogResult::No => true,
        MessageDialogResult::Custom(label) if label == SAVE => false,
        MessageDialogResult::Custom(label) if label == ALWAYS => true,
        _ => return false,
    };
    if always {
        if let Err(e) = settings::modify(app, |s| s.editor.confirm_overwrite = false) {
            eprintln!("[editor] couldn't turn off the overwrite warning: {e}");
        }
    }
    if let Some(e) = state.editors.lock().unwrap().open.get_mut(&id) {
        e.overwrite_confirmed = true;
    }
    true
}

/// Save As for a file, modal to the editor: its name, starting where
/// [`save_as_start`] says, its format first (PNG for formats we can't write),
/// and the others we can. The returned path always has an extension we can
/// write.
fn ask_file_save_path(window: &WebviewWindow, file: &Path) -> Option<PathBuf> {
    let original = FileFormat::for_path(file);
    let first = original.unwrap_or(FileFormat::Png);
    let name = match original {
        Some(_) => file_name(file),
        None => format!(
            "{}.png",
            file.file_stem().unwrap_or_default().to_string_lossy()
        ),
    };
    let mut dialog = window
        .dialog()
        .file()
        .set_title("Save image as")
        .set_parent(window)
        .set_file_name(&name);
    if let Some(dir) = save_as_start(window.app_handle(), Some(file)) {
        dialog = dialog.set_directory(dir);
    }
    for format in std::iter::once(first).chain(FileFormat::ALL.into_iter().filter(|f| *f != first))
    {
        let (label, extensions) = format.filter();
        dialog = dialog.add_filter(label, extensions);
    }
    let mut path = dialog.blocking_save_file()?.into_path().ok()?;
    if FileFormat::for_path(&path).is_none() {
        let mut name = path.file_name().unwrap_or_default().to_os_string();
        name.push(".");
        name.push(first.filter().1[0]);
        path.set_file_name(name);
    }
    if let Some(folder) = path.parent() {
        remember_folder(window.app_handle(), SAVE_FOLDER_KEY, folder);
    }
    Some(path)
}

/// Save As dialog, modal to the editor, with the template's name, starting
/// where [`save_as_start`] says. Always returns a `.png` path.
fn ask_save_path(app: &AppHandle, window: &WebviewWindow) -> Option<std::path::PathBuf> {
    let save = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .save
        .clone();
    let dir = save_as_start(app, None).unwrap_or_else(|| output::resolve_dir(&save.directory));
    let name = format!("{}.png", output::file_stem(&dir, &save.filename_template));
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
    if let Some(folder) = path.parent() {
        remember_folder(app, SAVE_FOLDER_KEY, folder);
    }
    Some(path)
}

/// "Save changes first?", modal to the editor, before its document goes.
pub fn confirm_close(app: &AppHandle, window: &WebviewWindow, reason: LeaveReason) -> CloseChoice {
    let is_file = id_from_label(window.label()).is_some_and(|id| {
        let state = app.state::<AppState>();
        let editors = state.editors.lock().unwrap();
        editors.open.get(&id).is_some_and(|e| e.file.is_some())
    });
    let message = if is_file {
        "This image has changes that haven't been saved."
    } else {
        "This screenshot has changes that haven't been copied or saved."
    };
    let result = window
        .dialog()
        .message(message)
        .title(match reason {
            LeaveReason::Close => "Save before closing?",
            LeaveReason::Open => "Save before opening another image?",
            LeaveReason::Capture => "Save before capturing?",
            LeaveReason::Update => "Save before updating?",
        })
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
/// so it isn't in the shot. The capture skips quick edit and comes back into
/// this window, in place of its image (PLAN 3G, 3H.7; Richard: from the
/// editor you mean to stay in the editor).
pub fn new_capture(app: &AppHandle, window: &WebviewWindow) {
    let into = id_from_label(window.label());
    let _ = window.minimize();
    let app = app.clone();
    std::thread::spawn(move || {
        // Let the minimize animation finish before grabbing the screen.
        std::thread::sleep(Duration::from_millis(300));
        match into {
            Some(id) => session::start_region_into(&app, id),
            None => session::start_region(&app),
        }
    });
}

/// Restore the editor `id` (minimized for a capture) and bring it to the front.
pub fn bring_back(app: &AppHandle, id: EditorId) {
    let Some(window) = app.get_webview_window(&label(id)) else {
        return;
    };
    let _ = window.unminimize();
    reveal(app, &window);
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
    // A maximized window's size isn't the one to restore to: use where it was
    // before it was maximized.
    let placement = if state.maximized || window.is_minimized().unwrap_or(false) {
        id_from_label(window.label()).and_then(|id| {
            let state = app.state::<AppState>();
            let editors = state.editors.lock().unwrap();
            editors.open.get(&id).and_then(|e| e.normal)
        })
    } else {
        current_placement(window, scale)
    };
    if let Some(p) = placement {
        state.x = Some(p.x);
        state.y = Some(p.y);
        state.width = Some(p.width);
        state.height = Some(p.height);
    }
    save_window_state(app, &state);
}

/// The window moved or resized: note where it is unless it's maximized or
/// minimized, for [`closing`].
pub fn moved(app: &AppHandle, window: &Window) {
    let Some(id) = id_from_label(window.label()) else {
        return;
    };
    // Ask Windows, not Tauri: while a window maximizes, its move arrives
    // before Tauri's `is_maximized` says so.
    let Ok(hwnd) = window.hwnd().map(|h| HWND(h.0)) else {
        return;
    };
    if unsafe { IsZoomed(hwnd).as_bool() || IsIconic(hwnd).as_bool() } {
        return;
    }
    let Some(placement) = window
        .scale_factor()
        .ok()
        .and_then(|scale| current_placement(window, scale))
    else {
        return;
    };
    let state = app.state::<AppState>();
    if let Some(e) = state.editors.lock().unwrap().open.get_mut(&id) {
        e.normal = Some(placement);
    };
}

fn current_placement(window: &Window, scale: f64) -> Option<Placement> {
    let pos = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    Some(Placement {
        x: pos.x,
        y: pos.y,
        width: f64::from(size.width) / scale,
        height: f64::from(size.height) / scale,
    })
}

/// The window is gone: free its image.
pub fn destroyed(app: &AppHandle, window_label: &str) {
    if let Some(id) = id_from_label(window_label) {
        let state = app.state::<AppState>();
        let mut editors = state.editors.lock().unwrap();
        editors.open.remove(&id);
        editors.unsaved.remove(&id);
    }
}

// ---------- window size ----------

/// Where an editor window is: its outer position in physical px, and its inner
/// size in logical px (as Tauri sizes a new window).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}

/// Remembered editor window state: the position in physical px, the size in
/// logical px.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
struct WindowState {
    x: Option<i32>,
    y: Option<i32>,
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

    fn placement(&self) -> Option<Placement> {
        let (width, height) = self.size()?;
        Some(Placement {
            x: self.x?,
            y: self.y?,
            width,
            height,
        })
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
        json!({
            "x": state.x,
            "y": state.y,
            "width": state.width,
            "height": state.height,
            "maximized": state.maximized,
        }),
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

/// A remembered placement in physical px (inner size), and the scale of the
/// monitor it's on, if the middle of its title bar is still on a work area
/// (the monitor it was on may be gone or rearranged). The size is limited by
/// that work area.
pub fn remembered_rect(monitors: &[MonitorInfo], p: Placement) -> Option<(PhysicalRect, f64)> {
    monitors.iter().find_map(|m| {
        let scale = if m.scale_factor.is_finite() && m.scale_factor > 0.0 {
            m.scale_factor
        } else {
            1.0
        };
        let work = m.work_area;
        let width = ((p.width * scale).round() as i32).min(work.width);
        let height = ((p.height * scale).round() as i32).min(work.height);
        // Below the invisible resize border.
        let title = PhysicalPoint::new(
            p.x.saturating_add(width / 2),
            p.y.saturating_add((16.0 * scale) as i32),
        );
        work.contains(title)
            .then(|| (PhysicalRect::new(p.x, p.y, width, height), scale))
    })
}

/// Step `rect` down and right (by [`CASCADE`] logical px) while another editor
/// window is already at its position, so the new one doesn't hide it.
pub fn cascade(rect: PhysicalRect, scale: f64, taken: &[PhysicalPoint]) -> PhysicalRect {
    let step = (CASCADE * scale).round() as i32;
    let mut r = rect;
    for _ in 0..10 {
        let near = |p: &PhysicalPoint| (p.x - r.x).abs() < step / 2 && (p.y - r.y).abs() < step / 2;
        if !taken.iter().any(near) {
            break;
        }
        r = PhysicalRect::new(r.x + step, r.y + step, r.width, r.height);
    }
    r
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

    fn monitor(work: PhysicalRect, scale: f64) -> MonitorInfo {
        MonitorInfo {
            index: 0,
            name: String::new(),
            physical_bounds: work,
            work_area: work,
            scale_factor: scale,
            is_primary: true,
        }
    }

    fn placement(x: i32, y: i32, width: f64, height: f64) -> Placement {
        Placement {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn remembered_placement_on_screen_is_kept() {
        let monitors = [
            monitor(WORK, 1.0),
            monitor(PhysicalRect::new(-2880, 0, 2880, 1560), 1.5),
        ];
        let (r, scale) = remembered_rect(&monitors, placement(100, 50, 1000.0, 700.0)).unwrap();
        assert_eq!((r, scale), (PhysicalRect::new(100, 50, 1000, 700), 1.0));
        // On the 150% monitor left of the primary: sized at its scale.
        let (r, scale) = remembered_rect(&monitors, placement(-2000, 100, 1000.0, 600.0)).unwrap();
        assert_eq!((r, scale), (PhysicalRect::new(-2000, 100, 1500, 900), 1.5));
    }

    #[test]
    fn remembered_placement_off_screen_is_dropped() {
        let monitors = [monitor(WORK, 1.0)];
        // Its monitor was unplugged.
        assert_eq!(
            remembered_rect(&monitors, placement(-1500, 100, 800.0, 600.0)),
            None
        );
        // Title bar below the work area.
        assert_eq!(
            remembered_rect(&monitors, placement(100, 1030, 800.0, 600.0)),
            None
        );
        // Mostly off the left edge, but the middle of its title bar is on screen.
        assert!(remembered_rect(&monitors, placement(-300, 100, 800.0, 600.0)).is_some());
    }

    #[test]
    fn remembered_size_is_limited_to_the_work_area() {
        let monitors = [monitor(WORK, 1.0)];
        let (r, _) = remembered_rect(&monitors, placement(0, 0, 3000.0, 3000.0)).unwrap();
        assert_eq!((r.width, r.height), (1920, 1040));
    }

    #[test]
    fn cascade_steps_past_open_windows() {
        let r = PhysicalRect::new(100, 100, 800, 600);
        assert_eq!(cascade(r, 1.0, &[]), r);
        assert_eq!(cascade(r, 1.0, &[PhysicalPoint::new(500, 500)]), r);
        let taken = [PhysicalPoint::new(100, 100), PhysicalPoint::new(130, 131)];
        assert_eq!(
            cascade(r, 1.0, &taken).origin(),
            PhysicalPoint::new(160, 160)
        );
        assert_eq!(
            cascade(r, 1.5, &taken[..1]).origin(),
            PhysicalPoint::new(145, 145)
        );
    }

    #[test]
    fn labels_round_trip() {
        assert_eq!(id_from_label(&label(12)), Some(12));
        assert_eq!(id_from_label("overlay-1"), None);
        assert_eq!(id_from_label("editor-x"), None);
    }
}
