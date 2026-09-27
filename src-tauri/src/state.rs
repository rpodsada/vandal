use std::sync::{Mutex, RwLock};

use crate::capture::Capturer;
use crate::frames::FrameStore;
use crate::geometry::MonitorInfo;
use crate::output::RecentImages;
use crate::protocol::TransferFormat;
use crate::session::{PerfRecord, Session};
use crate::settings::Settings;

pub struct AppState {
    pub capturer: Box<dyn Capturer>,
    pub frames: Mutex<FrameStore>,
    /// Monitors the overlay pool was built for.
    pub monitors: RwLock<Vec<MonitorInfo>>,
    pub settings: RwLock<Settings>,
    /// The capture currently on screen, if any.
    pub session: Mutex<Option<Session>>,
    pub transfer_format: Mutex<TransferFormat>,
    /// Delivered images, for the notification's "Save" button.
    pub recent_images: Mutex<RecentImages>,
    /// Completed sessions, for the benchmark summary.
    pub perf_log: Mutex<Vec<PerfRecord>>,
}
