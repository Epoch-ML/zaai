# 1-test-client-connection.py

async def test_client_connection(zerg_state=None):
    """Test whether Strudel client can connect and evaluate patterns"""
    print("Testing Strudel client connection and evaluation")

    assert zerg_state, "This test requires valid zerg_state"

    # Get config values from zerg_state
    repl_url = zerg_state.get("strudel_repl_url").get("value")
    ws_url = zerg_state.get("strudel_ws_url").get("value")
    timeout = zerg_state.get("strudel_request_timeout").get("value")

    # Import from the client module that will be generated
    from strudel.client.config import StrudelClientConfig
    from strudel.client.client import StrudelClient

    # Initialize the client config
    config = StrudelClientConfig(
        repl_url=repl_url,
        ws_url=ws_url,
        timeout=timeout
    )
    assert config.repl_url == repl_url, "Config repl_url mismatch"

    # Create client instance
    client = StrudelClient(config=config)
    assert client is not None, "Failed to create StrudelClient"

    # Test 1: Health check
    print("\n[Test 1] Health check...")
    health = await client.health_check()
    assert health is not None, "Health check returned None"
    assert health.get("status") == "ok", f"Health check failed: {health}"
    print(f"  ✅ Server status: {health.get('status')}")
    print(f"     Service: {health.get('service')}")
    print(f"     Runtime: {health.get('runtime')}")

    # Test 2: Basic pattern evaluation
    print("\n[Test 2] Basic pattern evaluation...")
    result = await client.evaluate('mini("c3 d3 e3 f3")')
    assert result.get("success"), f"Evaluation failed: {result.get('error')}"
    events = result.get("events", [])
    assert len(events) == 4, f"Expected 4 events, got {len(events)}"
    print(f"  ✅ Evaluated pattern: {len(events)} events")

    # Test 3: Pattern with transformations
    print("\n[Test 3] Pattern with transformations...")
    result = await client.evaluate('mini("c3 d3 e3 f3").fast(2)')
    assert result.get("success"), f"Evaluation failed: {result.get('error')}"
    events = result.get("events", [])
    assert len(events) == 8, f"Expected 8 events with fast(2), got {len(events)}"
    print(f"  ✅ Transformed pattern: {len(events)} events")

    # Test 4: Query time range
    print("\n[Test 4] Query time range...")
    result = await client.evaluate(
        'mini("<c3 e3 g3>")',
        query_start=0,
        query_end=3
    )
    assert result.get("success"), f"Evaluation failed: {result.get('error')}"
    events = result.get("events", [])
    assert len(events) == 3, f"Expected 3 events over 3 cycles, got {len(events)}"
    print(f"  ✅ Multi-cycle query: {len(events)} events")

    # Test 5: Error handling
    print("\n[Test 5] Error handling...")
    result = await client.evaluate('invalid syntax here (((')
    assert not result.get("success"), "Should have failed on invalid syntax"
    assert result.get("error") is not None, "Error message should be present"
    print(f"  ✅ Error properly caught: {result.get('errorType', 'Error')}")

    # Test 6: Stacked patterns
    print("\n[Test 6] Stacked patterns...")
    result = await client.evaluate('stack(mini("c3 e3"), mini("g3 b3"))')
    assert result.get("success"), f"Evaluation failed: {result.get('error')}"
    events = result.get("events", [])
    assert len(events) == 4, f"Expected 4 events from stack, got {len(events)}"
    print(f"  ✅ Stacked patterns: {len(events)} events")

    print("\n" + "=" * 50)
    print("✅ All client connection tests passed!")
    print("=" * 50)

    return True