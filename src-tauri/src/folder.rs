//! Flipping through the open image's folder (PLAN 3Q), like Windows Photos:
//! the images Vandal opens, in Explorer's natural name order, wrapping around
//! at the ends. The folder is listed afresh each time: files come and go.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use windows::core::PCWSTR;
use windows::Win32::UI::Shell::StrCmpLogicalW;

use crate::decode;

/// Which image to go to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FolderStep {
    Previous,
    Next,
    First,
    Last,
}

/// Where an image is among its folder's images, for the status bar ("12 of 41").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderPosition {
    /// 1-based.
    pub index: u32,
    pub count: u32,
}

/// Explorer's name order (`StrCmpLogicalW`): numbers by value ("img2" before
/// "img10"), letters without case.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let a: Vec<u16> = a.encode_utf16().chain(Some(0)).collect();
    let b: Vec<u16> = b.encode_utf16().chain(Some(0)).collect();
    // SAFETY: both are NUL-terminated UTF-16 strings that outlive the call.
    let order = unsafe { StrCmpLogicalW(PCWSTR(a.as_ptr()), PCWSTR(b.as_ptr())) };
    order.cmp(&0)
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| decode::EXTENSIONS.iter().any(|x| e.eq_ignore_ascii_case(x)))
}

fn name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// The images in `file`'s folder (itself included if it's still there), sorted.
pub fn images_beside(file: &Path) -> Vec<PathBuf> {
    let Some(entries) = file.parent().and_then(|dir| std::fs::read_dir(dir).ok()) else {
        return Vec::new();
    };
    let mut images: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .map(|e| e.path())
        .filter(|p| is_image(p))
        .collect();
    images.sort_by(|a, b| natural_cmp(&name(a), &name(b)));
    images
}

/// `Ok(index)` of `current` in the sorted `names`, or `Err(index)` of where it
/// would go (renamed or deleted since it was opened).
fn locate(names: &[String], current: &str) -> Result<usize, usize> {
    match names.iter().position(|n| n.eq_ignore_ascii_case(current)) {
        Some(i) => Ok(i),
        None => Err(names.partition_point(|n| natural_cmp(n, current) == Ordering::Less)),
    }
}

/// The indexes to try for `step` (`by` images along for previous/next, at
/// least 1), best first: the target, then on in the same direction (wrapping)
/// in case it won't open. Never the current image; empty when there's nowhere
/// to go.
fn candidates(count: usize, at: Result<usize, usize>, step: FolderStep, by: usize) -> Vec<usize> {
    if count == 0 {
        return Vec::new();
    }
    let current = at.ok();
    let by = by.max(1) % count;
    let (start, forward) = match (step, at) {
        (FolderStep::Next, Ok(i)) => (i + by, true),
        (FolderStep::Next, Err(i)) => (i + by + count - 1, true),
        (FolderStep::Previous, Ok(i) | Err(i)) => (i + count - by, false),
        (FolderStep::First, _) => (0, true),
        (FolderStep::Last, _) => (count - 1, false),
    };
    let start = start % count;
    // Home on the first image (End on the last) stays put.
    if matches!(step, FolderStep::First | FolderStep::Last) && current == Some(start) {
        return Vec::new();
    }
    (0..count)
        .map(|k| {
            if forward {
                (start + k) % count
            } else {
                (start + count - k) % count
            }
        })
        .filter(|&i| Some(i) != current)
        .collect()
}

/// The images to try for `step` (`by` along) from `current`, best first.
pub fn step_from(current: &Path, step: FolderStep, by: usize) -> Vec<PathBuf> {
    let images = images_beside(current);
    let names: Vec<String> = images.iter().map(|p| name(p)).collect();
    candidates(images.len(), locate(&names, &name(current)), step, by)
        .into_iter()
        .map(|i| images[i].clone())
        .collect()
}

/// Where `file` is among its folder's images; None if it's no longer there.
pub fn position(file: &Path) -> Option<FolderPosition> {
    let names: Vec<String> = images_beside(file).iter().map(|p| name(p)).collect();
    let index = locate(&names, &name(file)).ok()?;
    Some(FolderPosition {
        index: u32::try_from(index + 1).ok()?,
        count: u32::try_from(names.len()).ok()?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn sorts_like_explorer() {
        let mut list = names(&["img10.png", "IMG2.png", "img1.png", "a.jpg", "img2b.png"]);
        list.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(
            list,
            names(&["a.jpg", "img1.png", "IMG2.png", "img2b.png", "img10.png"])
        );
    }

    #[test]
    fn next_and_previous_wrap_around() {
        assert_eq!(candidates(4, Ok(1), FolderStep::Next, 1), [2, 3, 0]);
        assert_eq!(candidates(4, Ok(3), FolderStep::Next, 1), [0, 1, 2]);
        assert_eq!(candidates(4, Ok(1), FolderStep::Previous, 1), [0, 3, 2]);
        assert_eq!(candidates(4, Ok(0), FolderStep::Previous, 1), [3, 2, 1]);
    }

    #[test]
    fn first_and_last_then_onward_if_they_wont_open() {
        assert_eq!(candidates(4, Ok(2), FolderStep::First, 1), [0, 1, 3]);
        assert_eq!(candidates(4, Ok(1), FolderStep::Last, 1), [3, 2, 0]);
        assert!(candidates(4, Ok(0), FolderStep::First, 1).is_empty());
        assert!(candidates(4, Ok(3), FolderStep::Last, 1).is_empty());
    }

    #[test]
    fn presses_that_piled_up_jump_at_once() {
        assert_eq!(candidates(5, Ok(1), FolderStep::Next, 3), [4, 0, 2, 3]);
        assert_eq!(candidates(5, Ok(1), FolderStep::Previous, 3), [3, 2, 0, 4]);
        // A full lap (or more) lands on the next one along.
        assert_eq!(candidates(4, Ok(1), FolderStep::Next, 4)[0], 2);
        assert_eq!(candidates(4, Ok(1), FolderStep::Next, 6)[0], 3);
    }

    #[test]
    fn a_lone_image_goes_nowhere() {
        assert!(candidates(1, Ok(0), FolderStep::Next, 1).is_empty());
        assert!(candidates(0, Err(0), FolderStep::Next, 1).is_empty());
    }

    #[test]
    fn a_renamed_or_deleted_image_steps_from_where_it_was() {
        let list = names(&["a.png", "c.png", "e.png"]);
        let at = locate(&list, "d.png");
        assert_eq!(at, Err(2));
        assert_eq!(candidates(3, at, FolderStep::Next, 1), [2, 0, 1]);
        assert_eq!(candidates(3, at, FolderStep::Previous, 1), [1, 0, 2]);
        assert_eq!(locate(&list, "C.PNG"), Ok(1));
    }

    #[test]
    fn only_formats_vandal_opens() {
        assert!(is_image(Path::new("x/shot.PNG")));
        assert!(is_image(Path::new("x/photo.heic")));
        assert!(!is_image(Path::new("x/notes.txt")));
        assert!(!is_image(Path::new("x/noext")));
    }
}
