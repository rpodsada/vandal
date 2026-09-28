//! Style pickers for the markup tools (PLAN Phase 2, "Style controls"): the
//! palette, line width and per-tool overrides, stored in settings. The page
//! renders each picker from its spec; Rust only keeps the specs sane.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

/// At most this many presets per list (keys 1–9 and 0 pick them).
pub const MAX_PRESETS: usize = 10;

/// A number control: a free range, or a list of presets shown as a stepped
/// slider, a dropdown or buttons. Lists are kept ascending.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "control", rename_all = "camelCase")]
pub enum NumberPicker {
    Slider { min: f64, max: f64 },
    Stepped { values: Vec<f64> },
    Dropdown { values: Vec<f64> },
    Buttons { values: Vec<f64> },
}

impl NumberPicker {
    /// Fix what can be fixed (order, duplicates, too many values); `None` if
    /// nothing usable is left.
    fn normalized(self) -> Option<Self> {
        let list = |values: Vec<f64>| {
            let mut v: Vec<f64> = values
                .into_iter()
                .filter(|x| x.is_finite() && *x > 0.0)
                .collect();
            v.sort_by(f64::total_cmp);
            v.dedup();
            v.truncate(MAX_PRESETS);
            (!v.is_empty()).then_some(v)
        };
        match self {
            Self::Slider { min, max } => {
                (min.is_finite() && max.is_finite() && min > 0.0 && max > min)
                    .then_some(Self::Slider { min, max })
            }
            Self::Stepped { values } => list(values).map(|values| Self::Stepped { values }),
            Self::Dropdown { values } => list(values).map(|values| Self::Dropdown { values }),
            Self::Buttons { values } => list(values).map(|values| Self::Buttons { values }),
        }
    }
}

/// How the font picker shows its fonts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FontControl {
    Dropdown,
    /// A stepped slider with the name under it (custom lists of up to 10).
    Stepped,
}

/// Where the font picker's fonts come from.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FontSource {
    /// Every installed font.
    #[default]
    System,
    /// The user's own list, in their order.
    Custom,
}

/// The text tool's font picker. The user's list is kept while `source` is
/// `System`, so switching back brings it back (Richard's call, 2C.3). Files
/// from before 2C.3 (`{"source":"system",...}` without `fonts`) load as is.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct FontPicker {
    pub source: FontSource,
    pub fonts: Vec<String>,
    /// Kept as chosen: the page shows a dropdown whenever a stepped slider
    /// doesn't fit (the system list, or more than 10 fonts).
    pub control: FontControl,
}

impl Default for FontPicker {
    fn default() -> Self {
        Self {
            source: FontSource::System,
            fonts: Vec::new(),
            control: FontControl::Dropdown,
        }
    }
}

impl FontPicker {
    /// Names trimmed, duplicates (ignoring case) and blanks dropped; an empty
    /// custom list means every installed font.
    fn normalized(self) -> Self {
        let mut fonts: Vec<String> = Vec::new();
        for f in self
            .fonts
            .iter()
            .map(|f| f.trim())
            .filter(|f| !f.is_empty())
        {
            if !fonts.iter().any(|o| o.eq_ignore_ascii_case(f)) {
                fonts.push(f.to_string());
            }
        }
        let source = if fonts.is_empty() {
            FontSource::System
        } else {
            self.source
        };
        Self {
            source,
            fonts,
            control: self.control,
        }
    }
}

/// A tool's own palette and/or width picker, used instead of the global ones.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct ToolStyles {
    pub palette: Option<Vec<String>>,
    pub width: Option<NumberPicker>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct Styles {
    /// Color presets in the user's order, `#rrggbb`.
    pub palette: Vec<String>,
    /// Line width in source px.
    pub width: NumberPicker,
    /// The text tool's font.
    pub font: FontPicker,
    /// The text tool's size in pt.
    pub font_size: NumberPicker,
    /// Per-tool overrides, keyed by tool id (`"highlighter"`, ...).
    pub tools: BTreeMap<String, ToolStyles>,
}

impl Default for Styles {
    fn default() -> Self {
        let colors = |c: &[&str]| c.iter().map(|s| s.to_string()).collect();
        Self {
            palette: colors(&[
                "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#000000",
                "#ffffff",
            ]),
            width: NumberPicker::Buttons {
                values: vec![2.0, 4.0, 6.0, 10.0],
            },
            font: FontPicker::default(),
            font_size: NumberPicker::Dropdown {
                values: vec![8.0, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 36.0, 48.0, 72.0],
            },
            tools: BTreeMap::from([(
                "highlighter".to_string(),
                ToolStyles {
                    palette: Some(colors(&[
                        "#ffeb3b", "#76ff03", "#ff4081", "#40c4ff", "#ffab40",
                    ])),
                    width: Some(NumberPicker::Slider {
                        min: 8.0,
                        max: 40.0,
                    }),
                },
            )]),
        }
    }
}

