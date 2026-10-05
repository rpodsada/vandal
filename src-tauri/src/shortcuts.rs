//! The markup's customizable shortcuts (PLAN 3F): a key for each tool and for
//! swapping colors, used by quick edit and the editor. Unlike the capture
//! hotkeys they aren't global, so Windows never sees them.
//!
//! A shortcut is a letter, alone or with Ctrl, Alt and Shift (`"V"`,
//! `"Ctrl+Shift+L"`). Never Win (global shortcuts), never digits (they pick
//! sizes, colors and fonts), never Ctrl+Alt (AltGr, which types characters),
//! and never one of the markup's fixed shortcuts ([`FIXED`]).

use serde::{Deserialize, Serialize};
use specta::Type;

/// Human-readable, e.g. `"V"` or `"Ctrl+L"`. `None` = no shortcut.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Shortcuts {
    pub select: Option<String>,
    pub pen: Option<String>,
    pub highlighter: Option<String>,
    pub line: Option<String>,
    pub arrow: Option<String>,
    pub rect: Option<String>,
    pub ellipse: Option<String>,
    pub text: Option<String>,
    pub callout: Option<String>,
    pub redact: Option<String>,
    pub spotlight: Option<String>,
    pub step: Option<String>,
    /// The editor's crop.
    pub crop: Option<String>,
    /// Swap the two colors (PLAN 3D.15).
    pub swap_colors: Option<String>,
}

impl Default for Shortcuts {
    fn default() -> Self {
        let key = |k: &str| Some(k.to_string());
        Self {
            select: key("V"),
            pen: key("P"),
            highlighter: key("H"),
            line: key("L"),
            arrow: key("A"),
            rect: key("R"),
            ellipse: key("E"),
            text: key("T"),
            // C is the editor's crop: "call-O-ut".
            callout: key("O"),
            redact: key("B"),
            spotlight: key("S"),
            step: key("N"),
            crop: key("C"),
            swap_colors: key("X"),
        }
    }
}

/// The markup's fixed shortcuts with letters, which no customizable one may
/// take. Kept in step with `useMarkupKeys.ts`, `EditorApp.tsx` and
/// `OverlayApp.tsx`.
pub const FIXED: &[(&str, &str)] = &[
    ("Ctrl+Z", "Undo"),
    ("Ctrl+Shift+Z", "Redo"),
    ("Ctrl+Y", "Redo"),
    ("Ctrl+R", "Redo"),
    ("Ctrl+A", "Select all"),
    ("Ctrl+D", "Duplicate"),
    ("Ctrl+B", "Bold"),
    ("Ctrl+I", "Italic"),
    ("Ctrl+C", "Copy"),
    ("Ctrl+Shift+C", "Copy objects"),
    ("Ctrl+V", "Paste"),
    ("Ctrl+S", "Save"),
    ("Ctrl+Shift+S", "Save as"),
    ("Ctrl+E", "Open in editor"),
    ("Ctrl+W", "Close the editor"),
    ("Ctrl+N", "New capture"),
    ("Ctrl+O", "Open an image"),
];

