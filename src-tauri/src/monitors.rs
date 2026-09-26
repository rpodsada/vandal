//! Monitor enumeration and DPI-awareness checks (Win32).

use std::mem::size_of;

use windows::core::BOOL;
use windows::Win32::Foundation::{HANDLE, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::UI::HiDpi::{
    AreDpiAwarenessContextsEqual, GetDpiAwarenessContextForProcess, GetDpiForMonitor,
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, MDT_EFFECTIVE_DPI,
};
use windows::Win32::UI::WindowsAndMessaging::MONITORINFOF_PRIMARY;

use crate::geometry::{MonitorInfo, PhysicalRect};

/// All monitors, sorted left-to-right then top-to-bottom, indexed in that order.
///
/// Bounds are only physical if the process is Per-Monitor V2 DPI aware; see
/// [`is_per_monitor_v2`].
pub fn enumerate() -> windows::core::Result<Vec<MonitorInfo>> {
    let mut handles: Vec<HMONITOR> = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            None,
            None,
            Some(collect_monitor),
            LPARAM(&mut handles as *mut Vec<HMONITOR> as isize),
        )
        .ok()?;
    }

    let mut monitors = Vec::with_capacity(handles.len());
    for hmon in handles {
        let mut info = MONITORINFOEXW {
            monitorInfo: MONITORINFO {
                cbSize: size_of::<MONITORINFOEXW>() as u32,
                ..Default::default()
            },
            ..Default::default()
        };
        let (mut dpi_x, mut dpi_y) = (96u32, 96u32);
        unsafe {
            GetMonitorInfoW(hmon, &mut info.monitorInfo).ok()?;
            GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y)?;
        }
        let name_len = info
            .szDevice
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(info.szDevice.len());
        monitors.push(MonitorInfo {
            index: 0,
            name: String::from_utf16_lossy(&info.szDevice[..name_len]),
            physical_bounds: rect(info.monitorInfo.rcMonitor),
            work_area: rect(info.monitorInfo.rcWork),
            scale_factor: f64::from(dpi_x) / 96.0,
            is_primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
        });
    }

    monitors.sort_by_key(|m| (m.physical_bounds.x, m.physical_bounds.y));
    for (i, m) in monitors.iter_mut().enumerate() {
        m.index = i as u32;
    }
    Ok(monitors)
}

unsafe extern "system" fn collect_monitor(
    hmon: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    data: LPARAM,
) -> BOOL {
    let handles = &mut *(data.0 as *mut Vec<HMONITOR>);
    handles.push(hmon);
    true.into()
}

fn rect(r: RECT) -> PhysicalRect {
    PhysicalRect::from_ltrb(r.left, r.top, r.right, r.bottom)
}

/// PLAN §4.4: the process must be Per-Monitor V2 DPI aware, otherwise Windows
/// virtualizes coordinates and captures come out scaled/misaligned.
pub fn is_per_monitor_v2() -> bool {
    unsafe {
        let ctx = GetDpiAwarenessContextForProcess(HANDLE::default());
        AreDpiAwarenessContextsEqual(ctx, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2).as_bool()
    }
}
