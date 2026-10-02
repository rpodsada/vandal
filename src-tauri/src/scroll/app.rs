//! Running a scrolling capture from the app (PLAN 3K.3). For now only the
//! dev-build `--scroll-at x,y` argument starts one; the overlay's S mode
//! (3K.4) and the capturing UI (3K.5) come next.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::POINT;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use super::stitch::Params;
use super::windows::{find_at, to_rgba, AreaFrames};
use super::{run, End, Options};
use crate::compose::RgbaImage;
use crate::state::AppState;
use crate::{editor, output};

/// Capture the scrolling area under the screen point `(x, y)` (physical px)
/// and open the result in an editor. Runs on a thread of its own.
pub fn capture_at(app: &AppHandle, x: i32, y: i32) {
    let app = app.clone();
    std::thread::spawn(move || {
        // UI Automation and WGC both want COM on this thread.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        if let Err(e) = capture(&app, POINT { x, y }) {
            eprintln!("[scroll] failed: {e}");
            output::notify_error(&app, "Scrolling capture didn't work", &e);
        }
    });
}

fn capture(app: &AppHandle, point: POINT) -> Result<(), String> {
    let target = find_at(point).ok_or("Nothing scrolls there.")?;
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
