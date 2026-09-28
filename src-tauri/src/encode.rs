//! Writing an edited image file back (PLAN 2D): in the original's format when
//! we can, through WIC (PNG goes through the `png` crate like every other
//! save). Formats WIC has no encoder for (WebP, HEIC, AVIF) and ones where a
//! plain rewrite would lose what they are (GIF palettes/animation, ICO sizes)
//! are read-only: saving one goes to Save As, as PNG.
//!
//! Files are written beside the target and then renamed over it, so a failed
//! save never leaves a half-written original. Metadata (EXIF...) isn't kept;
//! the pixels are already upright, so no orientation tag is needed.

use std::path::{Path, PathBuf};

use windows::core::{GUID, HSTRING, PWSTR};
use windows::Win32::Foundation::GENERIC_WRITE;
use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_ContainerFormatBmp, GUID_ContainerFormatJpeg,
    GUID_ContainerFormatTiff, GUID_WICPixelFormat24bppBGR, GUID_WICPixelFormat32bppBGRA,
    GUID_WICPixelFormat32bppRGBA, IWICImagingFactory, WICBitmapEncoderNoCache,
};
use windows::Win32::System::Com::StructuredStorage::{IPropertyBag2, PROPBAG2};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::System::Variant::{VARIANT, VT_R4};

use crate::compose::RgbaImage;
use crate::output;

/// JPEG quality for saves over a JPEG (WIC's 0–1 scale).
const JPEG_QUALITY: f32 = 0.92;

/// A format we can write back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileFormat {
    Png,
    Jpeg,
    Bmp,
    Tiff,
}

impl FileFormat {
    /// The format for `path`'s extension, if we can write it.
    pub fn for_path(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?.to_ascii_lowercase();
        match ext.as_str() {
            "png" => Some(Self::Png),
            "jpg" | "jpeg" | "jpe" | "jfif" => Some(Self::Jpeg),
            "bmp" | "dib" => Some(Self::Bmp),
            "tif" | "tiff" => Some(Self::Tiff),
            _ => None,
        }
    }

    /// Save-dialog filter: a name and its extensions (the first is the default).
    pub fn filter(self) -> (&'static str, &'static [&'static str]) {
        match self {
            Self::Png => ("PNG image", &["png"]),
            Self::Jpeg => ("JPEG image", &["jpg", "jpeg"]),
            Self::Bmp => ("BMP image", &["bmp"]),
            Self::Tiff => ("TIFF image", &["tif", "tiff"]),
        }
    }

    pub const ALL: [Self; 4] = [Self::Png, Self::Jpeg, Self::Bmp, Self::Tiff];

    /// Keeps transparency (the others are flattened onto white).
    fn has_alpha(self) -> bool {
        matches!(self, Self::Png | Self::Tiff)
    }
}

/// Write `image` to `path` as `format`, replacing any file there only once
/// the new one is complete.
pub fn write_file(image: &RgbaImage, path: &Path, format: FileFormat) -> Result<(), String> {
    let started = std::time::Instant::now();
    let flat;
    let image = if format.has_alpha() {
        image
    } else {
        flat = flatten_on_white(image);
        &flat
    };
    let temp = temp_path(path);
    let written = match format {
        FileFormat::Png => output::write_png(image, &temp),
        _ => write_wic(image, &temp, format).map_err(|e| e.message()),
    };
    if let Err(e) = written.and_then(|_| std::fs::rename(&temp, path).map_err(|e| e.to_string())) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("Couldn't save {}: {e}", path.display()));
    }
    eprintln!(
        "[encode] {format:?} {}×{} → {} in {:.1}ms",
        image.width,
        image.height,
        path.display(),
        started.elapsed().as_secs_f64() * 1000.0
    );
    Ok(())
}

/// `name.ext` → `name.ext.saving` beside it (same folder, so the rename
/// is a plain replace).
fn temp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".saving");
    path.with_file_name(name)
}

/// `image` composited onto white, fully opaque.
pub fn flatten_on_white(image: &RgbaImage) -> RgbaImage {
    let mut rgba = image.rgba.clone();
    for p in rgba.chunks_exact_mut(4) {
        let a = u32::from(p[3]);
        for c in &mut p[..3] {
            *c = ((u32::from(*c) * a + 255 * (255 - a) + 127) / 255) as u8;
        }
        p[3] = 255;
    }
    RgbaImage {
        width: image.width,
        height: image.height,
        rgba,
    }
}

