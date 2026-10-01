//! One capture on screen: hotkey → grab → load overlays → show → commit/cancel
//! (PLAN §4.2), with timing for the perf log.

use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::capture::{CaptureTiming, MonitorFrame};
use crate::compose;
use crate::editor::LayerKind;
use crate::frames::{Capture, CaptureId};
use crate::geometry::{monitor_at, virtual_bounds, MonitorInfo, PhysicalRect};
use crate::protocol::{self, TransferFormat};
use crate::redact::{self, Redaction};
use crate::state::AppState;
use crate::winenum::{self, SnapWindow};
use crate::{editor, monitors, output, overlay};

/// Show overlays even if some haven't reported ready by then.
const READY_TIMEOUT: Duration = Duration::from_millis(500);
/// Freshly created overlay windows need time to load their page.
const READY_TIMEOUT_AFTER_REBUILD: Duration = Duration::from_millis(2500);

/// Rust → overlay-n: fetch and draw this frame, then call `overlay_ready`.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct OverlayLoad {
    pub capture_id: CaptureId,
    pub monitor_index: u32,
    pub physical_bounds: PhysicalRect,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub format: TransferFormat,
    pub url: String,
    pub dim_opacity: f64,
    pub show_dimensions: bool,
    /// Show the quick-edit toolbar on a region selection (`quickEdit.enabled`).
    pub quick_edit: bool,
    /// Where quick edit POSTs its annotation and highlight layers.
    pub layer_url: String,
    pub highlights_url: String,
    /// The windows on screen at capture time (visible frames, virtual-desktop
    /// px), topmost first, for window mode (PLAN 3H). `CaptureTarget::Window`
    /// picks one by its index here.
    pub windows: Vec<PhysicalRect>,
}

/// Rust → overlays: you're now shown; reply with `overlay_visible` once painted.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct OverlayShown {
    pub capture_id: CaptureId,
}

/// Rust → overlays: a selection started on `monitor_index`; clear yours.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct OverlayClearSelection {
    pub capture_id: CaptureId,
    pub monitor_index: u32,
}

/// Rust → overlays: the overlay on `owner` has quick-edit markup (None: none
/// has). The others stop starting selections, so it can't be thrown away.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct OverlayMarkupOwner {
    pub capture_id: CaptureId,
    pub owner: Option<u32>,
}

/// Rust → overlays: window mode is on or off, and which window (an index into
/// `OverlayLoad::windows`) is under the pointer, so a window spanning
/// monitors is highlighted on each of them.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct OverlayWindowPick {
    pub capture_id: CaptureId,
    pub picking: bool,
    pub hovered: Option<u32>,
}

/// Overlay → Rust: frame drawn, with the overlay-side timing.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OverlayReport {
    pub monitor_index: u32,
    pub fetch_ms: f64,
    pub decode_ms: f64,
    pub draw_ms: f64,
    pub bytes: u32,
}

/// What the user chose on the overlay.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CaptureTarget {
    /// Virtual-desktop physical pixels.
    Region {
        rect: PhysicalRect,
    },
    MonitorUnderCursor,
    AllMonitors,
    /// An index into `OverlayLoad::windows`.
    Window {
        index: u32,
    },
}

pub struct Session {
    pub capture_id: CaptureId,
    pub format: TransferFormat,
    pub started: Instant,
    pub capture_timing: CaptureTiming,
    pub captured: Duration,
    /// Window enumeration, right after the grab.
    enumerated: Duration,
    windows: Vec<SnapWindow>,
    loads: Vec<OverlayLoad>,
    pending: HashSet<u32>,
    pub reports: Vec<OverlayReport>,
    pub ready: Option<Duration>,
    /// Set as soon as showing starts so it happens once.
    show_started: bool,
    pub shown: Option<Duration>,
    pub shown_by_timeout: bool,
    pub visible: Option<Duration>,
    /// What quick edit already did, so closing doesn't do it again.
    done: QuickDone,
    /// The overlay whose selection has quick-edit markup, if any.
    markup_owner: Option<u32>,
    /// Quick edit's latest layers (straight-alpha RGBA the size of the region).
    layer: Option<Vec<u8>>,
    highlights: Option<Vec<u8>>,
    /// Started from an editor's New capture (PLAN 3G): no quick edit, the
    /// selection goes to the editor (into it, if it's empty), and cancelling
    /// brings it back as it was.
    into: Option<editor::EditorId>,
}

