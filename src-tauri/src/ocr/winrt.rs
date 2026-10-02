//! [`TextRecognizer`] on Windows' own OCR (`Windows.Media.Ocr`, PLAN 3J): no
//! download, word-level boxes, the languages Windows has OCR packs for. The
//! spike that chose it is in `internal/ideas.md` › Smart redact.

use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::DataWriter;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use super::{build_lines, pad_to, OcrError, OcrLine, Placement, RawBox, TextRecognizer};
use crate::compose::{shrink_to_fit, RgbaImage};

/// The engine finds nothing in an image under 40 px either way; pad to this.
const MIN_SIZE: u32 = 48;

#[derive(Default)]
pub struct WindowsOcr;

impl TextRecognizer for WindowsOcr {
    fn name(&self) -> &'static str {
        "windows-ocr"
    }

    fn recognize(&self, image: &RgbaImage) -> Result<Vec<OcrLine>, OcrError> {
        // WinRT needs the thread in an apartment; already being in one is fine.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let engine = engine()?;
        // Larger images (a very wide multi-monitor capture) are recognized
        // shrunk to fit, smaller ones padded; the boxes go back to `image`.
        let max = OcrEngine::MaxImageDimension().map_err(OcrError::failed)?;
        let small = shrink_to_fit(image, max);
        let shrunk = small.as_ref().unwrap_or(image);
        let padded = pad_to(shrunk, MIN_SIZE);
        let (input, offset) = padded
            .as_ref()
            .map_or((shrunk, (0, 0)), |(p, offset)| (p, *offset));
        let at = Placement {
            scale: (
                f64::from(shrunk.width) / f64::from(image.width),
                f64::from(shrunk.height) / f64::from(image.height),
            ),
            offset,
        };
        let result = engine
            .RecognizeAsync(&bitmap(input)?)
            .and_then(|op| op.join())
            .map_err(OcrError::failed)?;
        let mut raw = Vec::new();
        for line in &result.Lines().map_err(OcrError::failed)? {
            let mut words = Vec::new();
            for word in &line.Words().map_err(OcrError::failed)? {
                let b = word.BoundingRect().map_err(OcrError::failed)?;
                let text = word.Text().map_err(OcrError::failed)?.to_string();
                words.push((
                    text,
                    RawBox {
                        x: b.X,
                        y: b.Y,
                        width: b.Width,
                        height: b.Height,
                    },
                ));
            }
            raw.push(words);
        }
        Ok(build_lines(raw, at))
    }
}

/// An engine for the user's languages. Windows gives none when no OCR
/// language pack matches them.
fn engine() -> Result<OcrEngine, OcrError> {
    let available = OcrEngine::AvailableRecognizerLanguages()
        .and_then(|l| l.Size())
        .map_err(OcrError::failed)?;
    if available == 0 {
        return Err(OcrError::NoLanguage);
    }
    OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| OcrError::NoLanguage)
}

/// Our straight RGBA as the BGRA bitmap the engine reads, alpha ignored.
fn bitmap(image: &RgbaImage) -> Result<SoftwareBitmap, OcrError> {
    let bgra: Vec<u8> = image
        .rgba
        .chunks_exact(4)
        .flat_map(|p| [p[2], p[1], p[0], 255])
        .collect();
    let writer = DataWriter::new().map_err(OcrError::failed)?;
    writer.WriteBytes(&bgra).map_err(OcrError::failed)?;
    let buffer = writer.DetachBuffer().map_err(OcrError::failed)?;
    SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        image.width as i32,
        image.height as i32,
        BitmapAlphaMode::Ignore,
    )
    .map_err(OcrError::failed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> RgbaImage {
        let png = include_bytes!("testdata/line.png");
        let mut reader = png::Decoder::new(std::io::Cursor::new(&png[..]))
            .read_info()
            .unwrap();
        let mut rgba = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut rgba).unwrap();
        assert_eq!(info.color_type, png::ColorType::Rgba);
        RgbaImage {
            width: info.width,
            height: info.height,
            rgba,
        }
    }

    /// Needs a Windows OCR language: `cargo test -- --ignored ocr`.
    #[test]
    #[ignore]
    fn reads_a_line_of_ui_text() {
        let image = fixture();
        let lines = WindowsOcr.recognize(&image).unwrap();
        let words: Vec<&str> = lines
            .iter()
            .flat_map(|l| l.words.iter().map(|w| w.text.as_str()))
            .collect();
        assert_eq!(lines.len(), 1, "{words:?}");
        assert!(
            words.contains(&"styles") && words.contains(&"editor."),
            "{words:?}"
        );
        let bounds =
            crate::geometry::PhysicalRect::new(0, 0, image.width as i32, image.height as i32);
        for w in &lines[0].words {
            assert_eq!(w.rect.intersect(&bounds), Some(w.rect), "{w:?}");
        }
        // Left to right.
        let xs: Vec<i32> = lines[0].words.iter().map(|w| w.rect.x).collect();
        assert!(xs.windows(2).all(|p| p[0] < p[1]), "{xs:?}");
    }
}
