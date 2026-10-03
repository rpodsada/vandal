//! Running scrolling captures in the app (PLAN 3K.3–3K.4). UI Automation's
//! objects belong to the thread that made them, so one worker thread owns
//! them: it answers the overlay's "what scrolls here?" as the pointer moves,
//! keeps the last area it found, and runs the capture.

use std::sync::atomic::AtomicBool;
use std::sync::mpsc;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use super::stitch::Params;
use super::windows::{find_at, to_rgba, AreaFrames, Finder, Target};
use super::{run, End, Options};
use crate::compose::RgbaImage;
use crate::geometry::PhysicalRect;
use crate::state::AppState;
use crate::{editor, output};

/// A scrolling area under the overlay's pointer (PLAN 3K.4).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScrollArea {
    /// Virtual-desktop physical px.
    pub rect: PhysicalRect,
    /// How many screens tall the page is, when UI Automation says.
    pub screens: Option<f64>,
}

/// The answer for the overlay's pointer.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScrollHover {
    pub area: Option<ScrollArea>,
    /// False: the window's app isn't one scrolling capture is offered in.
    pub supported: bool,
    /// Where it is offered, for the overlay to say so.
    pub apps: String,
}

type Job = Box<dyn FnOnce(&mut Worker) + Send>;

struct Worker {
    finder: Option<Finder>,
    /// The area found last, kept for the click that starts the capture.
    last: Option<Target>,
}

fn send(job: Job) {
    static TX: OnceLock<mpsc::Sender<Job>> = OnceLock::new();
    let tx = TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Job>();
        std::thread::spawn(move || {
            // UI Automation and WGC both want COM on this thread.
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            let mut w = Worker {
                finder: Finder::new(),
                last: None,
            };
            for job in rx {
                job(&mut w);
            }
        });
        tx
    });
    let _ = tx.send(job);
}

/// The scrolling area at `point` in the top-level window `root`, quickly
/// (one look; the overlay asks again as the pointer moves). Err if no answer
/// came in time (the worker is busy): that isn't "nothing scrolls here".
pub fn area_at(root: isize, point: (i32, i32)) -> Result<ScrollHover, String> {
    let (tx, rx) = mpsc::channel();
    send(Box::new(move |w| {
        let (hwnd, p) = (
            HWND(root as *mut _),
            POINT {
                x: point.0,
                y: point.1,
            },
        );
        let supported = super::windows::supported(hwnd, p);
        let target = supported
            .then(|| w.finder.as_ref().and_then(|f| f.find(hwnd, p, false)))
            .flatten();
        let area = target.as_ref().map(|t| ScrollArea {
            rect: t.area,
            screens: t.screens,
        });
        w.last = target;
        let _ = tx.send(ScrollHover {
            area,
            supported,
            apps: super::windows::SUPPORTED_NAMES.to_string(),
        });
    }));
    rx.recv_timeout(Duration::from_secs(2))
        .map_err(|_| "no answer in time".to_string())
}

/// Capture the scrolling area at `point` in `root` (the overlay is already
/// gone) and open the result in an editor.
pub fn start(app: &AppHandle, root: isize, point: (i32, i32)) {
    let app = app.clone();
    send(Box::new(move |w| {
        let point = POINT {
            x: point.0,
            y: point.1,
        };
        // The area the overlay showed, if that's where the click was; else
        // look again, patiently this time.
        let hit = |t: &Target| {
            t.root.0 as isize == root
                && point.x >= t.area.x
                && point.x < t.area.x + t.area.width
                && point.y >= t.area.y
                && point.y < t.area.y + t.area.height
        };
        let hwnd = HWND(root as *mut _);
        let target = match w.last.take() {
            Some(t) if hit(&t) => Some(t),
            _ if !super::windows::supported(hwnd, point) => None,
            _ => w.finder.as_ref().and_then(|f| f.find(hwnd, point, true)),
        };
        report(
            &app,
            target.ok_or_else(|| "Nothing scrolls there.".to_string()),
        );
    }));
}

/// Dev builds' `--scroll-at x,y`: the area under that screen point, whatever
/// window is there.
pub fn capture_at(app: &AppHandle, x: i32, y: i32) {
    let app = app.clone();
    send(Box::new(move |_| {
        report(
            &app,
            find_at(POINT { x, y }).ok_or_else(|| "Nothing scrolls there.".to_string()),
        );
    }));
}

fn report(app: &AppHandle, target: Result<Target, String>) {
    if let Err(e) = target.and_then(|t| capture(app, t)) {
        eprintln!("[scroll] failed: {e}");
        output::notify_error(app, "Scrolling capture didn't work", &e);
    }
}

fn capture(app: &AppHandle, target: Target) -> Result<(), String> {
    eprintln!(
        "[scroll] {} at {:?}, frame {:?}, scale {}, {}",
        target.describe,
        target.area,
        target.frame,
        target.scale,
        if target.has_pattern() {
            "UI Automation"
        } else {
            "mouse wheel"
        }
    );
    let stream = app
        .state::<AppState>()
        .window_capturer
        .stream(target.root.0 as isize)
        .map_err(|e| e.to_string())?;
    let mut frames = AreaFrames::new(stream, target.crop());
    let mut scroller = target.scroller();
    let opts = Options {
        params: Params::for_scale(target.scale),
        ..Options::default()
    };
    let stop = Arc::new(AtomicBool::new(false));
    let out = run(scroller.as_mut(), &mut frames, &opts, &stop, |p| {
        eprintln!(
            "[scroll] {} frames, {} px{}",
            p.frames,
            p.height,
            p.fraction
                .map(|f| format!(", {:.0}%", f * 100.0))
                .unwrap_or_default()
        );
    })?;
    eprintln!(
        "[scroll] done: {:?}, {}x{} from {} frames in {} ms",
        out.end,
        out.image.width,
        out.image.height,
        out.frames,
        out.took.as_millis()
    );
    if out.end == End::NoScroll {
        eprintln!("[scroll] the area didn't scroll; opening what was visible");
    }
    let image = RgbaImage {
        width: out.image.width,
        height: out.image.height,
        rgba: to_rgba(&out.image),
    };
    let title = format!("Scrolling capture — {}", crate::product_name(app));
    editor::open_image(app, image, title);
    Ok(())
}
