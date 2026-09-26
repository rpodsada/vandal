use std::sync::{Mutex, RwLock};

use crate::capture::Capturer;
use crate::frames::FrameStore;
use crate::geometry::MonitorInfo;
use crate::protocol::TransferFormat;
use crate::session::{PerfRecord, Session};

pub struct AppState {
    pub capturer: Box<dyn Capturer>,
    pub frames: Mutex<FrameStore>,
    /// Monitors the overlay pool was built for.
    pub monitors: RwLock<Vec<MonitorInfo>>,
    /// The capture currently on screen, if any.
    pub session: Mutex<Option<Session>>,
    pub transfer_format: Mutex<TransferFormat>,
    /// Completed sessions, for the benchmark summary.
    pub perf_log: Mutex<Vec<PerfRecord>>,
}
