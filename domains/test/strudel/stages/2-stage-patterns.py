#!/usr/bin/env python3
"""
Stage test patterns in the Strudel REPL.
Loads pattern libraries and verifies they work for subsequent tests.
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

    def evaluate(self, code: str) -> dict:
        return self._post("/evaluate", {"code": code, "queryStart": 0, "queryEnd": 1})

    def reset(self) -> dict:
        return self._post("/reset", {})


# Test patterns by category
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


def stage_patterns(client: StrudelREPLClient) -> dict:
    L.info("Staging test patterns...")

    results = {"total": 0, "success": 0, "failed": 0}

    for category, patterns in TEST_PATTERNS.items():
        L.info(f"\n=== {category} ===")

        for name, code in patterns:
            results["total"] += 1
            result = client.evaluate(code)

            if result.get("success"):
                event_count = result.get("eventCount", 0)
                L.info(f"  ✅ {name}: {event_count} events")
                results["success"] += 1
            else:
                L.error(f"  ❌ {name}: {result.get('error')}")
                results["failed"] += 1

    return results


def main():
    L.info("=" * 60)
    L.info("Strudel REPL - Pattern Staging")
    L.info("=" * 60)

    config = load_config()
    client = StrudelREPLClient(config.get("repl_url", "http://localhost:3333"))

    client.reset()
    results = stage_patterns(client)

    L.info("\n" + "=" * 60)
    L.info(f"Total: {results['total']}, Success: {results['success']}, Failed: {results['failed']}")
    L.info("=" * 60)

    success_rate = (results['success'] / results['total'] * 100) if results['total'] > 0 else 0

    if success_rate >= 90:
        L.info("✅ Pattern staging complete")
        return 0
    else:
        L.error(f"❌ Too many failures ({results['failed']}/{results['total']})")
        return 1


if __name__ == "__main__":
    sys.exit(main())