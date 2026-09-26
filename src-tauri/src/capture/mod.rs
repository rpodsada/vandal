//! Screen capture behind a trait so backends can be swapped (GDI → DXGI/WGC)
//! without touching the rest of the app (PLAN §1.6).

pub mod gdi;

use std::fmt;
use std::time::Duration;

use crate::geometry::MonitorInfo;

/// One monitor's pixels at capture time.
pub struct MonitorFrame {
    pub monitor: MonitorInfo,
    pub width: u32,
    pub height: u32,
    /// Top-down BGRA, stride = `width * 4`. The alpha byte is undefined (GDI
    /// leaves it 0); consumers must treat the image as opaque.
    pub bgra: Vec<u8>,
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

pub trait Capturer: Send + Sync {
    fn name(&self) -> &'static str;

    /// Grab every monitor. Must not show, focus or otherwise disturb any window.
    fn capture_all(
        &self,
        monitors: &[MonitorInfo],
    ) -> Result<(Vec<MonitorFrame>, CaptureTiming), CaptureError>;
}