/// What quick edit's image is: the region and the markup's revision (the page
/// counts its changes). The after-capture actions skip a copy or save only
/// while both are still the same.
type QuickImage = (PhysicalRect, u32);

/// Quick edit's copies and saves so far.
#[derive(Debug, Default, Clone)]
struct QuickDone {
    copied: Option<QuickImage>,
    saved: Option<(QuickImage, PathBuf)>,
}

impl QuickDone {
    fn for_image(&self, image: QuickImage) -> output::Already {
        output::Already {
            copied: self.copied == Some(image),
            saved: self
                .saved
                .as_ref()
                .filter(|(i, _)| *i == image)
                .map(|(_, p)| p.clone()),
        }
    }
}

/// Quick edit's markup, as the page describes it with each action: which
/// layers it just uploaded, its redactions, its revision, and the annotations
/// themselves (a JSON array in virtual-desktop px) in case the editor takes
/// over.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QuickMarkup {
    pub layer: bool,
    pub highlights: bool,
    /// Pixelated or blurred areas in virtual-desktop px, bottom to top (PLAN 3D.4).
    pub redactions: Vec<Redaction>,
    pub revision: u32,
    pub annotations: String,
}

/// An overlay's selection gained or lost its last markup: record it and tell
/// every overlay.
pub fn markup_changed(app: &AppHandle, capture_id: CaptureId, monitor_index: u32, has: bool) {
    let state = app.state::<AppState>();
    let owner = {
        let mut guard = state.session.lock().unwrap();
        let Some(s) = guard.as_mut().filter(|s| s.capture_id == capture_id) else {
            return;
        };
        if has {
            s.markup_owner = Some(monitor_index);
        } else if s.markup_owner == Some(monitor_index) {
            s.markup_owner = None;
        }
        s.markup_owner
    };
    let _ = OverlayMarkupOwner { capture_id, owner }.emit(app);
}

/// A press on another monitor while `monitor_index` has markup: give that
/// overlay the keyboard back.
pub fn focus_overlay(app: &AppHandle, monitor_index: u32) {
    if let Some(window) = app.get_webview_window(&overlay::label(monitor_index)) {
        if let Ok(hwnd) = window.hwnd() {
            overlay::force_foreground(windows::Win32::Foundation::HWND(hwnd.0));
        }
    }
}

/// Store a layer quick edit uploaded for the capture on screen.
pub fn set_layer<R: tauri::Runtime>(
    app: &AppHandle<R>,
    capture_id: CaptureId,
    kind: LayerKind,
    bytes: Vec<u8>,
) -> bool {
    let state = app.state::<AppState>();
    let mut guard = state.session.lock().unwrap();
    match guard.as_mut() {
        Some(s) if s.capture_id == capture_id => {
            match kind {
                LayerKind::Annotations => s.layer = Some(bytes),
                LayerKind::Highlights => s.highlights = Some(bytes),
            }
            true
        }
        _ => false,
    }
}

