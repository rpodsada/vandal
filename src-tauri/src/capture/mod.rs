//! Screen capture behind a trait so backends can be swapped (GDI → DXGI/WGC)
//! without touching the rest of the app (PLAN §1.6).

pub mod cutout;
pub mod gdi;
pub mod wgc;

use std::fmt;
use std::time::Duration;

use crate::geometry::MonitorInfo;

/// One monitor's pixels at capture time.
pub struct MonitorFrame {
    pub monitor: MonitorInfo,
    pub width: u32,
    pub height: u32,
    /// Top-down BGRA, stride = `width * 4`. Unless `has_alpha`, the alpha
    /// byte is undefined (GDI leaves it 0) and the image is opaque.
    pub bgra: Vec<u8>,
    /// Straight alpha that means something: a window capture (PLAN 3H.2),
    /// stored as a one-frame capture laid over the window's own rect.
    pub has_alpha: bool,
}

impl fmt::Debug for MonitorFrame {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MonitorFrame")
            .field("monitor", &self.monitor.index)
            .field("width", &self.width)
            .field("height", &self.height)
            .finish_non_exhaustive()
    }
}

/// Per-capture timing breakdown for the perf log.
#[derive(Debug, Default, Clone)]
pub struct CaptureTiming {
    /// Time spent grabbing pixels, per monitor (index order).
    pub grab: Vec<Duration>,
    /// Time spent copying out of the backend's buffers, all monitors.
    pub copy: Duration,
}

#[derive(Debug)]
pub struct CaptureError(pub String);

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CaptureError {}

impl From<windows::core::Error> for CaptureError {
    fn from(e: windows::core::Error) -> Self {
        Self(e.to_string())
    }
}

/// One window's pixels: top-down straight-alpha BGRA, stride = `width * 4`.
pub struct WindowImage {
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
    /// Frames received while the picture settled, and how long that took.
    pub frames: u32,
    pub settle: Duration,
}

/// Captures a single window's own pixels, wherever it's covered.
pub trait WindowCapturer: Send + Sync {
    fn name(&self) -> &'static str;

    /// Get ready ahead of the first capture (slow setup off the hot path).
    fn prepare(&self) {}

    /// Capture `hwnd` once its picture has settled (it may be repainting,
    /// e.g. as it becomes the active window).
    fn capture_window(&self, hwnd: isize) -> Result<WindowImage, CaptureError>;

    /// Start watching `hwnd`. Use it on the thread that made it.
    fn stream(&self, hwnd: isize) -> Result<Box<dyn WindowStream>, CaptureError>;
}

/// A window watched over time (scrolling capture, PLAN 3K): frames arrive as
/// the window changes.
pub trait WindowStream {
    /// The window's picture once it settles: wait up to `first` for it to
    /// change, then until it hasn't changed for `quiet`, `cap` at most. If
    /// nothing changes, the last picture again.
    fn settled(
        &mut self,
        first: Duration,
        quiet: Duration,
        cap: Duration,
    ) -> Result<WindowImage, CaptureError>;
}

pub trait Capturer: Send + Sync {
    fn name(&self) -> &'static str;

    /// Grab every monitor. Must not show, focus or otherwise disturb any window.
    fn capture_all(
        &self,
        monitors: &[MonitorInfo],
    ) -> Result<(Vec<MonitorFrame>, CaptureTiming), CaptureError>;
}
