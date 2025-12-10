# 1-test-mini-notation.py
# Tests for: Strudel mini-notation parsing and evaluation
# Pattern B compliant

async def test_mini_notation(zerg_state=None):
    """Test Strudel mini-notation patterns via REPL connector."""
    print("Testing Strudel mini-notation via REPL")
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

    # Test 1: Simple sequence
    print("\nTest 1: Simple sequence 'c3 d3 e3 f3'")
    result = client.evaluate('mini("c3 d3 e3 f3")')
    assert_eval_success(result, "simple sequence")
    events = result.get("events", [])
    assert len(events) == 4, f"Expected 4 events, got {len(events)}"
    print(f"  ✅ Generated {len(events)} events")

    # Test 2: Nested groups
    print("\nTest 2: Nested groups '[c3 d3] [e3 f3]'")
    result = client.evaluate('mini("[c3 d3] [e3 f3]")')
    assert_eval_success(result, "nested groups")
    events = result.get("events", [])
    assert len(events) == 4, f"Expected 4 events, got {len(events)}"
    print(f"  ✅ Generated {len(events)} events")

    # Test 3: Rests
    print("\nTest 3: Rests 'c3 ~ e3 ~'")
    result = client.evaluate('mini("c3 ~ e3 ~")')
    assert_eval_success(result, "rests")
    events = result.get("events", [])
    assert len(events) == 2, f"Expected 2 events (rests omitted), got {len(events)}"
    print(f"  ✅ Generated {len(events)} events (rests produce no events)")

    # Test 4: Alternation
    print("\nTest 4: Alternation '<c3 e3 g3>' over 3 cycles")
    result = client.evaluate('mini("<c3 e3 g3>")', query_start=0, query_end=3)
    assert_eval_success(result, "alternation")
    events = result.get("events", [])
    assert len(events) == 3, f"Expected 3 events (one per cycle), got {len(events)}"
    print(f"  ✅ Generated {len(events)} events over 3 cycles")

    # Test 5: Multiplication
    print("\nTest 5: Multiplication 'c3*4'")
    result = client.evaluate('mini("c3*4")')
    assert_eval_success(result, "multiplication")
    events = result.get("events", [])
    assert len(events) == 4, f"Expected 4 events, got {len(events)}"
    print(f"  ✅ Generated {len(events)} events")

    # Test 6: Euclidean rhythm
    print("\nTest 6: Euclidean rhythm 'c3(3,8)'")
    result = client.evaluate('mini("c3(3,8)")')
    assert_eval_success(result, "euclidean")
    events = result.get("events", [])
    assert len(events) == 3, f"Expected 3 events for (3,8), got {len(events)}"
    print(f"  ✅ Generated {len(events)} events")

    print("\n✅ All mini-notation tests passed!")
    return True