# 2-test-transformations.py
# Tests for: Strudel pattern transformations (fast, slow, rev, every, jux)
# Pattern B compliant

async def test_transformations(zerg_state=None):
    """Test Strudel pattern transformations via REPL connector."""
    print("Testing Strudel pattern transformations via REPL")
    print("=" * 60)

    assert zerg_state, "This test requires valid zerg_state"

    def assert_eval_success(result, operation_name: str):
        if isinstance(result, dict) and not result.get("success"):
            error = result.get("error", "Unknown error")
            raise AssertionError(f"{operation_name} failed: {error}")
        return True

    import json
    import urllib.request

    repl_url = zerg_state.get("strudel_repl_url", {}).get("value", "http://localhost:3333")

    class StrudelClient:
        def __init__(self, url):
            self.url = url

        def evaluate(self, code: str, query_start: float = 0, query_end: float = 1) -> dict:
            req = urllib.request.Request(
                f"{self.url}/evaluate",
                data=json.dumps({"code": code, "queryStart": query_start, "queryEnd": query_end}).encode(),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode())

    client = StrudelClient(repl_url)

    # Baseline
    baseline = client.evaluate('mini("c3 d3 e3 f3")')
    assert_eval_success(baseline, "baseline")
    baseline_count = len(baseline["events"])

    # Test 1: fast(2)
    print("\nTest 1: fast(2) - double speed")
    result = client.evaluate('mini("c3 d3 e3 f3").fast(2)')
    assert_eval_success(result, "fast(2)")
    fast_count = len(result["events"])
    assert fast_count == baseline_count * 2, f"Expected {baseline_count * 2}, got {fast_count}"
    print(f"  ✅ fast(2): {fast_count} events (baseline: {baseline_count})")

    # Test 2: slow(2)
    print("\nTest 2: slow(2) - half speed")
    result = client.evaluate('mini("c3 d3 e3 f3").slow(2)', query_start=0, query_end=2)
    assert_eval_success(result, "slow(2)")
    slow_count = len(result["events"])
    assert slow_count == baseline_count, f"Expected {baseline_count} over 2 cycles, got {slow_count}"
    print(f"  ✅ slow(2) over 2 cycles: {slow_count} events")

    # Test 3: rev()
    print("\nTest 3: rev() - reverse pattern")
    result = client.evaluate('mini("c3 d3 e3 f3").rev()')
    assert_eval_success(result, "rev()")
    rev_values = [str(e["value"]) for e in result["events"]]
    baseline_values = [str(e["value"]) for e in baseline["events"]]
    assert rev_values == baseline_values[::-1], "rev() should reverse values"
    print(f"  ✅ Original: {baseline_values}, Reversed: {rev_values}")

    # Test 4: every(2, rev)
    print("\nTest 4: every(2, rev) - apply every 2 cycles")
    result = client.evaluate('mini("c3 d3 e3 f3").every(2, x => x.rev())', query_start=0, query_end=4)
    assert_eval_success(result, "every(2, rev)")
    assert len(result["events"]) == baseline_count * 4
    print(f"  ✅ every(2, rev) over 4 cycles: {len(result['events'])} events")

    # Test 5: Chained transformations
    print("\nTest 5: Chained - fast(2).rev()")
    result = client.evaluate('mini("c3 d3 e3 f3").fast(2).rev()')
    assert_eval_success(result, "chained")
    assert len(result["events"]) == 8
    print(f"  ✅ fast(2).rev(): {len(result['events'])} events")

    # Test 6: jux(rev)
    print("\nTest 6: jux(rev) - juxtapose")
    result = client.evaluate('mini("c3 d3 e3 f3").jux(x => x.rev())')
    assert_eval_success(result, "jux(rev)")
    assert len(result["events"]) == baseline_count * 2
    print(f"  ✅ jux(rev): {len(result['events'])} events (doubled)")

    print("\n✅ All transformation tests passed!")
    return True