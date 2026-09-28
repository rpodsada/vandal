//! Image files → RGBA for the editor (PLAN 2D), through Windows Imaging
//! Component. WIC already ships decoders for PNG, JPEG, BMP, GIF, TIFF and
//! ICO, plus WebP, HEIC and AVIF when their Windows codecs are installed, so
//! there's nothing to bundle.
//!
//! The result is 8-bit straight-alpha RGBA (higher bit depths are converted),
//! turned upright per the EXIF orientation. Embedded color profiles are not
//! applied: pixels are taken as sRGB.

use std::path::Path;

use windows::core::{w, HSTRING};
use windows::Win32::Foundation::GENERIC_READ;
use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_ContainerFormatIco, GUID_WICPixelFormat32bppRGBA,
    IWICBitmapDecoder, IWICBitmapFrameDecode, IWICImagingFactory, WICConvertBitmapSource,
    WICDecodeMetadataCacheOnDemand,
};
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PROPVARIANT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::System::Variant::VT_UI2;

use crate::compose::RgbaImage;

/// What the Open dialog offers. Anything else WIC can decode still opens
/// (dropped, or through "All files").
pub const EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "jpe", "jfif", "bmp", "dib", "gif", "tif", "tiff", "ico", "webp", "heic",
    "heif", "avif",
];

/// Larger images are refused: 100 MP is 400 MB as RGBA, before the editor's
/// own copies.
pub const MAX_PIXELS: u64 = 100_000_000;

/// No decoder for this format (`WINCODEC_ERR_COMPONENTNOTFOUND`).
const NO_DECODER: i32 = 0x8898_2F50_u32 as i32;
/// Not an image WIC recognises (`WINCODEC_ERR_UNKNOWNIMAGEFORMAT`).
const UNKNOWN_FORMAT: i32 = 0x8898_2F07_u32 as i32;

/// Decode the image at `path`: the first frame (the largest one for icons),
/// upright. Errors are sentences for the user.
pub fn decode_file(path: &Path) -> Result<RgbaImage, String> {
    let started = std::time::Instant::now();
    let (image, orientation) = decode_wic(path).map_err(|e| describe(path, &e))?;
    let image = orient(image, orientation);
    eprintln!(
        "[decode] {} {}×{} (orientation {orientation}) in {:.1}ms",
        path.display(),
        image.width,
        image.height,
        started.elapsed().as_secs_f64() * 1000.0
    );
    Ok(image)
}

enum DecodeError {
    Wic(windows::core::Error),
    TooLarge(u32, u32),
}

impl From<windows::core::Error> for DecodeError {
    fn from(e: windows::core::Error) -> Self {
        Self::Wic(e)
    }
}

fn describe(path: &Path, e: &DecodeError) -> String {
    let name = path.file_name().map_or_else(
        || path.display().to_string(),
        |n| n.to_string_lossy().into_owned(),
    );
    match e {
        DecodeError::TooLarge(w, h) => format!(
            "{name} is too large to open ({w}×{h}; the limit is {} megapixels).",
            MAX_PIXELS / 1_000_000
        ),
        DecodeError::Wic(e) if e.code().0 == NO_DECODER || e.code().0 == UNKNOWN_FORMAT => {
            format!("{name} isn't an image format Windows can open.")
        }
        DecodeError::Wic(e) => format!("Couldn't open {name}: {}", e.message()),
    }
}

fn decode_wic(path: &Path) -> Result<(RgbaImage, u16), DecodeError> {
    // SAFETY: COM calls on interfaces WIC hands back; the pixel buffer is
    // sized from the frame's own dimensions and the stride passed with it.
    unsafe {
        // Fine if this thread already has COM (either model): WIC is
        // free-threaded.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
        let decoder = factory.CreateDecoderFromFilename(
            &HSTRING::from(path.as_os_str()),
            None,
            GENERIC_READ,
            WICDecodeMetadataCacheOnDemand,
        )?;
        let frame = pick_frame(&decoder)?;
        let (mut width, mut height) = (0, 0);
        frame.GetSize(&mut width, &mut height)?;
        if u64::from(width) * u64::from(height) > MAX_PIXELS {
            return Err(DecodeError::TooLarge(width, height));
        }
        let orientation = orientation(&frame);
        let rgba = WICConvertBitmapSource(&GUID_WICPixelFormat32bppRGBA, &frame)?;
        let stride = width * 4;
        let mut pixels = vec![0u8; stride as usize * height as usize];
        rgba.CopyPixels(std::ptr::null(), stride, &mut pixels)?;
        let image = RgbaImage {
            width,
            height,
            rgba: pixels,
        };
        Ok((image, orientation))
    }
}

