//! One capture on screen: hotkey → grab → load overlays → show → commit/cancel
//! (PLAN §4.2), with timing for the perf log.

use std::collections::HashSet;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::capture::{CaptureTiming, MonitorFrame};
use crate::compose;
use crate::frames::{Capture, CaptureId};
use crate::geometry::{monitor_at, virtual_bounds, MonitorInfo, PhysicalRect};
use crate::protocol::{self, TransferFormat};
use crate::state::AppState;
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
}

pub struct Session {
    pub capture_id: CaptureId,
    pub format: TransferFormat,
    pub started: Instant,
    pub capture_timing: CaptureTiming,
    pub captured: Duration,
    loads: Vec<OverlayLoad>,
    pending: HashSet<u32>,
    pub reports: Vec<OverlayReport>,
    pub ready: Option<Duration>,
    /// Set as soon as showing starts so it happens once.
    show_started: bool,
    pub shown: Option<Duration>,
    pub shown_by_timeout: bool,
    pub visible: Option<Duration>,
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
    let started = Instant::now();
    let state = app.state::<AppState>();
    let mut session = state.session.lock().unwrap();
    if session.is_some() {
        eprintln!("[capture] ignored: a capture is already on screen");
        return;
    }
    let Some((monitors, layout_changed, frames, capture_timing)) = grab(&state) else {
        return;
    };
    let captured = started.elapsed();
    let capture = state.frames.lock().unwrap().insert(frames);
    let format = *state.transfer_format.lock().unwrap();
    let overlay_settings = state.settings.read().unwrap().overlay.clone();
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
        })
        .collect();
    *session = Some(Session {
        capture_id: capture.id,
        format,
        started,
        capture_timing,
        captured,
        loads: loads.clone(),
        pending: monitors.iter().map(|m| m.index).collect(),
        reports: Vec::new(),
        ready: None,
        show_started: false,
        shown: None,
        shown_by_timeout: false,
        visible: None,
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
    finish(app, &capture, virtual_bounds(&monitors), started);
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
            "[perf] #{} {}/{}: captured {:.1}ms (grab [{}] copy {:.1}) → ready {} → shown {} | {}",
            s.capture_id,
            state.capturer.name(),
            s.format.as_str(),
            ms(s.captured),
            grabs.join(", "),
            ms(s.capture_timing.copy),
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
    end(app, capture_id);
}

pub fn commit(app: &AppHandle, capture_id: CaptureId, target: CaptureTarget) {
    let started = Instant::now();
    if end(app, capture_id).is_none() {
        return;
    }
    let state = app.state::<AppState>();
    let Some(capture) = state.frames.lock().unwrap().get(capture_id) else {
        return;
    };
    let monitors: Vec<MonitorInfo> = capture.frames.iter().map(|f| f.monitor.clone()).collect();
    let rect = match target {
        CaptureTarget::Region { rect } => rect,
        CaptureTarget::MonitorUnderCursor => overlay::cursor_position()
            .and_then(|p| monitor_at(&monitors, p))
            .or_else(|| monitors.iter().find(|m| m.is_primary))
            .or(monitors.first())
            .map(|m| m.physical_bounds)
            .unwrap_or_default(),
        CaptureTarget::AllMonitors => virtual_bounds(&monitors),
    };
    finish(app, &capture, rect, started);
}

/// Hand `rect` of a capture to the editor or the after-capture actions. When
/// the editor opens, the actions are held back: the editor's own copy/save
/// (and on-close actions) finish the job (PLAN Phase 2).
fn finish(app: &AppHandle, capture: &Capture, rect: PhysicalRect, started: Instant) {
    let open_editor = app
        .state::<AppState>()
        .settings
        .read()
        .unwrap()
        .after_capture
        .open_editor;
    if open_editor {
        editor::open_capture(app, capture, rect);
        return;
    }
    let frames: Vec<&MonitorFrame> = capture.frames.iter().map(|f| f.as_ref()).collect();
    match compose::compose(&frames, rect) {
        Some(image) => output::deliver(app, image, started),
        None => eprintln!("[capture] #{}: empty selection {rect:?}", capture.id),
    }
}

/// The id of the capture currently on screen and whether it has been painted.
pub fn current(app: &AppHandle) -> Option<(CaptureId, bool)> {
    let state = app.state::<AppState>();
    let guard = state.session.lock().unwrap();
    guard.as_ref().map(|s| (s.capture_id, s.visible.is_some()))
}