/// The region of a capture with quick edit's markup on it, as delivered.
fn quick_image(
    capture: &Capture,
    rect: PhysicalRect,
    markup: &QuickMarkup,
    layer: Option<&[u8]>,
    highlights: Option<&[u8]>,
) -> Result<compose::RgbaImage, String> {
    let frames: Vec<&MonitorFrame> = capture.frames.iter().map(|f| f.as_ref()).collect();
    let mut image = compose::compose(&frames, rect).ok_or("The selection is empty.")?;
    if !markup.redactions.is_empty() {
        // Worked out on the whole monitor under the selection, as the overlay
        // previews them, so a blur reads the same pixels around it.
        let touched: Vec<&MonitorFrame> = frames
            .iter()
            .copied()
            .filter(|f| f.monitor.physical_bounds.intersect(&rect).is_some())
            .collect();
        let monitors: Vec<MonitorInfo> = touched.iter().map(|f| f.monitor.clone()).collect();
        let bounds = virtual_bounds(&monitors);
        let base = compose::compose(&touched, bounds).ok_or("The selection is empty.")?;
        let origin = bounds.origin();
        let redactions: Vec<Redaction> = markup
            .redactions
            .iter()
            .map(|r| Redaction {
                rect: r.rect.relative_to(origin),
                ..*r
            })
            .collect();
        redact::apply(&base, rect.relative_to(origin), &mut image, &redactions);
    }
    if markup.highlights {
        let h = highlights.ok_or("The highlights didn't arrive.")?;
        compose::blend_multiply(&mut image, h)?;
    }
    if markup.layer {
        let l = layer.ok_or("The annotations didn't arrive.")?;
        compose::blend_over(&mut image, l)?;
    }
    Ok(image)
}

/// A quick-edit toolbar action that doesn't have to end the capture.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum QuickAction {
    Copy,
    Save,
}

/// What a quick-edit action did.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QuickOutcome {
    /// Quick edit closed (per `quickEdit.closeOnCopy` / `closeOnSave`).
    pub closed: bool,
    /// A saved file, for the toolbar's message.
    pub path: Option<String>,
}

