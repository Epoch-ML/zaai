#!/usr/bin/env python3
"""
Verify Strudel REPL connection and basic functionality.
"""

import os
import sys
import json
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
L = logging.getLogger(__name__)

# Default port for Strudel REPL
STRUDEL_PORT = 7777


def load_config():
    """Load REPL configuration."""
    possible_paths = [
        Path("/tmp/strudel-repl-config.json"),
        Path(__file__).parent / "strudel-repl-runtime" / "config.json",
    ]

    for config_path in possible_paths:
        if config_path.exists():
            L.info(f"Found config at: {config_path}")
            with open(config_path) as f:
                return json.load(f)

    L.warning("No config file found, using defaults")
    return {
        "repl_url": os.environ.get("STRUDEL_REPL_URL", f"http://localhost:{STRUDEL_PORT}"),
        "ws_url": os.environ.get("STRUDEL_WS_URL", f"ws://localhost:{STRUDEL_PORT}/ws")
    }


class StrudelREPLClient:
    """Client for Strudel REPL server."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.timeout = 10

    def _get(self, path: str) -> dict:
        import urllib.request
        try:
            with urllib.request.urlopen(f"{self.base_url}{path}", timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e)}

    def _post(self, path: str, data: dict) -> dict:
        import urllib.request
        try:
            req = urllib.request.Request(
                f"{self.base_url}{path}",
                data=json.dumps(data).encode(),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e), "success": False}

    def health_check(self) -> dict:
        return self._get("/health")

    def evaluate(self, code: str, query_start: float = 0, query_end: float = 1) -> dict:
        return self._post("/evaluate", {
            "code": code,
            "queryStart": query_start,
            "queryEnd": query_end
        })

    def get_state(self) -> dict:
        return self._get("/state")

    def reset(self) -> dict:
        return self._post("/reset", {})


def verify_health(client: StrudelREPLClient) -> bool:
    L.info("Checking server health...")
    result = client.health_check()

    if "error" in result:
        L.error(f"Health check failed: {result['error']}")
        return False

    L.info(f"✅ Server status: {result.get('status')}")
    L.info(f"   Service: {result.get('service')}")
    L.info(f"   Runtime: {result.get('runtime')}")
    return result.get('status') == 'ok'


def verify_basic_evaluation(client: StrudelREPLClient) -> bool:
    L.info("\nTesting basic pattern evaluation...")

    # Test 1: Simple mini-notation
    result = client.evaluate('mini("c3 d3 e3 f3")')
    if not result.get("success"):
        L.error(f"Evaluation failed: {result.get('error')}")
        return False

    events = result.get("events", [])
    L.info(f"  ✅ Simple sequence: {len(events)} events")

    # Test 2: Transformation
    result = client.evaluate('mini("c3 e3 g3").fast(2)')
    if not result.get("success"):
        L.error(f"Evaluation failed: {result.get('error')}")
        return False
    L.info(f"  ✅ With transformation: {len(result.get('events', []))} events")

    # Test 3: Stack
    result = client.evaluate('stack(mini("c3 e3"), mini("g3 b3"))')
    if not result.get("success"):
        L.error(f"Evaluation failed: {result.get('error')}")
        return False
    L.info(f"  ✅ Stacked patterns: {len(result.get('events', []))} events")

    return True


def verify_state_management(client: StrudelREPLClient) -> bool:
    L.info("\nTesting state management...")

    state = client.get_state()
    L.info(f"Initial state: hasPattern={state.get('hasPattern')}")

    client.evaluate('mini("c3")')
    state = client.get_state()

    if not state.get("hasPattern"):
        L.warning("Expected hasPattern=True after evaluation")

    result = client.reset()
    L.info(f"Reset: {result.get('message')}")

    state = client.get_state()
    if state.get("hasPattern"):
        L.warning("State not cleared after reset")
        return False

    L.info("  ✅ State management working correctly")
    return True


def main():
    L.info("=== Strudel REPL Connection Verification ===")

    config = load_config()
    repl_url = config.get("repl_url", f"http://localhost:{STRUDEL_PORT}")
    L.info(f"REPL URL: {repl_url}")

    client = StrudelREPLClient(repl_url)

    if not verify_health(client):
        L.error("❌ Health check failed")
        return 1

    if not verify_basic_evaluation(client):
        L.error("❌ Basic evaluation failed")
        return 1

    if not verify_state_management(client):
        L.error("❌ State management failed")
        return 1

    L.info("\n" + "=" * 50)
    L.info("✅ All REPL verification tests passed!")
    L.info("=" * 50)
    return 0


if __name__ == "__main__":
    sys.exit(main())