/// `#rgb` or `#rrggbb` (any case) as lowercase `#rrggbb`.
fn normalize_color(c: &str) -> Option<String> {
    let hex = c.trim().strip_prefix('#')?;
    if !hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return None;
    }
    match hex.len() {
        6 => Some(format!("#{}", hex.to_ascii_lowercase())),
        3 => Some(
            hex.chars()
                .flat_map(|ch| [ch, ch])
                .fold(String::from("#"), |mut s, ch| {
                    s.push(ch.to_ascii_lowercase());
                    s
                }),
        ),
        _ => None,
    }
}

/// Valid colors only, no duplicates, at most [`MAX_PRESETS`]; `None` if empty.
fn normalize_palette(palette: Vec<String>) -> Option<Vec<String>> {
    let mut out: Vec<String> = Vec::new();
    for c in palette.iter().filter_map(|c| normalize_color(c)) {
        if !out.contains(&c) && out.len() < MAX_PRESETS {
            out.push(c);
        }
    }
    (!out.is_empty()).then_some(out)
}

impl Styles {
    /// Repair hand-edited or outdated values; anything unusable goes back to
    /// its default (or, for an override, is dropped).
    pub fn normalized(self) -> Self {
        let defaults = Self::default();
        Self {
            palette: normalize_palette(self.palette).unwrap_or(defaults.palette),
            width: self.width.normalized().unwrap_or(defaults.width),
            font: self.font.normalized(),
            font_size: self.font_size.normalized().unwrap_or(defaults.font_size),
            tools: self
                .tools
                .into_iter()
                .map(|(tool, o)| {
                    let o = ToolStyles {
                        palette: o.palette.and_then(normalize_palette),
                        width: o.width.and_then(NumberPicker::normalized),
                    };
                    (tool, o)
                })
                .filter(|(_, o)| o.palette.is_some() || o.width.is_some())
                .collect(),
        }
    }
}

impl Styles {
    /// The presets `tool` uses: its own palette if it has one, else the global one.
    fn palette_mut(&mut self, tool: &str) -> &mut Vec<String> {
        match self.tools.get_mut(tool).and_then(|o| o.palette.as_mut()) {
            Some(own) => own,
            None => &mut self.palette,
        }
    }

    /// Add `color` to the presets `tool` uses (the custom picker's "Save as preset").
    pub fn add_preset(&mut self, tool: &str, color: &str) -> Result<(), String> {
        let color = normalize_color(color).ok_or_else(|| format!("Not a color: {color}"))?;
        let palette = self.palette_mut(tool);
        if palette.contains(&color) {
            return Err("That color is already a preset.".into());
        }
        if palette.len() >= MAX_PRESETS {
            return Err(format!("The palette is full ({MAX_PRESETS} colors)."));
        }
        palette.push(color);
        Ok(())
    }

