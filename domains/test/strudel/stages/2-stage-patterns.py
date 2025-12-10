#!/usr/bin/env python3
"""
Stage and play songs in the Strudel REPL with actual audio output.
Cycles through multiple genre songs, playing each for a set duration.
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

# Default port for Strudel REPL
STRUDEL_PORT = 7777

# Song duration in seconds
SONG_DURATION = 10


def load_config():
    possible_paths = [
        Path("/tmp/strudel-repl-config.json"),
        Path(__file__).parent / "strudel-repl-runtime" / "config.json",
    ]
    for config_path in possible_paths:
        if config_path.exists():
            with open(config_path) as f:
                return json.load(f)
    return {"repl_url": f"http://localhost:{STRUDEL_PORT}"}


class StrudelREPLClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.timeout = 10

    def _get(self, path: str) -> dict:
        import urllib.request
        try:
            with urllib.request.urlopen(f"{self.base_url}{path}", timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e), "success": False}

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

    def health_check(self) -> dict:
        """Check server health."""
        return self._get("/health")

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

    def replay(self) -> dict:
        """Stop and restart the current pattern."""
        return self._post("/replay")

    def reset(self) -> dict:
        """Reset server state."""
        return self._post("/reset", {})


# =============================================================================
# SONG DEFINITIONS - Actual playable songs with audio
# =============================================================================

SONGS = {
    "trance": {
        "name": "🌌 Cosmic Trance",
        "description": "Euphoric trance with arpeggios and filter sweeps",
        "code": '''// 🌌 Cosmic Trance
// Euphoric trance with arpeggiated melodies and atmospheric pads

samples('github:tidalcycles/dirt-samples')

stack(
  // Main arpeggio - classic trance lead
  note("<[c4 e4 g4 c5] [a3 c4 e4 a4] [f3 a3 c4 f4] [g3 b3 d4 g4]>")
    .sound('triangle')
    .cutoff(sine.range(400, 3000).slow(8))
    .resonance(15)
    .delay(0.4)
    .delaytime(0.375)
    .room(0.5)
    .gain(0.7),

  // Pad layer - atmospheric chords
  note("<[c3,e3,g3,b3] [a2,c3,e3,g3] [f2,a2,c3,e3] [g2,b2,d3,f3]>")
    .sound('sawtooth')
    .cutoff(800)
    .attack(0.3)
    .release(1.5)
    .room(0.7)
    .gain(0.4)
    .slow(2),

  // Sub bass
  note("<c2 a1 f1 g1>")
    .sound('sine')
    .gain(0.8)
    .slow(2),

  // Trance kick - four on the floor
  s("bd*4")
    .bank('RolandTR909')
    .gain(0.9),

  // Offbeat hi-hats
  s("~ hh ~ hh")
    .bank('RolandTR909')
    .gain(0.5),

  // Clap on 2 and 4
  s("~ cp ~ cp")
    .bank('RolandTR909')
    .gain(0.7)
)
'''
    },

    "techno": {
        "name": "🔊 Industrial Techno",
        "description": "Driving techno with 909 drums and acid bass",
        "code": '''// 🔊 Industrial Techno
// Hard-hitting techno with driving percussion

samples('github:tidalcycles/dirt-samples')

stack(
  // Four-on-the-floor kick
  s("bd*4")
    .bank('RolandTR909')
    .gain(1)
    .shape(0.3),

  // Hi-hat pattern - 16ths with accents
  s("hh*16")
    .bank('RolandTR909')
    .gain("[0.4 0.2 0.3 0.2]*4")
    .pan(sine.range(0.3, 0.7).fast(2)),

  // Open hat on offbeats
  s("~ oh ~ oh")
    .bank('RolandTR909')
    .gain(0.5)
    .release(0.1),

  // Clap with reverb
  s("~ cp ~ cp")
    .bank('RolandTR909')
    .room(0.3)
    .gain(0.8),

  // Acid bass line
  note("<c2 c2 [c2 c3] c2 c2 c2 [eb2 c2] c2>")
    .sound('sawtooth')
    .cutoff(sine.range(200, 2000).slow(4))
    .resonance(20)
    .decay(0.1)
    .sustain(0)
    .gain(0.6),

  // Percussion hits
  s("~ ~ ~ rim, ~ tom:3 ~ ~")
    .bank('RolandTR909')
    .gain(0.5)
    .room(0.2)
)
'''
    },

    "ambient": {
        "name": "🌊 Ambient Waves",
        "description": "Peaceful ambient textures with evolving pads",
        "code": '''// 🌊 Ambient Waves
// Peaceful evolving soundscape

samples('github:tidalcycles/dirt-samples')

stack(
  // Evolving pad
  note("<[c3,e3,g3] [d3,f3,a3] [e3,g3,b3] [c3,e3,g3]>")
    .sound('sine')
    .attack(2)
    .release(4)
    .room(0.9)
    .gain(0.4)
    .slow(4),

  // High sparkles
  note("<g5 e5 d5 c5 b4 c5 d5 e5>")
    .sound('triangle')
    .gain(0.15)
    .delay(0.6)
    .delaytime(0.5)
    .room(0.8)
    .pan(sine.range(0, 1).slow(8))
    .slow(2),

  // Deep drone
  note("c1")
    .sound('sine')
    .gain(0.3)
    .room(0.5)
)
'''
    },

    "house": {
        "name": "🏠 Deep House",
        "description": "Groovy house with warm bass and shuffled hats",
        "code": '''// 🏠 Deep House
// Warm and groovy deep house

samples('github:tidalcycles/dirt-samples')

stack(
  // Classic house kick
  s("bd ~ ~ bd ~ ~ bd ~")
    .bank('RolandTR909')
    .gain(0.95),

  // Shuffled hi-hats
  s("[~ hh]*4")
    .bank('RolandTR909')
    .gain(0.4)
    .delay(0.2),

  // Clap
  s("~ cp ~ ~")
    .bank('RolandTR909')
    .gain(0.7)
    .room(0.3),

  // Warm bass
  note("<c2 ~ [c2 c2] ~ a1 ~ [g1 g1] ~>")
    .sound('sawtooth')
    .cutoff(500)
    .gain(0.6)
    .decay(0.2),

  // Chord stabs
  note("<[c4,e4,g4] ~ ~ ~ [a3,c4,e4] ~ ~ ~>")
    .sound('sawtooth')
    .cutoff(1200)
    .attack(0.01)
    .release(0.3)
    .gain(0.4)
    .room(0.4)
)
'''
    }
}


def check_browser_connection(client: StrudelREPLClient) -> int:
    """Check how many browser clients are connected."""
    # Send a no-op to check client count
    result = client.set_code("// Connection check")
    return result.get("clientCount", 0)


def play_song(client: StrudelREPLClient, song_key: str, duration: int = SONG_DURATION, validate_headless: bool = False) -> bool:
    """Load and play a song for the specified duration.
    
    Args:
        client: The Strudel REPL client
        song_key: Key of the song in SONGS dict
        duration: How long to play in seconds
        validate_headless: If True, validate with headless API first (only works for basic patterns)
                          Full songs with samples/effects should skip this.
    """
    song = SONGS.get(song_key)
    if not song:
        L.error(f"Unknown song: {song_key}")
        return False

    L.info(f"\n{'='*60}")
    L.info(f"🎵 Now Playing: {song['name']}")
    L.info(f"   {song['description']}")
    L.info(f"{'='*60}")

    # Optionally validate with headless API (only for simple patterns without browser features)
    if validate_headless:
        L.info("  → Validating pattern (headless)...")
        result = client.evaluate(song["code"])
        if not result.get("success"):
            L.warning(f"  ⚠ Headless validation failed (expected for browser-only features)")
            L.info("  → Proceeding with browser playback...")
        else:
            event_count = result.get("eventCount", 0)
            L.info(f"  ✓ Pattern valid ({event_count} events/cycle)")
    else:
        L.info("  → Skipping headless validation (uses browser-only features)")

    # Send code to browser
    L.info("  → Sending to browser...")
    result = client.set_code(song["code"])
    if not result.get("success"):
        L.error(f"  ✗ Failed to send code: {result.get('error')}")
        return False
    
    client_count = result.get("clientCount", 0)
    if client_count == 0:
        L.warning("  ⚠ No browser connected!")
        return False
    
    L.info(f"  ✓ Code sent to {client_count} browser(s)")

    # Small delay for code to be received
    time.sleep(0.3)

    # Start playback
    L.info("  → Starting playback...")
    result = client.play()
    if not result.get("success"):
        L.error(f"  ✗ Failed to start playback: {result.get('error')}")
        return False
    
    L.info(f"  ✓ Playing for {duration} seconds...")

    # Play for the specified duration with a progress indicator
    for i in range(duration):
        remaining = duration - i
        bar_length = 30
        filled = int((i / duration) * bar_length)
        bar = "█" * filled + "░" * (bar_length - filled)
        print(f"\r  ⏱ [{bar}] {remaining}s remaining  ", end="", flush=True)
        time.sleep(1)
    
    print()  # New line after progress bar
    L.info("  ✓ Playback complete")
    
    return True


def run_song_cycle(client: StrudelREPLClient, songs_to_play: list, duration_per_song: int = SONG_DURATION):
    """Cycle through and play multiple songs."""
    
    L.info("\n" + "=" * 60)
    L.info("🎼 STRUDEL SONG CYCLE")
    L.info("=" * 60)
    L.info(f"Songs to play: {len(songs_to_play)}")
    L.info(f"Duration per song: {duration_per_song}s")
    L.info(f"Total duration: ~{len(songs_to_play) * duration_per_song}s")
    L.info("=" * 60)

    # Check browser connection first
    client_count = check_browser_connection(client)
    if client_count == 0:
        L.error("\n❌ No browser connected!")
        L.error(f"   Please open http://localhost:{STRUDEL_PORT} in your browser")
        L.error("   and click anywhere to enable audio, then run this again.")
        return False

    L.info(f"\n✓ {client_count} browser client(s) connected")
    
    # Prompt user to unlock audio
    L.info("")
    L.info("=" * 60)
    L.info("🔊 IMPORTANT: Click anywhere in the browser window to enable audio!")
    L.info("=" * 60)
    L.info("")
    L.info("Waiting 5 seconds for you to click in the browser...")
    
    for i in range(5, 0, -1):
        print(f"\r  Starting in {i}...  ", end="", flush=True)
        time.sleep(1)
    print("\r  Starting now!     ")
    L.info("")

    played = 0
    failed = 0

    for i, song_key in enumerate(songs_to_play):
        L.info(f"\n[{i+1}/{len(songs_to_play)}] Loading {song_key}...")
        
        # Stop any current playback before switching
        client.stop()
        time.sleep(0.5)
        
        if play_song(client, song_key, duration_per_song):
            played += 1
        else:
            failed += 1
            L.warning(f"  Skipping {song_key} due to errors")

        # Brief pause between songs
        if i < len(songs_to_play) - 1:
            L.info("\n  ⏸ Transitioning to next song...")
            time.sleep(1)

    # Stop playback at the end
    L.info("\n" + "=" * 60)
    L.info("🛑 Stopping playback...")
    client.stop()
    time.sleep(0.5)

    L.info("\n" + "=" * 60)
    L.info("📊 SONG CYCLE COMPLETE")
    L.info("=" * 60)
    L.info(f"  Songs played: {played}/{len(songs_to_play)}")
    if failed > 0:
        L.info(f"  Failed: {failed}")
    L.info("=" * 60)

    return failed == 0


def main():
    L.info("=" * 60)
    L.info("🎵 Strudel REPL - Song Staging & Playback")
    L.info("=" * 60)

    config = load_config()
    repl_url = config.get("repl_url", f"http://localhost:{STRUDEL_PORT}")
    client = StrudelREPLClient(repl_url)

    # Health check
    L.info(f"\nConnecting to {repl_url}...")
    health = client.health_check()
    if health.get("status") != "ok":
        L.error(f"❌ Server not healthy: {health}")
        return 1
    L.info(f"✓ Server healthy ({health.get('runtime')})")

    # Reset state
    client.reset()

    # Define which songs to play and in what order
    songs_to_play = ["trance", "techno", "house", "ambient"]
    duration_per_song = 8  # seconds

    # Run the song cycle
    success = run_song_cycle(client, songs_to_play, duration_per_song)

    if success:
        L.info("\n✅ All songs played successfully!")
        return 0
    else:
        L.error("\n❌ Some songs failed to play")
        return 1


if __name__ == "__main__":
    sys.exit(main())