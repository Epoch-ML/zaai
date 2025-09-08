use std::process::Command;
use std::path::Path;

fn main() {
    let mut failed = false;
    
    // Check if running on macOS
    let os_check = Command::new("uname")
        .arg("-s")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    
    if os_check != "Darwin" {
        eprintln!("ERROR: Not running on macOS (found: {})", os_check);
        std::process::exit(1);
    }
    
    // Check for Metal framework
    if !Path::new("/System/Library/Frameworks/Metal.framework").exists() {
        eprintln!("ERROR: Metal framework not found");
        failed = true;
    }
    
    // Check for MetalKit framework
    if !Path::new("/System/Library/Frameworks/MetalKit.framework").exists() {
        eprintln!("ERROR: MetalKit framework not found");
        failed = true;
    }
    
    // Check Rust compiler
    if Command::new("rustc").arg("--version").output().is_err() {
        eprintln!("ERROR: Rust compiler not found");
        failed = true;
    }
    
    // Check Cargo
    if Command::new("cargo").arg("--version").output().is_err() {
        eprintln!("ERROR: Cargo not found");
        failed = true;
    }
    
    // Check for xcrun (needed for Metal shader compilation)
    if Command::new("xcrun").arg("--version").output().is_err() {
        eprintln!("ERROR: xcrun not found - install Xcode Command Line Tools");
        failed = true;
    }
    
    if failed {
        std::process::exit(1);
    }
    
    println!("Environment verified: Metal support available");
    std::process::exit(0);
}