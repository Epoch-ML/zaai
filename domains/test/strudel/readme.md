# Strudel REPL Test Manifest

A test manifest for the Strudel live coding environment that follows the same architectural pattern as the Chronicle SecOps connector tests.

## Overview

This manifest spins up a minimal Strudel REPL server and tests pattern evaluation via HTTP communication. The Python test orchestration generates and sends JavaScript/TypeScript code to the running Strudel server.

```
┌─────────────────────────────────────────────────────────────┐
│                    Python Test Runner                        │
│                                                              │
│  0-deploy → 1-verify → 2-stage → [tests] → 3-cleanup        │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP POST /evaluate
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Strudel REPL Server                          │
│                 http://localhost:3333                        │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  @strudel/core + @strudel/mini + Express/Hono         │  │
│  │                                                        │  │
│  │  POST /evaluate  - Evaluate pattern, return events     │  │
│  │  GET  /health    - Server health check                 │  │
│  │  POST /reset     - Reset state                         │  │
│  │  WS   /ws        - Real-time events (optional)         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Files

```
strudel-repl-manifest/
├── strudel.yaml              # Main manifest file
├── README.md                 # This file
└── stages/
    ├── 0-deploy-strudel-repl.py      # Spins up REPL server
    ├── 1-verify-repl-connection.py   # Verifies server is working
    ├── 2-stage-patterns.py           # Loads test patterns
    ├── 3-cleanup-strudel-repl.py     # Tears down server
    ├── 4-test-mini-notation.py       # Mini-notation tests
    ├── 5-test-transformations.py     # Pattern transformation tests
    └── 10-test-error-handling.py     # Error handling tests
```

## Prerequisites

- Python 3.8+
- Node.js 18+ or Bun (Bun preferred for speed)

## Usage

### Manual Testing

```bash
# Deploy the REPL server
python stages/0-deploy-strudel-repl.py

# Verify it's working
python stages/1-verify-repl-connection.py

# Stage test patterns
python stages/2-stage-patterns.py

# Run individual tests
python stages/4-test-mini-notation.py

# Clean up when done
python stages/3-cleanup-strudel-repl.py
```

### Visual Mode

Enable visual mode to open a browser for debugging:

```bash
export STRUDEL_VISUAL=1
python stages/0-deploy-strudel-repl.py
```

### Direct API Usage

Once deployed, you can interact with the REPL directly:

```bash
# Health check
curl http://localhost:3333/health

# Evaluate a pattern
curl -X POST http://localhost:3333/evaluate \
  -H "Content-Type: application/json" \
  -d '{"code": "mini(\"c3 d3 e3 f3\")", "queryStart": 0, "queryEnd": 1}'

# Reset state
curl -X POST http://localhost:3333/reset
```

## Test Pattern

Tests follow "Pattern B" from the Chronicle manifest:

```python
async def test_something(zerg_state=None):
    """Test description."""
    assert zerg_state, "Requires zerg_state"
    
    # Get config from zerg_state
    repl_url = zerg_state.get("strudel_repl_url", {}).get("value")
    
    # Create client
    client = StrudelClient(repl_url)
    
    # Evaluate pattern
    result = client.evaluate('mini("c3 d3 e3")')
    
    # Check for errors BEFORE processing
    assert result.get("success"), f"Failed: {result.get('error')}"
    
    # Process events
    events = result.get("events", [])
    assert len(events) == 3
    
    return True
```

## API Reference

### POST /evaluate

Evaluate Strudel pattern code and return events.

**Request:**
```json
{
  "code": "mini(\"c3 d3 e3 f3\")",
  "queryStart": 0,
  "queryEnd": 1
}
```

**Response:**
```json
{
  "success": true,
  "events": [
    {
      "value": "c3",
      "whole": {"begin": 0, "end": 0.25},
      "part": {"begin": 0, "end": 0.25}
    }
  ],
  "eventCount": 4,
  "evalTime": 5
}
```

### GET /health

Check server status.

**Response:**
```json
{
  "status": "ok",
  "service": "strudel-repl",
  "runtime": "bun",
  "uptime": 123.45
}
```

### POST /reset

Reset server state (clears current pattern and history).

**Response:**
```json
{
  "success": true,
  "message": "State reset"
}
```

## Writing New Tests

1. Create a new Python file in `stages/` (e.g., `6-test-something.py`)
2. Follow the async test function pattern
3. Use the HTTP client to send Strudel code
4. Assert on the returned events
5. Add test to `strudel.yaml` under `tests:`

Example:

```python
async def test_my_feature(zerg_state=None):
    """Test my specific feature."""
    # ... test implementation
    return True
```

## Extending for Audio Testing

For tests that need actual audio output (integration testing with speakers):

1. Set `STRUDEL_AUDIO=1` environment variable
2. The server will initialize Web Audio context
3. Tests can trigger actual playback

Note: Audio tests should be skipped in CI environments.

## Troubleshooting

### Port 3333 already in use

```bash
# Find the process
lsof -i :3333

# Kill it
kill -9 <PID>
```

### Dependencies not installing

```bash
# Clear npm cache and retry
cd strudel-repl-runtime
rm -rf node_modules package-lock.json
npm install
```

### Server not responding

Check the server log:
```bash
cat strudel-repl-runtime/server.log
```

## License

Same as Strudel - GPL-3.0