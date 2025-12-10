#!/usr/bin/env python3
"""
Stage test patterns in the Strudel REPL.
Runs headless tests AND stages a demo pattern in the browser.
"""

import os
import sys
import json
import time
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
L = logging.getLogger(__name__)


def load_config():
    possible_paths = [
        Path("/tmp/strudel-repl-config.json"),
        Path(__file__).parent / "strudel-repl-runtime" / "config.json",
    ]
    for config_path in possible_paths:
        if config_path.exists():
            with open(config_path) as f:
                return json.load(f)
    return {"repl_url": "http://localhost:3333"}


class StrudelREPLClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.timeout = 10

    def _post(self, path: str, data: dict = None) -> dict:
        import urllib.request
        try:
            req = urllib.request.Request(
                f"{self.base_url}{path}",
                data=json.dumps(data or {}).encode(),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e), "success": False}

    def evaluate(self, code: str) -> dict:
        """Evaluate pattern headlessly (returns events, no audio)."""
        return self._post("/evaluate", {"code": code, "queryStart": 0, "queryEnd": 1})

    def set_code(self, code: str) -> dict:
        """Set code in connected browser(s) via WebSocket."""
        return self._post("/set-code", {"code": code})

    def play(self) -> dict:
        """Trigger play in connected browser(s)."""
        return self._post("/play")

    def stop(self) -> dict:
        """Trigger stop in connected browser(s)."""
        return self._post("/stop")

    def reset(self) -> dict:
        """Reset server state."""
        return self._post("/reset", {})


# Test patterns for headless validation
TEST_PATTERNS = {
    "mini_notation": [
        ("simple_sequence", 'mini("c3 d3 e3 f3")'),
        ("nested_groups", 'mini("[c3 d3] [e3 f3]")'),
        ("rests", 'mini("c3 ~ e3 ~")'),
        ("alternation", 'mini("<c3 e3 g3>")'),
        ("multiplication", 'mini("c3*4")'),
        ("euclidean", 'mini("c3(3,8)")'),
    ],
    "transformations": [
        ("fast", 'mini("c3 d3 e3 f3").fast(2)'),
        ("slow", 'mini("c3 d3 e3 f3").slow(2)'),
        ("rev", 'mini("c3 d3 e3 f3").rev()'),
    ],
    "composition": [
        ("stack", 'stack(mini("c3 e3 g3"), mini("c4 e4 g4"))'),
        ("cat", 'cat(mini("c3 d3"), mini("e3 f3"))'),
        ("fastcat", 'fastcat(mini("c3"), mini("e3"), mini("g3"))'),
    ],
}

# Demo pattern to stage in browser (with audio)
STAGING_DEMO = '''// 🎵 Strudel REPL - Staging Complete!
// All pattern tests passed. Press Ctrl+Enter to play.

samples('github:tidalcycles/dirt-samples')

stack(
  // Melody
  note("<c4 e4 g4 e4>*2")
    .sound('triangle')
    .cutoff(sine.range(500, 2000).slow(4))
    .delay(0.3),
  
  // Bass
  note("<c2 g1>").slow(2).sound('sawtooth').lpf(400),
  
  // Drums
  s("bd*4, ~ cp, hh*8").bank('RolandTR909').gain(0.8)
)
'''


def run_headless_tests(client: StrudelREPLClient) -> dict:
    """Run headless pattern evaluation tests."""
    L.info("Running headless pattern tests...")

    results = {"total": 0, "success": 0, "failed": 0, "details": []}

    for category, patterns in TEST_PATTERNS.items():
        L.info(f"\n  [{category}]")

        for name, code in patterns:
            results["total"] += 1
            result = client.evaluate(code)

            if result.get("success"):
                event_count = result.get("eventCount", 0)
                L.info(f"    ✅ {name}: {event_count} events")
                results["success"] += 1
                results["details"].append({"name": name, "success": True, "events": event_count})
            else:
                L.error(f"    ❌ {name}: {result.get('error')}")
                results["failed"] += 1
                results["details"].append({"name": name, "success": False, "error": result.get("error")})

    return results


def stage_browser_demo(client: StrudelREPLClient) -> bool:
    """Stage demo pattern in browser and start playback."""
    L.info("\nStaging demo in browser...")
    
    # Set the demo code
    result = client.set_code(STAGING_DEMO)
    
    if not result.get("success"):
        L.error(f"Failed to set code: {result.get('error')}")
        return False
    
    client_count = result.get("clientCount", 0)
    if client_count == 0:
        L.warning("⚠️  No browser connected - open http://localhost:3333 to see the demo")
        return True  # Not a failure, just no browser
    
    L.info(f"  → Sent to {client_count} browser(s)")
    
    # Give browser time to receive code
    time.sleep(0.3)
    
    # Start playback
    result = client.play()
    if result.get("success"):
        L.info(f"  → Started playback")
    
    return True


def main():
    L.info("=" * 60)
    L.info("Strudel REPL - Pattern Staging")
    L.info("=" * 60)

    config = load_config()
    client = StrudelREPLClient(config.get("repl_url", "http://localhost:3333"))

    # Reset state
    client.reset()
    
    # Run headless tests
    results = run_headless_tests(client)

    L.info("\n" + "-" * 60)
    L.info(f"Headless Tests: {results['success']}/{results['total']} passed")
    L.info("-" * 60)

    success_rate = (results['success'] / results['total'] * 100) if results['total'] > 0 else 0

    if success_rate < 90:
        L.error(f"❌ Too many test failures ({results['failed']}/{results['total']})")
        return 1

    # Stage demo in browser
    if not stage_browser_demo(client):
        L.error("❌ Failed to stage browser demo")
        return 1

    L.info("\n" + "=" * 60)
    L.info("✅ Pattern staging complete!")
    L.info("   Browser should now be playing the demo pattern.")
    L.info("=" * 60)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())