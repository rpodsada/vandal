fn main() {
    // tauri-build embeds the exe icon but only reruns when tauri.conf.json or
    // capabilities change, so a new icon would otherwise ship the old one.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build()
}
