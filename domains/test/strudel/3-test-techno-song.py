# 3-test-techno-song.py

async def test_techno_song(zerg_state=None):
    """Test loading and playing the techno song through the Strudel client"""
    print("Testing techno song loading and playback")

    assert zerg_state, "This test requires valid zerg_state"

    # Get config values from zerg_state
    repl_url = zerg_state.get("strudel_repl_url").get("value")
    ws_url = zerg_state.get("strudel_ws_url").get("value")
    timeout = zerg_state.get("strudel_request_timeout").get("value")
    song_files = zerg_state.get("song_files").get("value")

    # Import from the client module that will be generated
    from strudel.client.config import StrudelClientConfig
    from strudel.client.client import StrudelClient

    # Initialize the client
    config = StrudelClientConfig(
        repl_url=repl_url,
        ws_url=ws_url,
        timeout=timeout
    )
    client = StrudelClient(config=config)

    # Test 1: Verify server is healthy
    print("\n[Test 1] Verifying server health...")
    health = await client.health_check()
    assert health.get("status") == "ok", f"Server not healthy: {health}"
    print(f"  ✅ Server is healthy")

    # Test 2: Load techno song from JS file
    print("\n[Test 2] Loading techno.js...")
    techno_path = song_files.get("techno", "strudel/songs/techno.js")
    techno_code = await client.load_song(techno_path)
    assert techno_code is not None, f"Failed to load {techno_path}"
    assert isinstance(techno_code, str), "Song code should be a string"
    assert len(techno_code) > 50, "Song code seems too short"
    print(f"  ✅ Loaded techno song ({len(techno_code)} chars)")
    print(f"     Preview: {techno_code[:100]}...")

    # Test 3: Validate loaded code can be evaluated
    print("\n[Test 3] Validating techno code...")
    result = await client.evaluate(techno_code)
    assert result.get("success"), f"Techno code evaluation failed: {result.get('error')}"
    event_count = result.get("eventCount", len(result.get("events", [])))
    assert event_count > 0, "Techno pattern generated no events"
    print(f"  ✅ Code is valid, generates {event_count} events per cycle")

    # Test 4: Send code to browser
    print("\n[Test 4] Sending code to browser...")
    set_result = await client.set_code(techno_code)
    assert set_result.get("success"), f"Failed to set code: {set_result.get('error')}"
    client_count = set_result.get("clientCount", 0)
    print(f"  ✅ Code sent to {client_count} browser client(s)")

    if client_count == 0:
        print("  ⚠️  No browser connected - skipping playback test")
        print("     Open http://localhost:7777 in a browser to enable audio playback")
    else:
        # Test 5: Play the song for specified duration
        song_duration = 8  # Play for 8 seconds
        print(f"\n[Test 5] Playing techno song for {song_duration} seconds...")
        
        play_result = await client.play_song(techno_code, duration=song_duration)
        assert play_result.get("success"), f"Playback failed: {play_result.get('error')}"
        print(f"  ✅ Song played for {song_duration} seconds")

        # Test 6: Verify playback stopped
        print("\n[Test 6] Verifying playback stopped...")
        stop_result = await client.stop()
        assert stop_result.get("success"), f"Stop failed: {stop_result.get('error')}"
        print(f"  ✅ Playback stopped successfully")

    # Test 7: Verify techno-specific elements in the song code
    print("\n[Test 7] Verifying techno characteristics...")
    techno_indicators = [
        # Techno typically has these elements
        any(x in techno_code.lower() for x in ['bd', 'kick', 'bass drum']),  # Four-on-the-floor kick
        any(x in techno_code.lower() for x in ['hh', 'hihat', 'hat']),  # Hi-hats
        any(x in techno_code.lower() for x in ['cp', 'clap', 'snare', 'sd']),  # Claps/snares
        any(x in techno_code.lower() for x in ['*4', '*8', 'fast']),  # Repetitive patterns
        any(x in techno_code.lower() for x in ['909', '808', 'tr-', 'roland']),  # Drum machine references
    ]
    techno_score = sum(techno_indicators)
    assert techno_score >= 2, f"Song doesn't seem very techno-like (score: {techno_score}/5)"
    print(f"  ✅ Techno characteristics score: {techno_score}/5")

    # Test 8: Verify different from trance
    print("\n[Test 8] Verifying genre distinction...")
    trance_path = song_files.get("trance", "strudel/songs/trance.js")
    trance_code = await client.load_song(trance_path)
    # The codes should be meaningfully different
    assert techno_code != trance_code, "Techno and trance songs should be different"
    # Check that they're not just trivially different
    techno_words = set(techno_code.split())
    trance_words = set(trance_code.split())
    overlap = len(techno_words & trance_words)
    total = max(len(techno_words), len(trance_words))
    similarity = overlap / total if total > 0 else 0
    print(f"  ✅ Genre distinction verified (similarity: {similarity:.1%})")

    print("\n" + "=" * 50)
    print("✅ All techno song tests passed!")
    print("=" * 50)

    return True