/// A finished session's numbers.
#[derive(Debug, Clone)]
pub struct PerfRecord {
    pub format: TransferFormat,
    pub capture_timing: CaptureTiming,
    pub captured: Duration,
    pub ready: Option<Duration>,
    pub shown: Option<Duration>,
    pub shown_by_timeout: bool,
    pub visible: Option<Duration>,
    pub reports: Vec<OverlayReport>,
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

fn opt_ms(d: Option<Duration>) -> String {
    d.map_or("-".into(), |d| format!("{:.1}ms", ms(d)))
}

/// Grab every monitor, noticing layout changes. Enumeration is read-only and
/// sub-millisecond, so it doesn't break "capture before anything else".
fn grab(state: &AppState) -> Option<(Vec<MonitorInfo>, bool, Vec<MonitorFrame>, CaptureTiming)> {
    let known = state.monitors.read().unwrap().clone();
    let current = monitors::enumerate().unwrap_or_else(|e| {
        eprintln!("[capture] monitor enumeration failed: {e}");
        known.clone()
    });
    let changed = current != known;
    match state.capturer.capture_all(&current) {
        Ok((frames, timing)) => Some((current, changed, frames, timing)),
        Err(e) => {
            eprintln!("[capture] {} capture failed: {e}", state.capturer.name());
            None
        }
    }
}

/// Region-capture entry point (hotkey, tray, second launch). Grabs pixels
/// *first*: nothing may change focus or show a window before that (PLAN §1.1).
pub fn start_region(app: &AppHandle) {
    start_region_for(app, None);
}

/// A region capture from the editor `id` (its New capture, PLAN 3G): the
/// plain selection, which then goes to the editor, into `id` if it's empty.
pub fn start_region_into(app: &AppHandle, id: editor::EditorId) {
    // No capture after all (one already on screen): the editor comes back.
    if !start_region_for(app, Some(id)) {
        editor::bring_back(app, id);
    }
}

/// False if no capture started.
fn start_region_for(app: &AppHandle, into: Option<editor::EditorId>) -> bool {
    let started = Instant::now();
    let state = app.state::<AppState>();
    let mut session = state.session.lock().unwrap();
    if session.is_some() {
        eprintln!("[capture] ignored: a capture is already on screen");
        return false;
    }
    let Some((monitors, layout_changed, frames, capture_timing)) = grab(&state) else {
        return false;
    };
    let captured = started.elapsed();
    let t = Instant::now();
    let windows = winenum::enumerate(virtual_bounds(&monitors));
    let enumerated = t.elapsed();
    let window_rects: Vec<PhysicalRect> = windows.iter().map(|w| w.rect).collect();
    let capture = state.frames.lock().unwrap().insert(frames);
    let format = *state.transfer_format.lock().unwrap();
    let (overlay_settings, quick_edit) = {
        let s = state.settings.read().unwrap();
        (s.overlay.clone(), s.quick_edit.enabled && into.is_none())
    };
    let loads: Vec<OverlayLoad> = capture
        .frames
        .iter()
        .map(|frame| OverlayLoad {
            capture_id: capture.id,
            monitor_index: frame.monitor.index,
            physical_bounds: frame.monitor.physical_bounds,
            width: frame.width,
            height: frame.height,
            scale_factor: frame.monitor.scale_factor,
            format,
            url: protocol::frame_url(capture.id, frame.monitor.index, format),
            dim_opacity: overlay_settings.dim_opacity,
            show_dimensions: overlay_settings.show_dimensions,
            quick_edit,
            layer_url: protocol::capture_layer_url(capture.id, LayerKind::Annotations),
            highlights_url: protocol::capture_layer_url(capture.id, LayerKind::Highlights),
            windows: window_rects.clone(),
        })
        .collect();
    *session = Some(Session {
        capture_id: capture.id,
        format,
        started,
        capture_timing,
        captured,
        enumerated,
        windows,
        loads: loads.clone(),
        pending: monitors.iter().map(|m| m.index).collect(),
        reports: Vec::new(),
        ready: None,
        show_started: false,
        shown: None,
        shown_by_timeout: false,
        visible: None,
        done: QuickDone::default(),
        markup_owner: None,
        layer: None,
        highlights: None,
        into,
    });
    drop(session);

    let app = app.clone();
    let id = capture.id;
    if layout_changed {
        eprintln!("[capture] display layout changed; rebuilding overlays");
        *state.monitors.write().unwrap() = monitors.clone();
        // Window creation must not run on the main thread while it's busy here.
        std::thread::spawn(move || {
            if let Err(e) = overlay::reconcile_pool(&app, &monitors) {
                eprintln!("[overlay] rebuild failed: {e}");
            }
            emit_loads(&app, &loads);
            std::thread::sleep(READY_TIMEOUT_AFTER_REBUILD);
            show(&app, id, true);
        });
    } else {
        emit_loads(&app, &loads);
        std::thread::spawn(move || {
            std::thread::sleep(READY_TIMEOUT);
            show(&app, id, true);
        });
    }
    true
}

fn emit_loads(app: &AppHandle, loads: &[OverlayLoad]) {
    for load in loads {
        if let Err(e) = load.emit_to(app, overlay::label(load.monitor_index)) {
            eprintln!(
                "[capture] emit to overlay {} failed: {e}",
                load.monitor_index
            );
        }
    }
}

/// Full-screen entry point: every monitor, straight to the output actions (or
/// the editor, which then finishes the job).
pub fn capture_fullscreen(app: &AppHandle) {
    let started = Instant::now();
    let state = app.state::<AppState>();
    if state.session.lock().unwrap().is_some() {
        eprintln!("[capture] ignored: a capture is already on screen");
        return;
    }
    let Some((monitors, layout_changed, frames, _)) = grab(&state) else {
        return;
    };
    let capture = state.frames.lock().unwrap().insert(frames);
    // With quick edit on, full-screen captures go to the editor (PLAN 2B).
    let to_editor = state.settings.read().unwrap().quick_edit.enabled;
    finish(app, &capture, virtual_bounds(&monitors), started, to_editor);
    if layout_changed {
        *state.monitors.write().unwrap() = monitors.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = overlay::reconcile_pool(&app, &monitors) {
                eprintln!("[overlay] rebuild failed: {e}");
            }
        });
    }
}

