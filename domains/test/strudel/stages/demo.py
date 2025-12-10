#!/usr/bin/env python3
"""
Interactive demo - sends patterns to the Strudel REPL browser.
"""

import json
import time
import logging
from pathlib import Path
import urllib.request

logging.basicConfig(level=logging.INFO, format='%(message)s')
L = logging.getLogger(__name__)


class StrudelClient:
    def __init__(self, base_url: str = "http://localhost:3333"):
        self.base_url = base_url.rstrip('/')

    def _post(self, path: str, data: dict = None) -> dict:
        try:
            req = urllib.request.Request(
                f"{self.base_url}{path}",
                data=json.dumps(data or {}).encode(),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e), "success": False}

    def set_code(self, code: str) -> dict:
        return self._post("/set-code", {"code": code})

    def play(self) -> dict:
        return self._post("/play")

    def stop(self) -> dict:
        return self._post("/stop")

    def replay(self) -> dict:
        """Stop and restart the current pattern."""
        return self._post("/replay")


# Demo patterns
DEMOS = [
    ("Simple Arpeggio", '''
// Simple Arpeggio
note("<c4 e4 g4 c5>*2")
  .sound('triangle')
  .delay(0.5)
  .room(0.3)
'''),
    
    ("Minimal Beat", '''
// Minimal Beat
samples('github:tidalcycles/dirt-samples')

stack(
  s("bd*4"),
  s("~ cp"),
  s("hh*8").gain(0.5)
).bank('RolandTR909')
'''),

    ("Chord Progression", '''
// Chord Progression
note("<[c3,e3,g3] [a2,c3,e3] [f2,a2,c3] [g2,b2,d3]>")
  .sound('sawtooth')
  .cutoff(sine.range(400, 2000).slow(8))
  .attack(0.1)
  .release(0.5)
'''),

    ("Polyrhythm", '''
// Polyrhythm
samples('github:tidalcycles/dirt-samples')

stack(
  s("bd(3,8)"),
  s("cp(2,5)"),
  s("hh(5,8)").gain(0.6),
  n("0 2 4 7").scale("C:minor").sound('sine').decay(0.1)
)
'''),

    ("Glitchy", '''
// Glitchy
samples('github:tidalcycles/dirt-samples')

s("bd sd cp hh")
  .bank('RolandTR909')
  .sometimes(x => x.speed(2))
  .sometimes(x => x.crush(4))
  .delay(0.3)
'''),
]


def main():
    client = StrudelClient()
    
    print("\n🎵 Strudel REPL Demo")
    print("=" * 40)
    print("Make sure you have the browser open to http://localhost:3333")
    print("Press Enter to cycle through patterns, 'q' to quit\n")
    
    # Check connection
    result = client.set_code("// Connecting...")
    if result.get("clientCount", 0) == 0:
        print("⚠️  No browser connected! Open http://localhost:3333 first.")
        return
    
    print(f"✅ Connected to {result.get('clientCount')} browser(s)\n")
    
    idx = 0
    while True:
        name, code = DEMOS[idx]
        
        print(f"[{idx + 1}/{len(DEMOS)}] {name}")
        
        # Send code to browser
        result = client.set_code(code)
        if result.get("success"):
            print(f"  → Sent to {result.get('clientCount')} client(s)")
        
        # Auto-play after a short delay
        time.sleep(0.3)
        client.play()
        print("  → Playing...")
        
        # Wait for input
        try:
            user_input = input("\nPress Enter for next, 'r' to replay, 's' to stop, 'q' to quit: ").strip().lower()
        except KeyboardInterrupt:
            break
            
        if user_input == 'q':
            break
        elif user_input == 'r':
            print("  → Replaying...")
            client.replay()
            continue
        elif user_input == 's':
            print("  → Stopped")
            client.stop()
            continue
        else:
            # Stop current before moving to next
            client.stop()
            time.sleep(0.1)
            idx = (idx + 1) % len(DEMOS)
    
    print("\nStopping playback...")
    client.stop()
    print("Done!")


if __name__ == "__main__":
    main()