impl Shortcuts {
    /// Each shortcut with what it does, for messages.
    fn entries_mut(&mut self) -> [(&'static str, &mut Option<String>); 14] {
        [
            ("Select", &mut self.select),
            ("Pen", &mut self.pen),
            ("Highlighter", &mut self.highlighter),
            ("Line", &mut self.line),
            ("Arrow", &mut self.arrow),
            ("Rectangle", &mut self.rect),
            ("Ellipse", &mut self.ellipse),
            ("Text", &mut self.text),
            ("Callout", &mut self.callout),
            ("Redact", &mut self.redact),
            ("Spotlight", &mut self.spotlight),
            ("Step", &mut self.step),
            ("Crop", &mut self.crop),
            ("Swap colors", &mut self.swap_colors),
        ]
    }

    /// Spelled the one way (`Ctrl+Alt+Shift+K`), or why one can't work.
    pub fn checked(mut self) -> Result<Self, String> {
        let mut seen: Vec<(String, &'static str)> = Vec::new();
        for (name, value) in self.entries_mut() {
            let Some(raw) = value.as_deref() else {
                continue;
            };
            if raw.trim().is_empty() {
                *value = None;
                continue;
            }
            let combo = check_one(raw).map_err(|e| format!("{name}: {e}"))?;
            if let Some((_, other)) = seen.iter().find(|(c, _)| *c == combo) {
                return Err(format!("{combo} is set for both {other} and {name}."));
            }
            seen.push((combo.clone(), name));
            *value = Some(combo);
        }
        Ok(self)
    }
}

/// One shortcut spelled the one way, or why it can't be one (not counting
/// other tools using it).
pub fn check_one(raw: &str) -> Result<String, String> {
    let combo = normalize(raw)?;
    match FIXED.iter().find(|(f, _)| *f == combo) {
        Some((_, what)) => Err(format!("{combo} is Vandal's shortcut for {what}.")),
        None => Ok(combo),
    }
}

/// `"shift + ctrl + l"` → `"Ctrl+Shift+L"`.
fn normalize(raw: &str) -> Result<String, String> {
    let parts: Vec<&str> = raw.split('+').map(str::trim).collect();
    let (key, mods) = parts.split_last().expect("split yields one part");
    let (mut ctrl, mut alt, mut shift) = (false, false, false);
    for m in mods {
        match m.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => ctrl = true,
            "alt" => alt = true,
            "shift" => shift = true,
            "win" | "windows" | "super" | "meta" => {
                return Err("Win is kept for shortcuts that work anywhere in Windows.".into())
            }
            _ => return Err(format!("{raw} isn't a shortcut.")),
        }
    }
    if ctrl && alt {
        return Err("Ctrl+Alt types characters on many keyboards (it's AltGr).".into());
    }
    let mut chars = key.chars();
    let letter = match (chars.next(), chars.next()) {
        (Some(c), None) if c.is_ascii_alphabetic() => c.to_ascii_uppercase(),
        (Some(c), None) if c.is_ascii_digit() => {
            return Err("Number keys pick sizes, colors and fonts.".into())
        }
        _ => return Err("Use a letter, alone or with Ctrl, Alt or Shift.".into()),
    };
    let mut out = String::new();
    for (held, name) in [(ctrl, "Ctrl+"), (alt, "Alt+"), (shift, "Shift+")] {
        if held {
            out.push_str(name);
        }
    }
    out.push(letter);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        assert_eq!(Shortcuts::default().checked(), Ok(Shortcuts::default()));
    }

    #[test]
    fn spells_one_way() {
        assert_eq!(normalize("shift + ctrl + l").unwrap(), "Ctrl+Shift+L");
        assert_eq!(normalize("alt+x").unwrap(), "Alt+X");
        assert_eq!(normalize("v").unwrap(), "V");
    }

    #[test]
    fn refuses_what_cant_work() {
        assert!(normalize("Win+L").is_err());
        assert!(normalize("Ctrl+Alt+L").is_err());
        assert!(normalize("Ctrl+1").is_err());
        assert!(normalize("F5").is_err());
        assert!(normalize("Hyper+L").is_err());
        assert!(normalize("").is_err());
    }

    #[test]
    fn refuses_fixed_and_repeated() {
        let s = Shortcuts {
            pen: Some("ctrl+z".into()),
            ..Shortcuts::default()
        };
        assert!(s.checked().unwrap_err().contains("Undo"));
        let s = Shortcuts {
            pen: Some("L".into()),
            ..Shortcuts::default()
        };
        assert!(s.checked().unwrap_err().contains("Line"));
    }

    #[test]
    fn clears_blanks() {
        let s = Shortcuts {
            pen: Some(" ".into()),
            ..Shortcuts::default()
        };
        assert_eq!(s.checked().unwrap().pen, None);
    }
}