/// An overlay page that loaded after its `OverlayLoad` was emitted (e.g. a
/// window created by a display change) asks for it here.
pub fn pending_load(app: &AppHandle, monitor_index: u32) -> Option<OverlayLoad> {
    let state = app.state::<AppState>();
    let guard = state.session.lock().unwrap();
    let s = guard.as_ref()?;
    if !s.pending.contains(&monitor_index) {
        return None;
    }
    s.loads
        .iter()
        .find(|l| l.monitor_index == monitor_index)
        .cloned()
}

pub fn overlay_ready(app: &AppHandle, capture_id: CaptureId, report: OverlayReport) {
    let state = app.state::<AppState>();
    let mut guard = state.session.lock().unwrap();
    let Some(s) = guard.as_mut().filter(|s| s.capture_id == capture_id) else {
        return;
    };
    s.pending.remove(&report.monitor_index);
    s.reports.push(report);
    if s.pending.is_empty() && s.ready.is_none() {
        s.ready = Some(s.started.elapsed());
        drop(guard);
        show(app, capture_id, false);
    }
}

fn show(app: &AppHandle, capture_id: CaptureId, by_timeout: bool) {
    let state = app.state::<AppState>();
    {
        let mut guard = state.session.lock().unwrap();
        let Some(s) = guard.as_mut().filter(|s| s.capture_id == capture_id) else {
            return;
        };
        if s.show_started {
            return;
        }
        s.show_started = true;
        s.shown_by_timeout = by_timeout;
        if by_timeout {
            eprintln!(
                "[capture] #{capture_id}: overlays {:?} not ready in time, showing anyway",
                s.pending
            );
        }
    }

    // Window activation/focus must happen on the thread that owns the windows.
    let monitors = state.monitors.read().unwrap().clone();
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        overlay::show_all(&handle, &monitors);
        let _ = tx.send(());
    });
    let _ = rx.recv();

    let mut guard = state.session.lock().unwrap();
    if let Some(s) = guard.as_mut().filter(|s| s.capture_id == capture_id) {
        s.shown = Some(s.started.elapsed());
        let grabs: Vec<String> = s
            .capture_timing
            .grab
            .iter()
            .map(|d| format!("{:.1}", ms(*d)))
            .collect();
        let mut reports = s.reports.clone();
        reports.sort_by_key(|r| r.monitor_index);
        let overlays: Vec<String> = reports
            .iter()
            .map(|r| {
                format!(
                    "m{} fetch {:.1} decode {:.1} draw {:.1}",
                    r.monitor_index, r.fetch_ms, r.decode_ms, r.draw_ms
                )
            })
            .collect();
        eprintln!(
            "[perf] #{} {}/{}: captured {:.1}ms (grab [{}] copy {:.1}, {} windows {:.1}) → ready {} → shown {} | {}",
            s.capture_id,
            state.capturer.name(),
            s.format.as_str(),
            ms(s.captured),
            grabs.join(", "),
            ms(s.capture_timing.copy),
            s.windows.len(),
            ms(s.enumerated),
            opt_ms(s.ready),
            opt_ms(s.shown),
            overlays.join(" | "),
        );
    }
    drop(guard);

    let _ = OverlayShown { capture_id }.emit(app);
}

pub fn overlay_visible(app: &AppHandle, capture_id: CaptureId, monitor_index: u32) {
    let state = app.state::<AppState>();
    let mut guard = state.session.lock().unwrap();
    if let Some(s) = guard.as_mut().filter(|s| s.capture_id == capture_id) {
        if s.visible.is_none() {
            let t = s.started.elapsed();
            s.visible = Some(t);
            eprintln!(
                "[perf] #{capture_id}: hotkey → visible {:.1}ms (first: overlay {monitor_index})",
                ms(t)
            );
        }
    }
}

pub fn selection_started(app: &AppHandle, capture_id: CaptureId, monitor_index: u32) {
    let _ = OverlayClearSelection {
        capture_id,
        monitor_index,
    }
    .emit(app);
}

