//! GDI `BitBlt` capture backend.

use std::ffi::c_void;
use std::mem::size_of;
use std::time::Instant;

use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GdiFlush, GetDC,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS,
    HBITMAP, HDC, HGDIOBJ, SRCCOPY,
};

use super::{CaptureError, CaptureTiming, Capturer, MonitorFrame};
use crate::geometry::MonitorInfo;

pub struct GdiCapturer;

impl Capturer for GdiCapturer {
    fn name(&self) -> &'static str {
        "gdi"
    }

    fn capture_all(
        &self,
        monitors: &[MonitorInfo],
    ) -> Result<(Vec<MonitorFrame>, CaptureTiming), CaptureError> {
        let screen = ScreenDc::get()?;
        let mem = MemDc::new(screen.0)?;
        let mut timing = CaptureTiming::default();

        // Blit every monitor first so all grabs happen as close to the hotkey as
        // possible, then copy out of the DIBs.
        let mut dibs = Vec::with_capacity(monitors.len());
        for m in monitors {
            let t = Instant::now();
            let b = m.physical_bounds;
            let dib = Dib::new(mem.0, b.width, b.height)?;
            unsafe {
                let old = SelectObject(mem.0, dib.handle.into());
                // CAPTUREBLT includes layered windows (many menus/tooltips are layered).
                let res = BitBlt(
                    mem.0,
                    0,
                    0,
                    b.width,
                    b.height,
                    Some(screen.0),
                    b.x,
                    b.y,
                    SRCCOPY | CAPTUREBLT,
                );
                SelectObject(mem.0, old);
                res?;
            }
            timing.grab.push(t.elapsed());
            dibs.push(dib);
        }

        let t = Instant::now();
        unsafe {
            let _ = GdiFlush();
        }
        let frames = monitors
            .iter()
            .zip(&dibs)
            .map(|(m, dib)| MonitorFrame {
                monitor: m.clone(),
                width: m.physical_bounds.width as u32,
                height: m.physical_bounds.height as u32,
                bgra: dib.bytes().to_vec(),
                has_alpha: false,
            })
            .collect();
        timing.copy = t.elapsed();

        Ok((frames, timing))
    }
}

struct ScreenDc(HDC);

impl ScreenDc {
    fn get() -> Result<Self, CaptureError> {
        let dc = unsafe { GetDC(None) };
        if dc.is_invalid() {
            return Err(CaptureError("GetDC(NULL) failed".into()));
        }
        Ok(Self(dc))
    }
}

impl Drop for ScreenDc {
    fn drop(&mut self) {
        unsafe {
            ReleaseDC(None, self.0);
        }
    }
}

struct MemDc(HDC);

impl MemDc {
    fn new(screen: HDC) -> Result<Self, CaptureError> {
        let dc = unsafe { CreateCompatibleDC(Some(screen)) };
        if dc.is_invalid() {
            return Err(CaptureError("CreateCompatibleDC failed".into()));
        }
        Ok(Self(dc))
    }
}

impl Drop for MemDc {
    fn drop(&mut self) {
        unsafe {
            let _ = DeleteDC(self.0);
        }
    }
}

/// A top-down 32bpp DIB section whose pixel memory we can read directly.
struct Dib {
    handle: HBITMAP,
    bits: *const u8,
    len: usize,
}

impl Dib {
    fn new(dc: HDC, width: i32, height: i32) -> Result<Self, CaptureError> {
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // negative = top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut c_void = std::ptr::null_mut();
        let handle =
            unsafe { CreateDIBSection(Some(dc), &info, DIB_RGB_COLORS, &mut bits, None, 0)? };
        if bits.is_null() {
            unsafe {
                let _ = DeleteObject(HGDIOBJ::from(handle));
            }
            return Err(CaptureError("CreateDIBSection returned no bits".into()));
        }
        Ok(Self {
            handle,
            bits: bits as *const u8,
            len: width as usize * height as usize * 4,
        })
    }

    fn bytes(&self) -> &[u8] {
        // SAFETY: `bits` points to `len` bytes owned by `handle`, which outlives `self`.
        unsafe { std::slice::from_raw_parts(self.bits, self.len) }
    }
}

impl Drop for Dib {
    fn drop(&mut self) {
        unsafe {
            let _ = DeleteObject(HGDIOBJ::from(self.handle));
        }
    }
}
