//! One capture on screen: hotkey → grab → load overlays → show → cancel/commit
//! (PLAN §4.2), with timing for the perf log.

use std::collections::HashSet;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::capture::CaptureTiming;
use crate::frames::CaptureId;
use crate::overlay;
use crate::protocol::{self, TransferFormat};
use crate::state::AppState;

/// Show overlays even if some haven't reported ready by then.
const READY_TIMEOUT: Duration = Duration::from_millis(500);

/// Rust → overlay-n: fetch and draw this frame, then call `overlay_ready`.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct OverlayLoad {
    pub capture_id: CaptureId,
    pub monitor_index: u32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub format: TransferFormat,
    pub url: String,
}

/// Rust → overlays: you're now shown; reply with `overlay_visible` once painted.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct OverlayShown {
    pub capture_id: CaptureId,
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

pub struct Session {
    pub capture_id: CaptureId,
    pub format: TransferFormat,
    pub started: Instant,
    pub capture_timing: CaptureTiming,
    pub captured: Duration,
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

/// Hotkey entry point. Grabs pixels *first*: nothing may change focus or show a
/// window before the capture (PLAN §1.1).
pub fn start_capture(app: &AppHandle) {
    let started = Instant::now();
    let state = app.state::<AppState>();
    let mut session = state.session.lock().unwrap();
    if session.is_some() {
        eprintln!("[capture] ignored: a capture is already on screen");
        return;
    }
    let monitors = state.monitors.read().unwrap().clone();
    let (frames, capture_timing) = match state.capturer.capture_all(&monitors) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[capture] {} capture failed: {e}", state.capturer.name());
            return;
        }
    };
    let captured = started.elapsed();
    let capture = state.frames.lock().unwrap().insert(frames);
    let format = *state.transfer_format.lock().unwrap();
    *session = Some(Session {
        capture_id: capture.id,
        format,
        started,
        capture_timing,
        captured,
        pending: monitors.iter().map(|m| m.index).collect(),
        reports: Vec::new(),
        ready: None,
        show_started: false,
        shown: None,
        shown_by_timeout: false,
        visible: None,
    });
    drop(session);

    for frame in &capture.frames {
        let m = &frame.monitor;
        let load = OverlayLoad {
            capture_id: capture.id,
            monitor_index: m.index,
            width: frame.width,
            height: frame.height,
            scale_factor: m.scale_factor,
            format,
            url: protocol::frame_url(capture.id, m.index, format),
        };
        if let Err(e) = load.emit_to(app, overlay::label(m.index)) {
            eprintln!("[capture] emit to overlay {} failed: {e}", m.index);
        }
    }

    let app = app.clone();
    let id = capture.id;
    std::thread::spawn(move || {
        std::thread::sleep(READY_TIMEOUT);
        show(&app, id, true);
    });
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
                "[capture] #{capture_id}: overlays {:?} not ready after {READY_TIMEOUT:?}, showing anyway",
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

/// Hide overlays and end the session. The frames stay in the FrameStore.
pub fn cancel(app: &AppHandle, capture_id: CaptureId) {
    let state = app.state::<AppState>();
    let session = {
        let mut guard = state.session.lock().unwrap();
        match guard.as_ref() {
            Some(s) if s.capture_id == capture_id => guard.take(),
            _ => None,
        }
    };
    let Some(s) = session else {
        return;
    };
    overlay::hide_all(app);
    state.perf_log.lock().unwrap().push(PerfRecord {
        format: s.format,
        capture_timing: s.capture_timing,
        captured: s.captured,
        ready: s.ready,
        shown: s.shown,
        shown_by_timeout: s.shown_by_timeout,
        visible: s.visible,
        reports: s.reports,
    });
}

/// The id of the capture currently on screen and whether it has been painted.
pub fn current(app: &AppHandle) -> Option<(CaptureId, bool)> {
    let state = app.state::<AppState>();
    let guard = state.session.lock().unwrap();
    guard.as_ref().map(|s| (s.capture_id, s.visible.is_some()))
}
