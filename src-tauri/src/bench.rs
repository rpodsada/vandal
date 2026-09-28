//! Phase 0 benchmark + alignment check, enabled with `CAPTURE_BENCH=<iterations>`.
//!
//! Runs the real hotkey pipeline N times per transfer format. While the overlay
//! is up it re-captures the screen and compares it to the frozen frame: if the
//! overlay is pixel-aligned at 1:1, the two are identical. Prints a summary and
//! exits. Results go in docs/perf.md.

use std::sync::mpsc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use crate::capture::MonitorFrame;
use crate::protocol::TransferFormat;
use crate::session::{self, PerfRecord};
use crate::state::AppState;

pub fn maybe_start(app: &AppHandle) {
    let Some(iterations) = std::env::var("CAPTURE_BENCH")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
    else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || run(&app, iterations));
}

/// (mismatched pixels, total pixels, first mismatch (x, y)) — alpha ignored.
pub fn compare(a: &MonitorFrame, b: &MonitorFrame) -> (usize, usize, Option<(u32, u32)>) {
    let total = (a.width * a.height) as usize;
    if a.width != b.width || a.height != b.height {
        return (total, total, Some((0, 0)));
    }
    let mut mismatched = 0;
    let mut first = None;
    for (i, (pa, pb)) in a
        .bgra
        .chunks_exact(4)
        .zip(b.bgra.chunks_exact(4))
        .enumerate()
    {
        if pa[..3] != pb[..3] {
            mismatched += 1;
            first.get_or_insert(((i as u32) % a.width, (i as u32) / a.width));
        }
    }
    (mismatched, total, first)
}

fn run(app: &AppHandle, iterations: usize) {
    // Let the overlay pages finish loading.
    std::thread::sleep(Duration::from_secs(3));
    let state = app.state::<AppState>();
    let mut alignment = Vec::new();

    for format in [TransferFormat::Rgba, TransferFormat::Bmp] {
        *state.transfer_format.lock().unwrap() = format;
        for _ in 0..iterations {
            // Same thread as the real hotkey handler.
            let (tx, rx) = mpsc::channel();
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                session::start_region(&handle);
                let _ = tx.send(());
            });
            let _ = rx.recv();

            let deadline = Instant::now() + Duration::from_secs(3);
            let id = loop {
                match session::current(app) {
                    Some((id, true)) => break Some(id),
                    _ if Instant::now() > deadline => break session::current(app).map(|c| c.0),
                    _ => std::thread::sleep(Duration::from_millis(2)),
                }
            };
            let Some(id) = id else {
                eprintln!("[bench] capture did not start");
                continue;
            };

            std::thread::sleep(Duration::from_millis(250));
            let monitors = state.monitors.read().unwrap().clone();
            if let (Some(original), Ok((after, _))) = (
                state.frames.lock().unwrap().get(id),
                state.capturer.capture_all(&monitors),
            ) {
                for (orig, now) in original.frames.iter().zip(&after) {
                    alignment.push((format, orig.monitor.index, compare(orig, now)));
                }
            }

            session::cancel(app, id);
            std::thread::sleep(Duration::from_millis(400));
        }
    }

    print_summary(&state.perf_log.lock().unwrap(), &alignment);
    app.exit(0);
}

fn stats(mut v: Vec<f64>) -> String {
    if v.is_empty() {
        return "n/a".into();
    }
    v.sort_by(|a, b| a.total_cmp(b));
    let median = v[v.len() / 2];
    let p90 = v[((v.len() as f64 * 0.9).ceil() as usize).clamp(1, v.len()) - 1];
    format!(
        "median {median:6.1}  p90 {p90:6.1}  max {:6.1}",
        v[v.len() - 1]
    )
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

type Alignment = (TransferFormat, u32, (usize, usize, Option<(u32, u32)>));

fn print_summary(records: &[PerfRecord], alignment: &[Alignment]) {
    println!("\n==== Vandal bench ({} runs) ====", records.len());
    for format in [TransferFormat::Rgba, TransferFormat::Bmp] {
        let rs: Vec<&PerfRecord> = records.iter().filter(|r| r.format == format).collect();
        if rs.is_empty() {
            continue;
        }
        let timeouts = rs.iter().filter(|r| r.shown_by_timeout).count();
        println!(
            "\n-- {} ({} runs, {timeouts} ready-timeouts) --",
            format.as_str(),
            rs.len()
        );
        let row = |name: &str, v: Vec<f64>| println!("  {name:<22} {}", stats(v));
        row(
            "hotkey→captured",
            rs.iter().map(|r| ms(r.captured)).collect(),
        );
        row(
            "  copy out",
            rs.iter().map(|r| ms(r.capture_timing.copy)).collect(),
        );
        row(
            "hotkey→all ready",
            rs.iter().filter_map(|r| r.ready.map(ms)).collect(),
        );
        row(
            "hotkey→shown",
            rs.iter().filter_map(|r| r.shown.map(ms)).collect(),
        );
        row(
            "hotkey→visible",
            rs.iter().filter_map(|r| r.visible.map(ms)).collect(),
        );
        let monitors = rs
            .iter()
            .map(|r| r.capture_timing.grab.len())
            .max()
            .unwrap_or(0);
        for m in 0..monitors {
            row(
                &format!("  m{m} grab"),
                rs.iter()
                    .filter_map(|r| r.capture_timing.grab.get(m).map(|d| ms(*d)))
                    .collect(),
            );
            let reports: Vec<_> = rs
                .iter()
                .flat_map(|r| r.reports.iter().filter(|x| x.monitor_index == m as u32))
                .collect();
            row(
                &format!("  m{m} fetch"),
                reports.iter().map(|x| x.fetch_ms).collect(),
            );
            row(
                &format!("  m{m} decode"),
                reports.iter().map(|x| x.decode_ms).collect(),
            );
            row(
                &format!("  m{m} draw"),
                reports.iter().map(|x| x.draw_ms).collect(),
            );
        }
    }

    println!("\n-- alignment (re-capture while overlay shown vs. frozen frame) --");
    for (format, monitor, (bad, total, first)) in alignment {
        println!(
            "  {:<4} m{monitor}: {bad} / {total} pixels differ ({:.4}%){}",
            format.as_str(),
            *bad as f64 * 100.0 / (*total).max(1) as f64,
            first.map_or(String::new(), |(x, y)| format!(", first at ({x}, {y})")),
        );
    }
}
