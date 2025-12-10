# Strudel REPL Test Manifest

Test manifest for the Strudel live coding environment.

## Architecture

This manifest provides:

### 1. Full Strudel REPL (Browser UI)
- **URL**: `http://localhost:3333/`
- **Powered by**: `@strudel/repl` web component (loaded from CDN)
- **Capabilities**: Full Strudel with audio, samples, effects, Csound, visualization
- **Use case**: Interactive development, debugging, live coding

### 2. Headless Test API (Backend)
- **URL**: `http://localhost:3333/evaluate`
- **Powered by**: `@strudel/core` + `@strudel/mini` (Node.js)
- **Capabilities**: Pattern evaluation, event generation (no audio)
- **Use case**: CI/CD testing, pattern validation

## Structure

```
strudel/
├── stages/
│   ├── strudel-repl/           # Server + UI files
│   │   ├── server.js           # Express server (static files + test API)
│   │   ├── package.json        # Dependencies
│   │   └── public/
│   │       └── index.html      # Full Strudel REPL (<strudel-editor>)
│   ├── 0-deploy-strudel-repl.py
│   ├── 1-verify-repl-connection.py
│   ├── 2-stage-patterns.py
│   └── 3-cleanup-strudel-repl.py
├── 1-test-mini-notation.py     # Mini-notation tests
├── 2-test-transformations.py   # Transformation tests
├── 3-test-error-handling.py    # Error handling tests
├── readme.md
└── strudel.yaml
```

## Usage

```bash
# Deploy REPL server
python stages/0-deploy-strudel-repl.py

# Opens browser to http://localhost:3333 with full Strudel REPL
# - Press Ctrl+Enter to play patterns
# - Press Ctrl+. to stop

# Cleanup
python stages/3-cleanup-strudel-repl.py
```

## Test API (Headless)

```bash
# Health check
curl http://localhost:3333/health

# Test strudel is working
curl http://localhost:3333/test

# Evaluate pattern (headless, no audio)
curl -X POST http://localhost:3333/evaluate \
  -H "Content-Type: application/json" \
  -d '{"code": "mini(\"c3 d3 e3 f3\")", "queryStart": 0, "queryEnd": 1}'

# Batch evaluate
curl -X POST http://localhost:3333/batch-evaluate \
  -H "Content-Type: application/json" \
  -d '{"patterns": ["mini(\"c3 d3\")", "mini(\"e3 f3\")"]}'
```

## What Works Where

### Full REPL (Browser)
✅ Everything Strudel supports:
- `s()`, `.bank()` - Samples  
- `note()`, `chord()`, `.voicing()` - Notes & chords
- `.csound()` - Csound integration
- Audio playback, visualization
- Effects (reverb, delay, etc.)
- `samples()`, `loadOrc()` - External resources

### Test API (Headless)
✅ Pattern evaluation only:
- `mini()` - Mini-notation
- `stack()`, `cat()`, `fastcat()` - Composition
- `.fast()`, `.slow()`, `.rev()` - Transformations
- Event generation and timing

## Prerequisites

- Python 3.8+
- Node.js 18+ or Bun