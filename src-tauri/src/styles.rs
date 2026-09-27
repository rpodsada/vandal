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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