pub fn window_pick_changed(
    app: &AppHandle,
    capture_id: CaptureId,
    picking: bool,
    hovered: Option<u32>,
) {
    let _ = OverlayWindowPick {
        capture_id,
        picking,
        hovered,
    }
    .emit(app);
}

/// End the session and hide the overlays. The frames stay in the FrameStore.
fn end(app: &AppHandle, capture_id: CaptureId) -> Option<Session> {
    let state = app.state::<AppState>();
    let session = {
        let mut guard = state.session.lock().unwrap();
        match guard.as_ref() {
            Some(s) if s.capture_id == capture_id => guard.take(),
            _ => None,
        }
    }?;
    overlay::hide_all(app);
    state.perf_log.lock().unwrap().push(PerfRecord {
        format: session.format,
        capture_timing: session.capture_timing.clone(),
        captured: session.captured,
        ready: session.ready,
        shown: session.shown,
        shown_by_timeout: session.shown_by_timeout,
        visible: session.visible,
        reports: session.reports.clone(),
    });
    Some(session)
}

pub fn cancel(app: &AppHandle, capture_id: CaptureId) {
    // From an editor: it comes back as it was.
    if let Some(id) = end(app, capture_id).and_then(|s| s.into) {
        editor::bring_back(app, id);
    }
}

pub fn commit(app: &AppHandle, capture_id: CaptureId, target: CaptureTarget) {
    let started = Instant::now();
    let Some(session) = end(app, capture_id) else {
        return;
    };
    let state = app.state::<AppState>();
    let Some(capture) = state.frames.lock().unwrap().get(capture_id) else {
        return;
    };
    let monitors: Vec<MonitorInfo> = capture.frames.iter().map(|f| f.monitor.clone()).collect();
    // F / A and a picked window, with quick edit on, open the editor (PLAN
    // 2B, 3H); regions don't get here in quick edit, and without it
    // everything is as in Phase 1.
    let whole_screens_to_editor = !matches!(target, CaptureTarget::Region { .. })
        && state.settings.read().unwrap().quick_edit.enabled;
    let rect = match target {
        CaptureTarget::Region { rect } => rect,
        CaptureTarget::MonitorUnderCursor => overlay::cursor_position()
            .and_then(|p| monitor_at(&monitors, p))
            .or_else(|| monitors.iter().find(|m| m.is_primary))
            .or(monitors.first())
            .map(|m| m.physical_bounds)
            .unwrap_or_default(),
        CaptureTarget::AllMonitors => virtual_bounds(&monitors),
        // For now cut from the frozen screen, minus any part off the desktop.
        CaptureTarget::Window { index } => match session
            .windows
            .get(index as usize)
            .and_then(|w| w.rect.intersect(&virtual_bounds(&monitors)))
        {
            Some(rect) => rect,
            None => return,
        },
    };
    if let Some(id) = session.into {
        editor::open_capture_into(app, &capture, rect, id);
        return;
    }
    finish(app, &capture, rect, started, whole_screens_to_editor);
}

/// Quick edit's Done (Enter): deliver the region with its markup, minus what
/// quick edit already did for this same image.
pub fn quick_done(
    app: &AppHandle,
    capture_id: CaptureId,
    rect: PhysicalRect,
    markup: QuickMarkup,
) -> Result<(), String> {
    let started = Instant::now();
    let Some(session) = end(app, capture_id) else {
        return Err("This capture has already closed.".into());
    };
    let state = app.state::<AppState>();
    let capture = state
        .frames
        .lock()
        .unwrap()
        .get(capture_id)
        .ok_or("This capture is no longer in memory.")?;
    let open_editor = state.settings.read().unwrap().after_capture.open_editor;
    if open_editor {
        // The markup goes along, still editable; the editor finishes the job.
        editor::open_capture(app, &capture, rect, Some(markup.annotations));
        return Ok(());
    }
    let image = quick_image(
        &capture,
        rect,
        &markup,
        session.layer.as_deref(),
        session.highlights.as_deref(),
    )?;
    let already = session.done.for_image((rect, markup.revision));
    let doc = output::CaptureDoc::new(&capture, rect, Some(markup.annotations));
    output::deliver(app, image, doc, started, already);
    Ok(())
}

