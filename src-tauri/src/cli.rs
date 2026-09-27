//! Command-line arguments, for a first launch and for the ones a second
//! launch forwards to the running app.

use std::path::{Path, PathBuf};

/// The files to open from `--edit <path>` arguments (any number), made
/// absolute against `cwd`: a forwarded launch ran in its own directory.
pub fn edit_paths(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if arg == "--edit" {
            if let Some(path) = args.next() {
                paths.push(cwd.join(path));
            }
        }
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn finds_every_edit_path() {
        let cwd = Path::new(r"C:\work");
        let got = edit_paths(
            &args(&[
                "app.exe",
                "--edit",
                "a.png",
                "--settings",
                "--edit",
                r"D:\b.jpg",
            ]),
            cwd,
        );
        assert_eq!(
            got,
            [PathBuf::from(r"C:\work\a.png"), PathBuf::from(r"D:\b.jpg")]
        );
    }

    #[test]
    fn edit_without_a_path_is_ignored() {
        assert!(edit_paths(&args(&["app.exe", "--edit"]), Path::new(".")).is_empty());
        assert!(edit_paths(&args(&["app.exe"]), Path::new(".")).is_empty());
    }
}
