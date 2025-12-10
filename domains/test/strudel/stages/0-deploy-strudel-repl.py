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

# Default port for Strudel REPL
STRUDEL_PORT = 7777


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

    # Use copytree to copy everything including subdirectories
    if runtime_dir.exists():
        shutil.rmtree(runtime_dir)
    
    shutil.copytree(source_dir, runtime_dir)
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


def start_repl_server(runtime_dir: Path, runtime: str, port: int = STRUDEL_PORT):
    """Start the Strudel REPL server."""
    L.info("Starting Strudel REPL server...")

    # Use dev mode for hot reloading
    if runtime == 'bun':
        cmd = ['bun', '--watch', 'server.js']
    else:
        cmd = ['node', '--watch', 'server.js']

    log_file = runtime_dir / "server.log"

    env = os.environ.copy()
    env['NODE_ENV'] = 'development'  # Enable livereload
    env['PORT'] = str(port)

    with open(log_file, 'w') as log:
        process = subprocess.Popen(
            cmd,
            cwd=runtime_dir,
            stdout=log,
            stderr=subprocess.STDOUT,
            env=env,
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


def open_browser(port: int = STRUDEL_PORT):
    """Open browser to the REPL UI in a new window."""
    import webbrowser
    L.info("Opening browser to REPL UI...")
    # new=1 opens a new window, new=2 opens a tab
    webbrowser.open(f'http://localhost:{port}', new=1)


def main():
    L.info("=== Strudel REPL Deployment ===")

    port = STRUDEL_PORT

    # Check port
    if not check_port_availability(port):
        L.error(f"Port {port} is already in use")
        return 1

    # Detect runtime
    runtime, version = detect_runtime()
    if not runtime:
        L.error("No JavaScript runtime found. Please install Node.js or Bun.")
        return 1

    # Setup paths
    script_dir = get_script_dir()
    runtime_dir = script_dir / "strudel-repl-runtime"

    # Stop any existing server
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

    # Copy server files from strudel-repl/
    if not copy_repl_files(runtime_dir):
        L.error("Failed to copy REPL files")
        return 1

    # Install dependencies
    if not install_dependencies(runtime_dir, runtime):
        L.error("Failed to install dependencies")
        return 1

    # Start server
    process = start_repl_server(runtime_dir, runtime, port)
    if not process:
        L.error("Failed to start REPL server")
        return 1

    # Wait for server
    if not wait_for_server(f"http://localhost:{port}"):
        L.error("REPL server did not become ready")
        return 1

    # Open browser to REPL UI
    open_browser(port)

    # Create config file
    config = {
        "repl_url": f"http://localhost:{port}",
        "ws_url": f"ws://localhost:{port}/ws",
        "runtime": runtime,
        "runtime_version": version,
        "pid": process.pid,
        "runtime_dir": str(runtime_dir),
        "port": port
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
    L.info(f"REPL URL: http://localhost:{port}")
    L.info(f"WebSocket: ws://localhost:{port}/ws")
    L.info(f"Runtime: {runtime} {version}")
    L.info(f"Server PID: {process.pid}")
    L.info(f"Config: {config_path}")

    # Set environment variables
    os.environ['STRUDEL_REPL_URL'] = f"http://localhost:{port}"
    os.environ['STRUDEL_WS_URL'] = f"ws://localhost:{port}/ws"

    return 0


if __name__ == "__main__":
    sys.exit(main())