//! Copying images (PLAN 3H.3). An image goes on the clipboard twice: as
//! "PNG", with its transparency, for the apps that read it (browsers, chat
//! apps, Office), and as a DIB flattened onto white for the apps that ignore
//! alpha (Paint and older apps), which would otherwise show a window
//! capture's transparent corners as black. Windows derives the other bitmap
//! formats from the DIB. Pasting still goes through arboard
//! (`output::paste_image`).

use std::time::Duration;

use windows::core::w;
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

use crate::compose::RgbaImage;
use crate::encode::flatten_on_white;
use crate::output;

/// `CF_DIB`: a BITMAPINFOHEADER followed by the pixels.
const CF_DIB: u32 = 8;
/// Another app may hold the clipboard for a moment.
const OPEN_TRIES: u32 = 10;
const OPEN_RETRY: Duration = Duration::from_millis(15);

pub fn set_image(image: &RgbaImage) -> Result<(), String> {
    let mut png = Vec::new();
    output::write_png_to(image, &mut png)?;
    let dib = dib_on_white(image);

    let _open = Open::new()?;
    unsafe {
        EmptyClipboard().map_err(|e| format!("Couldn't empty the clipboard: {e}"))?;
        // PNG first: some apps take the first image format they find.
        put(RegisterClipboardFormatW(w!("PNG")), &png)?;
        put(CF_DIB, &dib)
    }
}

/// The clipboard, open until dropped.
struct Open;

impl Open {
    fn new() -> Result<Self, String> {
        let mut last = None;
        for _ in 0..OPEN_TRIES {
            match unsafe { OpenClipboard(None) } {
                Ok(()) => return Ok(Self),
                Err(e) => last = Some(e),
            }
            std::thread::sleep(OPEN_RETRY);
        }
        Err(format!(
            "The clipboard is busy: {}",
            last.map_or_else(String::new, |e| e.to_string())
        ))
    }
}

impl Drop for Open {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

/// Hand `bytes` to the clipboard as `format`; it owns the memory afterwards.
unsafe fn put(format: u32, bytes: &[u8]) -> Result<(), String> {
    let memory: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, bytes.len())
        .map_err(|e| format!("Out of memory for the clipboard: {e}"))?;
    let target = GlobalLock(memory);
    if target.is_null() {
        let _ = GlobalFree(Some(memory));
        return Err("Couldn't fill the clipboard.".into());
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), target.cast::<u8>(), bytes.len());
    let _ = GlobalUnlock(memory);
    if let Err(e) = SetClipboardData(format, Some(HANDLE(memory.0))) {
        let _ = GlobalFree(Some(memory));
        return Err(format!("Couldn't copy to the clipboard: {e}"));
    }
    Ok(())
}

/// A 24-bit bottom-up DIB of `image` composited onto white. 24-bit rather
/// than 32: some apps read a 32-bit DIB's spare byte as alpha.
fn dib_on_white(image: &RgbaImage) -> Vec<u8> {
    const HEADER: usize = 40;
    let flat = flatten_on_white(image);
    let (w, h) = (image.width as usize, image.height as usize);
    // Rows are padded to a multiple of 4 bytes.
    let stride = (w * 3).div_ceil(4) * 4;
    let mut dib = Vec::with_capacity(HEADER + stride * h);
    dib.extend_from_slice(&(HEADER as u32).to_le_bytes()); // biSize
    dib.extend_from_slice(&(w as i32).to_le_bytes()); // biWidth
    dib.extend_from_slice(&(h as i32).to_le_bytes()); // biHeight: bottom-up
    dib.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    dib.extend_from_slice(&24u16.to_le_bytes()); // biBitCount
    dib.extend_from_slice(&0u32.to_le_bytes()); // biCompression: BI_RGB
    dib.extend_from_slice(&((stride * h) as u32).to_le_bytes()); // biSizeImage
    dib.extend_from_slice(&[0; 16]); // resolution, palette: unused
    for row in flat.rgba.chunks_exact(w * 4).rev() {
        let start = dib.len();
        for p in row.chunks_exact(4) {
            dib.extend_from_slice(&[p[2], p[1], p[0]]);
        }
        dib.resize(start + stride, 0);
    }
    dib
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dib_is_bottom_up_padded_and_flattened_onto_white() {
        // 2×2: top row red then fully transparent, bottom row half-transparent
        // black then opaque blue.
        let image = RgbaImage {
            width: 2,
            height: 2,
            rgba: vec![255, 0, 0, 255, 9, 9, 9, 0, 0, 0, 0, 128, 0, 0, 255, 255],
        };
        let dib = dib_on_white(&image);
        assert_eq!(&dib[..4], &40u32.to_le_bytes());
        assert_eq!(&dib[4..12], &[2, 0, 0, 0, 2, 0, 0, 0]);
        assert_eq!(&dib[14..16], &24u16.to_le_bytes());
        // 2 px × 3 bytes = 6, padded to 8 per row.
        assert_eq!(&dib[20..24], &16u32.to_le_bytes());
        assert_eq!(dib.len(), 40 + 16);
        let rows = &dib[40..];
        // Bottom row first, BGR: grey (black at half over white), blue.
        assert_eq!(&rows[..8], &[127, 127, 127, 255, 0, 0, 0, 0]);
        // Then the top row: red, and white where it was transparent.
        assert_eq!(&rows[8..], &[0, 0, 255, 255, 255, 255, 0, 0]);
    }
}
