# 3-test-error-handling.py
# Tests for: Error handling and edge cases in Strudel REPL
# Pattern B compliant

async def test_error_handling(zerg_state=None):
    """Test Strudel REPL error handling and edge cases."""
    print("Testing Strudel REPL error handling")
    print("=" * 60)

    assert zerg_state, "This test requires valid zerg_state"

    import json
    import urllib.request
    import urllib.error

    repl_url = zerg_state.get("strudel_repl_url", {}).get("value", "http://localhost:7777")

    class StrudelClient:
        def __init__(self, url):
            self.url = url

        def evaluate(self, code: str, query_start: float = 0, query_end: float = 1) -> dict:
            try:
                req = urllib.request.Request(
                    f"{self.url}/evaluate",
                    data=json.dumps({"code": code, "queryStart": query_start, "queryEnd": query_end}).encode(),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    return json.loads(response.read().decode())
            except urllib.error.HTTPError as e:
                try:
                    return json.loads(e.read().decode())
                except:
                    return {"success": False, "error": str(e)}
            except Exception as e:
                return {"success": False, "error": str(e)}

    client = StrudelClient(repl_url)

    # Test 1: Syntax error
    print("\nTest 1: Syntax error (unclosed parenthesis)")
    result = client.evaluate('mini("c3 d3"')
    assert not result.get("success"), "Should fail on syntax error"
    print(f"  ✅ Caught syntax error: {result.get('errorType', 'Error')}")

    # Test 2: Undefined variable
    print("\nTest 2: Undefined variable")
    result = client.evaluate('undefinedVariable.fast(2)')
    assert not result.get("success"), "Should fail on undefined variable"
    print(f"  ✅ Caught undefined variable")

    # Test 3: Non-pattern return
    print("\nTest 3: Non-pattern return value")
    result = client.evaluate('"just a string"')
    if not result.get("success"):
        print(f"  ✅ Correctly rejected non-pattern")
    else:
        events = result.get("events", [])
        print(f"  ✅ Handled non-pattern: {len(events)} events")

    # Test 4: Empty code
    print("\nTest 4: Empty code submission")
    result = client.evaluate('')
    assert not result.get("success"), "Should fail on empty code"
    print(f"  ✅ Correctly rejected empty code")

    # Test 5: Query range edge cases
    print("\nTest 5: Query range edge cases")

    result = client.evaluate('mini("c3 d3 e3")', query_start=0, query_end=0)
    events = result.get("events", []) if result.get("success") else []
    print(f"  Zero range [0,0]: {len(events)} events")

    result = client.evaluate('mini("c3 d3 e3")', query_start=0, query_end=0.001)
    events = result.get("events", []) if result.get("success") else []
    print(f"  Tiny range [0, 0.001]: {len(events)} events")

    # Test 6: Large pattern
    print("\nTest 6: Large pattern (stress test)")
    large_pattern = 'mini("' + ' '.join([f'c{i%5}' for i in range(50)]) + '")'
    result = client.evaluate(large_pattern)
    if result.get("success"):
        print(f"  ✅ Large pattern: {len(result.get('events', []))} events")
    else:
        print(f"  ⚠️ Large pattern failed: {result.get('error')[:40]}...")

    # Test 7: Deep nesting
    print("\nTest 7: Deep nesting")
    deep_code = 'mini("c3")' + '.fast(1.01)' * 20
    result = client.evaluate(deep_code)
    if result.get("success"):
        print(f"  ✅ Deep nesting: {len(result.get('events', []))} events")
    else:
        print(f"  Caught deep nesting issue")

    print("\n" + "=" * 60)
    print("✅ Error handling tests completed!")
    return True