    /// Change (`Some`) or delete (`None`) preset `index` of the palette `tool`
    /// uses. The last color can't be deleted.
    pub fn edit_preset(
        &mut self,
        tool: &str,
        index: usize,
        color: Option<&str>,
    ) -> Result<(), String> {
        let palette = self.palette_mut(tool);
        if index >= palette.len() {
            return Err("That preset no longer exists.".into());
        }
        match color {
            None if palette.len() == 1 => Err("The palette needs at least one color.".into()),
            None => {
                palette.remove(index);
                Ok(())
            }
            Some(c) => {
                let c = normalize_color(c).ok_or_else(|| format!("Not a color: {c}"))?;
                if palette
                    .iter()
                    .enumerate()
                    .any(|(i, p)| i != index && *p == c)
                {
                    return Err("That color is already a preset.".into());
                }
                palette[index] = c;
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn presets_go_to_the_palette_the_tool_uses() {
        let mut s = Styles::default();
        s.add_preset("pen", "#ABC").unwrap();
        assert_eq!(s.palette.last().unwrap(), "#aabbcc");
        s.add_preset("highlighter", "#123456").unwrap();
        let own = s.tools["highlighter"].palette.as_ref().unwrap();
        assert_eq!(own.last().unwrap(), "#123456");
        assert!(!s.palette.contains(&"#123456".to_string()));

        assert!(s.add_preset("pen", "#aabbcc").is_err()); // already there
        assert!(s.add_preset("pen", "blue").is_err());
        while s.palette.len() < MAX_PRESETS {
            let c = format!("#00000{}", s.palette.len());
            s.add_preset("pen", &c).unwrap();
        }
        assert!(s.add_preset("pen", "#fefefe").is_err()); // full
    }

    #[test]
    fn presets_can_be_changed_and_deleted() {
        let mut s = Styles::default();
        s.edit_preset("pen", 0, Some("#ABCDEF")).unwrap();
        assert_eq!(s.palette[0], "#abcdef");
        // Not onto another preset's color.
        assert!(s
            .edit_preset("pen", 0, Some(&s.palette[1].clone()))
            .is_err());
        let second = s.palette[1].clone();
        s.edit_preset("pen", 0, None).unwrap();
        assert_eq!(s.palette[0], second);
        assert!(s.edit_preset("pen", 99, None).is_err());

        s.edit_preset("highlighter", 0, None).unwrap();
        assert_eq!(s.tools["highlighter"].palette.as_ref().unwrap().len(), 4);
        s.palette = vec!["#000000".into()];
        assert!(s.edit_preset("pen", 0, None).is_err()); // the last one stays
    }

    #[test]
    fn default_shape_matches_plan() {
        let v = serde_json::to_value(Styles::default()).unwrap();
        assert_eq!(v["palette"][0], "#e53935");
        assert_eq!(
            v["width"],
            json!({ "control": "buttons", "values": [2.0, 4.0, 6.0, 10.0] })
        );
        assert_eq!(
            v["tools"]["highlighter"]["width"],
            json!({ "control": "slider", "min": 8.0, "max": 40.0 })
        );
        assert_eq!(Styles::default().normalized(), Styles::default());
    }

    #[test]
    fn lists_are_sorted_deduped_and_capped() {
        let p = NumberPicker::Dropdown {
            values: vec![6.0, 2.0, 2.0, -1.0, f64::NAN, 4.0],
        };
        assert_eq!(
            p.normalized(),
            Some(NumberPicker::Dropdown {
                values: vec![2.0, 4.0, 6.0]
            })
        );
        let many = NumberPicker::Buttons {
            values: (1..=15).map(f64::from).collect(),
        };
        let Some(NumberPicker::Buttons { values }) = many.normalized() else {
            panic!()
        };
        assert_eq!(values.len(), MAX_PRESETS);
        assert!(NumberPicker::Stepped { values: vec![] }
            .normalized()
            .is_none());
        assert!(NumberPicker::Slider { min: 5.0, max: 5.0 }
            .normalized()
            .is_none());
    }

    #[test]
    fn font_pickers_are_normalized() {
        let custom = FontPicker {
            source: FontSource::Custom,
            fonts: vec![
                " Arial ".into(),
                "arial".into(),
                "".into(),
                "Georgia".into(),
            ],
            control: FontControl::Stepped,
        };
        assert_eq!(
            custom.normalized(),
            FontPicker {
                source: FontSource::Custom,
                fonts: vec!["Arial".into(), "Georgia".into()],
                control: FontControl::Stepped,
            }
        );
        // No fonts left: every installed font.
        let empty = FontPicker {
            source: FontSource::Custom,
            fonts: vec![" ".into()],
            control: FontControl::Stepped,
        };
        assert_eq!(empty.normalized().source, FontSource::System);
        // The list is kept while the system fonts are in use.
        let parked = FontPicker {
            source: FontSource::System,
            fonts: vec!["Georgia".into()],
            control: FontControl::Dropdown,
        };
        assert_eq!(parked.clone().normalized(), parked);

        let v = serde_json::to_value(Styles::default()).unwrap();
        assert_eq!(
            v["font"],
            json!({ "source": "system", "fonts": [], "control": "dropdown" })
        );
        assert_eq!(v["fontSize"]["values"][6], 20.0);
    }

    #[test]
    fn font_pickers_from_before_2c3_load() {
        let system: FontPicker =
            serde_json::from_value(json!({ "source": "system", "control": "dropdown" })).unwrap();
        assert_eq!(system, FontPicker::default());
        let custom: FontPicker = serde_json::from_value(
            json!({ "source": "custom", "fonts": ["Georgia"], "control": "stepped" }),
        )
        .unwrap();
        assert_eq!(custom.source, FontSource::Custom);
        assert_eq!(custom.fonts, ["Georgia"]);
        assert_eq!(custom.control, FontControl::Stepped);
    }

    #[test]
    fn colors_are_normalized() {
        assert_eq!(normalize_color("#ABC").as_deref(), Some("#aabbcc"));
        assert_eq!(normalize_color(" #1E88E5 ").as_deref(), Some("#1e88e5"));
        assert_eq!(normalize_color("red"), None);
        assert_eq!(normalize_color("#12345"), None);
        let p = normalize_palette(vec!["#fff".into(), "#FFFFFF".into(), "nope".into()]);
        assert_eq!(p, Some(vec!["#ffffff".to_string()]));
    }

    #[test]
    fn unusable_values_fall_back() {
        let s = Styles {
            palette: vec!["x".into()],
            width: NumberPicker::Buttons { values: vec![] },
            tools: BTreeMap::from([(
                "pen".to_string(),
                ToolStyles {
                    palette: Some(vec![]),
                    width: None,
                },
            )]),
            ..Styles::default()
        }
        .normalized();
        let d = Styles::default();
        assert_eq!(s.palette, d.palette);
        assert_eq!(s.width, d.width);
        assert!(
            s.tools.is_empty(),
            "an override with nothing left is dropped"
        );
    }
}
