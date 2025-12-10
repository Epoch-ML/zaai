#!/usr/bin/env python3
"""
Strudel REPL deployment orchestrator.
Spins up a minimal Strudel REPL web server for testing patterns.
"""

import os
import sys
import json
import time
import logging
import subprocess
import signal
import shutil
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
L = logging.getLogger(__name__)


def get_script_dir():
    """Get the directory where this script is located."""
    return Path(__file__).parent.absolute()


def check_port_availability(port):
    """Check if a port is available."""
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', port))
    sock.close()
    return result != 0


def detect_runtime():
    """Detect available JavaScript runtime (Bun preferred, then Node)."""
    # Check for Bun first (faster)
    try:
        result = subprocess.run(['bun', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            version = result.stdout.strip()
            L.info(f"Found Bun {version}")
            return 'bun', version
    except FileNotFoundError:
        pass

    # Fall back to Node.js
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            version = result.stdout.strip()
            L.info(f"Found Node.js {version}")
            return 'node', version
    except FileNotFoundError:
        pass

    return None, None


def copy_repl_files(runtime_dir: Path):
    """Copy the Strudel REPL server files from source directory."""
    L.info("Copying Strudel REPL server files...")

    source_dir = get_script_dir() / "strudel-repl"

    if not source_dir.exists():
        L.error(f"Source directory not found: {source_dir}")
        L.error("Expected strudel-repl/ folder with server.js and package.json")
        return False

    runtime_dir.mkdir(parents=True, exist_ok=True)

    # Copy all files from source
    for item in source_dir.iterdir():
        if item.is_file():
            dest = runtime_dir / item.name
            shutil.copy2(item, dest)
            L.debug(f"Copied {item.name}")

    L.info(f"✅ Copied REPL files to {runtime_dir}")
    return True


def install_dependencies(runtime_dir: Path, runtime: str):
    """Install npm dependencies."""
    L.info("Installing dependencies...")

    cmd = ['bun', 'install'] if runtime == 'bun' else ['npm', 'install']

    try:
        result = subprocess.run(
            cmd,
            cwd=runtime_dir,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            L.error(f"Dependency installation failed: {result.stderr}")
            return False

        L.info("✅ Dependencies installed")
        return True

    except subprocess.TimeoutExpired:
        L.error("Dependency installation timed out")
        return False
    except Exception as e:
        L.error(f"Failed to install dependencies: {e}")
        return False


def start_repl_server(runtime_dir: Path, runtime: str):
    """Start the Strudel REPL server."""
    L.info("Starting Strudel REPL server...")

    cmd = ['bun', 'run', 'server.js'] if runtime == 'bun' else ['node', 'server.js']

    log_file = runtime_dir / "server.log"

    with open(log_file, 'w') as log:
        process = subprocess.Popen(
            cmd,
            cwd=runtime_dir,
            stdout=log,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid if sys.platform != 'win32' else None
        )

    # Save PID
    pid_file = runtime_dir / "server.pid"
    with open(pid_file, 'w') as f:
        f.write(str(process.pid))

    L.info(f"REPL server started with PID: {process.pid}")

    # Wait for server to start
    time.sleep(2)

    if process.poll() is not None:
        L.error("REPL server failed to start")
        with open(log_file, 'r') as log:
            L.error(f"Server log: {log.read()}")
        return None

    return process


def wait_for_server(url: str, timeout: int = 30):
    """Wait for the server to be ready."""
    L.info(f"Waiting for server at {url}...")

    import urllib.request
    import urllib.error

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(f"{url}/health", timeout=2) as response:
                if response.status == 200:
                    L.info("✅ REPL server is ready!")
                    return True
        except (urllib.error.URLError, ConnectionRefusedError):
            pass
        time.sleep(1)

    L.error(f"Server did not become ready within {timeout} seconds")
    return False


def open_browser_if_visual():
    """Open browser if visual mode is enabled."""
    if os.environ.get('STRUDEL_VISUAL', '0') == '1':
        import webbrowser
        L.info("Opening browser (visual mode enabled)...")
        webbrowser.open('http://localhost:3333')


def main():
    L.info("=== Strudel REPL Deployment ===")

    # Check port
    if not check_port_availability(3333):
        L.error("Port 3333 is already in use")
        return 1

    # Detect runtime
    runtime, version = detect_runtime()
    if not runtime:
        L.error("No JavaScript runtime found. Please install Node.js or Bun.")
        return 1

    # Setup paths
    script_dir = get_script_dir()
    runtime_dir = script_dir / "strudel-repl-runtime"

    # Clean up existing
    if runtime_dir.exists():
        pid_file = runtime_dir / "server.pid"
        if pid_file.exists():
            try:
                with open(pid_file) as f:
                    old_pid = int(f.read())
                os.killpg(old_pid, signal.SIGTERM)
                L.info(f"Stopped old server (PID: {old_pid})")
            except:
                pass
        shutil.rmtree(runtime_dir)

    # Copy server files from strudel-repl/
    if not copy_repl_files(runtime_dir):
        L.error("Failed to copy REPL files")
        return 1

    # Install dependencies
    if not install_dependencies(runtime_dir, runtime):
        L.error("Failed to install dependencies")
        return 1

    # Start server
    process = start_repl_server(runtime_dir, runtime)
    if not process:
        L.error("Failed to start REPL server")
        return 1

    # Wait for server
    if not wait_for_server("http://localhost:3333"):
        L.error("REPL server did not become ready")
        return 1

    # Open browser if visual mode
    open_browser_if_visual()

    # Create config file
    config = {
        "repl_url": "http://localhost:3333",
        "ws_url": "ws://localhost:3333/ws",
        "runtime": runtime,
        "runtime_version": version,
        "pid": process.pid,
        "runtime_dir": str(runtime_dir)
    }

    config_path = runtime_dir / "config.json"
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)

    # Also save to /tmp for other stages
    tmp_config = Path("/tmp/strudel-repl-config.json")
    with open(tmp_config, 'w') as f:
        json.dump(config, f, indent=2)

    L.info("\n" + "=" * 50)
    L.info("✅ Strudel REPL Deployment Complete!")
    L.info("=" * 50)
    L.info(f"REPL URL: http://localhost:3333")
    L.info(f"WebSocket: ws://localhost:3333/ws")
    L.info(f"Runtime: {runtime} {version}")
    L.info(f"Server PID: {process.pid}")
    L.info(f"Config: {config_path}")

    # Set environment variables
    os.environ['STRUDEL_REPL_URL'] = "http://localhost:3333"
    os.environ['STRUDEL_WS_URL'] = "ws://localhost:3333/ws"

    return 0


if __name__ == "__main__":
    sys.exit(main())