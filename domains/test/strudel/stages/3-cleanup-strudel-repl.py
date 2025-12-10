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


def check_port_status(port: int = 3333):
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', port))
    sock.close()

    if result == 0:
        L.warning(f"Port {port} is still in use")
    else:
        L.info(f"✅ Port {port} is free")


def main():
    L.info("=== Strudel REPL Cleanup ===")

    script_dir = get_script_dir()
    runtime_dir = script_dir / "strudel-repl-runtime"

    if runtime_dir.exists():
        stop_repl_server(runtime_dir)
    else:
        L.info("Runtime directory does not exist")

    time.sleep(1)
    cleanup_runtime_directory(runtime_dir)
    cleanup_temp_files()
    check_port_status(3333)

    L.info("\n✅ Strudel REPL cleanup complete!")
    return 0


if __name__ == "__main__":
    sys.exit(main())