/// The first frame, except for icons, whose frames are the same picture at
/// several sizes: the largest.
unsafe fn pick_frame(decoder: &IWICBitmapDecoder) -> windows::core::Result<IWICBitmapFrameDecode> {
    if decoder.GetContainerFormat()? != GUID_ContainerFormatIco {
        return decoder.GetFrame(0);
    }
    let mut best: Option<(u64, IWICBitmapFrameDecode)> = None;
    for i in 0..decoder.GetFrameCount()? {
        let frame = decoder.GetFrame(i)?;
        let (mut w, mut h) = (0, 0);
        frame.GetSize(&mut w, &mut h)?;
        let area = u64::from(w) * u64::from(h);
        if best.as_ref().is_none_or(|(a, _)| area > *a) {
            best = Some((area, frame));
        }
    }
    match best {
        Some((_, frame)) => Ok(frame),
        None => decoder.GetFrame(0),
    }
}

/// The EXIF orientation (1–8), or 1 when there is none.
unsafe fn orientation(frame: &IWICBitmapFrameDecode) -> u16 {
    let Ok(reader) = frame.GetMetadataQueryReader() else {
        return 1;
    };
    // The policy name covers most formats; the raw paths are JPEG's and TIFF's.
    let queries = [
        w!("System.Photo.Orientation"),
        w!("/app1/ifd/{ushort=274}"),
        w!("/ifd/{ushort=274}"),
    ];
    for query in queries {
        let mut value = PROPVARIANT::default();
        if reader.GetMetadataByName(query, &mut value).is_ok() {
            let inner = &value.Anonymous.Anonymous;
            let found = (inner.vt == VT_UI2).then(|| inner.Anonymous.uiVal);
            let _ = PropVariantClear(&mut value);
            if let Some(o @ 1..=8) = found {
                return o;
            }
        }
    }
    1
}

/// Turn a decoded image upright per its EXIF `orientation` (1–8; anything
/// else is left alone).
pub fn orient(image: RgbaImage, orientation: u16) -> RgbaImage {
    if !(2..=8).contains(&orientation) {
        return image;
    }
    let (w, h) = (image.width as usize, image.height as usize);
    // 5–8 swap width and height.
    let (ow, oh) = if orientation >= 5 { (h, w) } else { (w, h) };
    let mut out = vec![0u8; image.rgba.len()];
    for y in 0..oh {
        for x in 0..ow {
            // The source pixel that lands at (x, y).
            let (sx, sy) = match orientation {
                2 => (w - 1 - x, y),
                3 => (w - 1 - x, h - 1 - y),
                4 => (x, h - 1 - y),
                5 => (y, x),
                6 => (y, h - 1 - x),
                7 => (w - 1 - y, h - 1 - x),
                _ => (w - 1 - y, x),
            };
            let (s, d) = ((sy * w + sx) * 4, (y * ow + x) * 4);
            out[d..d + 4].copy_from_slice(&image.rgba[s..s + 4]);
        }
    }
    RgbaImage {
        width: ow as u32,
        height: oh as u32,
        rgba: out,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 3×2 image whose pixels are numbered 0–5 (in the red channel):
    /// ```text
    /// 0 1 2
    /// 3 4 5
    /// ```
    fn numbered() -> RgbaImage {
        RgbaImage {
            width: 3,
            height: 2,
            rgba: (0..6u8).flat_map(|n| [n, 0, 0, 255]).collect(),
        }
    }

    fn layout(image: &RgbaImage) -> (u32, u32, Vec<u8>) {
        let reds = image.rgba.chunks(4).map(|p| p[0]).collect();
        (image.width, image.height, reds)
    }

    #[test]
    fn upright_and_unknown_are_unchanged() {
        assert_eq!(
            layout(&orient(numbered(), 1)),
            (3, 2, vec![0, 1, 2, 3, 4, 5])
        );
        assert_eq!(
            layout(&orient(numbered(), 0)),
            (3, 2, vec![0, 1, 2, 3, 4, 5])
        );
        assert_eq!(
            layout(&orient(numbered(), 9)),
            (3, 2, vec![0, 1, 2, 3, 4, 5])
        );
    }

    #[test]
    fn mirrors_and_half_turn() {
        assert_eq!(
            layout(&orient(numbered(), 2)),
            (3, 2, vec![2, 1, 0, 5, 4, 3])
        );
        assert_eq!(
            layout(&orient(numbered(), 3)),
            (3, 2, vec![5, 4, 3, 2, 1, 0])
        );
        assert_eq!(
            layout(&orient(numbered(), 4)),
            (3, 2, vec![3, 4, 5, 0, 1, 2])
        );
    }

    #[test]
    fn quarter_turns_swap_the_size() {
        // 6: stored rotated 90° counter-clockwise, so turn it clockwise.
        assert_eq!(
            layout(&orient(numbered(), 6)),
            (2, 3, vec![3, 0, 4, 1, 5, 2])
        );
        // 8: the other way.
        assert_eq!(
            layout(&orient(numbered(), 8)),
            (2, 3, vec![2, 5, 1, 4, 0, 3])
        );
    }

    #[test]
    fn transpose_and_transverse() {
        assert_eq!(
            layout(&orient(numbered(), 5)),
            (2, 3, vec![0, 3, 1, 4, 2, 5])
        );
        assert_eq!(
            layout(&orient(numbered(), 7)),
            (2, 3, vec![5, 2, 4, 1, 3, 0])
        );
    }
}
