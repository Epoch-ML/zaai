#!/usr/bin/env python3
"""
Strudel REPL cleanup orchestrator.
Tears down the REPL server and cleans up resources.
"""

import os
import sys
import signal
import logging
import shutil
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
L = logging.getLogger(__name__)

# Default port for Strudel REPL
STRUDEL_PORT = 7777


def get_script_dir():
    return Path(__file__).parent.absolute()


def stop_repl_server(runtime_dir: Path) -> bool:
    pid_file = runtime_dir / "server.pid"

    if not pid_file.exists():
        L.warning("No PID file found, server might not be running")
        return False

    try:
        with open(pid_file, 'r') as f:
            pid = int(f.read().strip())

        L.info(f"Stopping REPL server (PID: {pid})...")

        try:
            os.killpg(pid, signal.SIGTERM)
            time.sleep(2)
            try:
                os.kill(pid, 0)
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                L.info("Server stopped gracefully")
        except ProcessLookupError:
            L.info("Server was not running")
        except PermissionError:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

        pid_file.unlink()
        return True
    except Exception as e:
        L.error(f"Error stopping server: {e}")
        return False


def cleanup_runtime_directory(runtime_dir: Path):
    if runtime_dir.exists():
        L.info(f"Removing runtime directory: {runtime_dir}")
        try:
            shutil.rmtree(runtime_dir)
            L.info("✅ Runtime directory removed")
        except Exception as e:
            L.warning(f"Could not remove runtime directory: {e}")


def cleanup_temp_files():
    L.info("Cleaning up temporary files...")
    temp_files = ["/tmp/strudel-repl-config.json"]
    for file_path in temp_files:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                L.info(f"Removed: {file_path}")
            except Exception as e:
                L.warning(f"Could not remove {file_path}: {e}")


def check_port_status(port: int = STRUDEL_PORT):
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', port))
    sock.close()

    if result == 0:
        L.warning(f"Port {port} is still in use")
        return True  # Port in use
    else:
        L.info(f"✅ Port {port} is free")
        return False  # Port free


def kill_process_on_port(port: int = STRUDEL_PORT):
    """Kill any process using the specified port."""
    import subprocess
    import platform
    
    L.info(f"Looking for processes on port {port}...")
    
    try:
        if platform.system() == "Darwin":  # macOS
            # Use lsof to find PIDs
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True,
                text=True
            )
            pids = result.stdout.strip().split('\n')
            pids = [p for p in pids if p]
            
            for pid in pids:
                try:
                    L.info(f"Killing process {pid} on port {port}")
                    os.kill(int(pid), signal.SIGKILL)
                except (ProcessLookupError, ValueError):
                    pass
                    
        elif platform.system() == "Linux":
            # Use fuser
            result = subprocess.run(
                ["fuser", "-k", f"{port}/tcp"],
                capture_output=True,
                text=True
            )
            L.info(f"fuser output: {result.stderr}")
            
        else:  # Windows or other
            # Try netstat approach
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True,
                text=True,
                shell=True
            )
            for line in result.stdout.split('\n'):
                if f":{port}" in line and "LISTEN" in line:
                    parts = line.split()
                    if parts:
                        pid = parts[-1]
                        try:
                            os.kill(int(pid), signal.SIGKILL)
                        except:
                            pass
                            
        # Wait a moment for port to be released
        time.sleep(0.5)
        
        # Verify
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        
        if result == 0:
            L.warning(f"Port {port} still in use after kill attempt")
            return False
        else:
            L.info(f"✅ Port {port} is now free")
            return True
            
    except Exception as e:
        L.error(f"Error killing process on port {port}: {e}")
        return False


def main():
    L.info("=== Strudel REPL Cleanup ===")

    script_dir = get_script_dir()
    runtime_dir = script_dir / "strudel-repl-runtime"

    # Try to stop via PID file first
    if runtime_dir.exists():
        stop_repl_server(runtime_dir)
    else:
        L.info("Runtime directory does not exist")

    time.sleep(0.5)
    
    # Check if port is still in use, kill if so
    if check_port_status(STRUDEL_PORT):
        L.info("Port still in use, force killing...")
        kill_process_on_port(STRUDEL_PORT)
    
    cleanup_runtime_directory(runtime_dir)
    cleanup_temp_files()

    L.info("\n✅ Strudel REPL cleanup complete!")
    return 0


if __name__ == "__main__":
    sys.exit(main())