fn write_wic(image: &RgbaImage, path: &Path, format: FileFormat) -> windows::core::Result<()> {
    let (container, mut pixel_format): (GUID, GUID) = match format {
        FileFormat::Jpeg => (GUID_ContainerFormatJpeg, GUID_WICPixelFormat24bppBGR),
        FileFormat::Bmp => (GUID_ContainerFormatBmp, GUID_WICPixelFormat24bppBGR),
        _ => (GUID_ContainerFormatTiff, GUID_WICPixelFormat32bppBGRA),
    };
    // SAFETY: COM calls on interfaces WIC hands back; the source bitmap
    // borrows `image.rgba`, whose size matches the width, height and stride
    // given, and lives until the frame is committed.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
        let stream = factory.CreateStream()?;
        stream.InitializeFromFilename(&HSTRING::from(path.as_os_str()), GENERIC_WRITE.0)?;
        let encoder = factory.CreateEncoder(&container, std::ptr::null())?;
        encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
        let mut frame = None;
        let mut options: Option<IPropertyBag2> = None;
        encoder.CreateNewFrame(&mut frame, &mut options)?;
        let frame = frame.ok_or_else(windows::core::Error::empty)?;
        if let (FileFormat::Jpeg, Some(options)) = (format, &options) {
            set_quality(options, JPEG_QUALITY)?;
        }
        frame.Initialize(options.as_ref())?;
        frame.SetSize(image.width, image.height)?;
        frame.SetPixelFormat(&mut pixel_format)?;
        let source = factory.CreateBitmapFromMemory(
            image.width,
            image.height,
            &GUID_WICPixelFormat32bppRGBA,
            image.width * 4,
            &image.rgba,
        )?;
        // Converts to the frame's pixel format.
        frame.WriteSource(&source, std::ptr::null())?;
        frame.Commit()?;
        encoder.Commit()?;
        // Releasing the stream closes the file (before the rename).
    }
    Ok(())
}

/// The JPEG encoder's "ImageQuality" option.
unsafe fn set_quality(options: &IPropertyBag2, quality: f32) -> windows::core::Result<()> {
    let mut name: Vec<u16> = "ImageQuality\0".encode_utf16().collect();
    let prop = PROPBAG2 {
        pstrName: PWSTR(name.as_mut_ptr()),
        ..Default::default()
    };
    let mut value = VARIANT::default();
    let inner = &mut *value.Anonymous.Anonymous;
    inner.vt = VT_R4;
    inner.Anonymous.fltVal = quality;
    options.Write(1, &prop, &value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_by_extension() {
        let f = |p: &str| FileFormat::for_path(Path::new(p));
        assert_eq!(f(r"C:\a\shot.PNG"), Some(FileFormat::Png));
        assert_eq!(f("photo.jpeg"), Some(FileFormat::Jpeg));
        assert_eq!(f("photo.JFIF"), Some(FileFormat::Jpeg));
        assert_eq!(f("scan.tif"), Some(FileFormat::Tiff));
        assert_eq!(f("old.dib"), Some(FileFormat::Bmp));
        // Read-only: no encoder, or a rewrite would lose what the file is.
        for p in ["a.webp", "a.heic", "a.avif", "a.gif", "a.ico", "noext"] {
            assert_eq!(f(p), None, "{p}");
        }
    }

    #[test]
    fn flattening_blends_onto_white() {
        let image = RgbaImage {
            width: 3,
            height: 1,
            rgba: vec![
                200, 0, 0, 255, // opaque: unchanged
                0, 0, 0, 0, // clear: white
                0, 0, 0, 128, // half black: mid grey
            ],
        };
        let flat = flatten_on_white(&image);
        assert_eq!(
            flat.rgba,
            vec![200, 0, 0, 255, 255, 255, 255, 255, 127, 127, 127, 255]
        );
    }

    #[test]
    fn temp_file_sits_beside_the_target() {
        assert_eq!(
            temp_path(Path::new(r"C:\pics\cat.jpg")),
            PathBuf::from(r"C:\pics\cat.jpg.saving")
        );
    }
}
