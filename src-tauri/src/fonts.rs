//! Installed font families (PLAN Phase 2: `list_fonts`), read once through
//! DirectWrite and cached. The webview has no reliable API for this.

use std::sync::OnceLock;

use windows::core::{w, BOOL};
use windows::Win32::Graphics::DirectWrite::{
    DWriteCreateFactory, IDWriteFactory, IDWriteFontCollection, DWRITE_FACTORY_TYPE_SHARED,
};

static FONTS: OnceLock<Vec<String>> = OnceLock::new();

/// Family names of the installed fonts, sorted case-insensitively. Empty if
/// DirectWrite fails (the picker then offers just the default font).
pub fn list() -> Vec<String> {
    FONTS
        .get_or_init(|| {
            let started = std::time::Instant::now();
            let fonts = enumerate().unwrap_or_else(|e| {
                eprintln!("[fonts] couldn't list fonts: {e}");
                Vec::new()
            });
            eprintln!(
                "[fonts] {} families in {:.1}ms",
                fonts.len(),
                started.elapsed().as_secs_f64() * 1000.0
            );
            fonts
        })
        .clone()
}

fn enumerate() -> windows::core::Result<Vec<String>> {
    // SAFETY: plain COM calls on interfaces DirectWrite hands back; every
    // buffer passed in is sized from the length DirectWrite reports.
    unsafe {
        let factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)?;
        let mut collection: Option<IDWriteFontCollection> = None;
        factory.GetSystemFontCollection(&mut collection, false)?;
        let Some(collection) = collection else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        for i in 0..collection.GetFontFamilyCount() {
            let names = collection.GetFontFamily(i)?.GetFamilyNames()?;
            // The English name is what CSS font-family matches reliably.
            let mut index = 0;
            let mut exists = BOOL(0);
            names.FindLocaleName(w!("en-us"), &mut index, &mut exists)?;
            if !exists.as_bool() {
                index = 0;
            }
            let len = names.GetStringLength(index)? as usize;
            let mut buf = vec![0u16; len + 1];
            names.GetString(index, &mut buf)?;
            out.push(String::from_utf16_lossy(&buf[..len]));
        }
        out.sort_by_key(|s| s.to_lowercase());
        out.dedup();
        Ok(out)
    }
}