/// Quick edit's Copy or Save of `rect` (virtual-desktop physical px). The
/// capture stays on screen unless `quickEdit.closeOnCopy` / `closeOnSave`
/// says to close, which then delivers like Done, minus what was just done.
pub fn quick_output(
    app: &AppHandle,
    capture_id: CaptureId,
    rect: PhysicalRect,
    action: QuickAction,
    markup: QuickMarkup,
) -> Result<QuickOutcome, String> {
    let state = app.state::<AppState>();
    let (layer, highlights) = {
        let guard = state.session.lock().unwrap();
        match guard.as_ref() {
            Some(s) if s.capture_id == capture_id => (s.layer.clone(), s.highlights.clone()),
            _ => return Err("This capture has already closed.".into()),
        }
    };
    let capture = state
        .frames
        .lock()
        .unwrap()
        .get(capture_id)
        .ok_or("This capture is no longer in memory.")?;
    let image = quick_image(
        &capture,
        rect,
        &markup,
        layer.as_deref(),
        highlights.as_deref(),
    )?;
    let settings = state.settings.read().unwrap().clone();

    let (path, close) = match action {
        QuickAction::Copy => {
            output::copy_to_clipboard(&image)?;
            (None, settings.quick_edit.close_on_copy)
        }
        QuickAction::Save => {
            let path = output::save_with_template(&settings.save, &image)?;
            (Some(path), settings.quick_edit.close_on_save)
        }
    };
    let done = (rect, markup.revision);
    if let Some(s) = state.session.lock().unwrap().as_mut() {
        match &path {
            None => s.done.copied = Some(done),
            Some(p) => s.done.saved = Some((done, p.clone())),
        }
    }
    if close {
        quick_done(app, capture_id, rect, markup)?;
    }
    Ok(QuickOutcome {
        closed: close,
        path: path.map(|p| p.display().to_string()),
    })
}

/// Quick edit's "Open in editor": the selection and its markup move to an
/// editor window. No after-capture actions run; the editor's own do.
pub fn quick_open_editor(
    app: &AppHandle,
    capture_id: CaptureId,
    rect: PhysicalRect,
    annotations: String,
) -> Result<(), String> {
    if end(app, capture_id).is_none() {
        return Err("This capture has already closed.".into());
    }
    let capture = app
        .state::<AppState>()
        .frames
        .lock()
        .unwrap()
        .get(capture_id)
        .ok_or("This capture is no longer in memory.")?;
    editor::open_capture(app, &capture, rect, Some(annotations));
    Ok(())
}

/// Hand `rect` of a capture to the editor or the after-capture actions. When
/// the editor opens (`afterCapture.openEditor`, or `to_editor`), the actions
/// are held back: the editor's own copy/save (and on-close actions) finish
/// the job (PLAN Phase 2).
fn finish(
    app: &AppHandle,
    capture: &Capture,
    rect: PhysicalRect,
    started: Instant,
    to_editor: bool,
) {
    let open_editor = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .after_capture
        .open_editor;
    if open_editor || to_editor {
        editor::open_capture(app, capture, rect, None);
        return;
    }
    let frames: Vec<&MonitorFrame> = capture.frames.iter().map(|f| f.as_ref()).collect();
    match compose::compose(&frames, rect) {
        Some(image) => {
            let doc = output::CaptureDoc::new(capture, rect, None);
            output::deliver(app, image, doc, started, output::Already::default());
        }
        None => eprintln!("[capture] #{}: empty selection {rect:?}", capture.id),
    }
}

/// The id of the capture currently on screen and whether it has been painted.
pub fn current(app: &AppHandle) -> Option<(CaptureId, bool)> {
    let state = app.state::<AppState>();
    let guard = state.session.lock().unwrap();
    guard.as_ref().map(|s| (s.capture_id, s.visible.is_some()))
}
