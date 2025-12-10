// Strudel REPL Server
// Serves the Strudel REPL UI and provides API for automated testing

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Strudel imports for headless testing API
import { mini } from '@strudel/mini';
import * as core from '@strudel/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static files (the REPL UI)
const publicPath = join(__dirname, 'public');
app.use(express.static(publicPath));

// Strudel context for headless eval
const strudelContext = {
    mini,
    stack: core.stack,
    cat: core.cat,
    fastcat: core.fastcat,
    slowcat: core.slowcat,
    sequence: core.sequence,
    note: core.note,
    n: core.n,
    s: core.s,
    sound: core.sound,
    gain: core.gain,
    pan: core.pan,
    fast: core.fast,
    slow: core.slow,
    rev: core.rev,
    every: core.every,
    jux: core.jux,
    sometimes: core.sometimes
};

Object.assign(globalThis, strudelContext);

// State for test API
let evaluationHistory = [];
const MAX_HISTORY = 100;

// ========== API Routes for Testing ==========

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'strudel-repl',
        version: '1.0.0',
        runtime: process.versions.bun ? 'bun' : 'node',
        uptime: process.uptime(),
        mode: 'full-repl'
    });
});

// Test endpoint - verify strudel core is working
app.get('/test', (req, res) => {
    try {
        const testPattern = mini("c3 d3 e3");
        const haps = testPattern.queryArc(0, 1);
        const events = (haps || []).map(h => ({ 
            value: h.value, 
            begin: Number(h.part.begin),
            end: Number(h.part.end)
        }));
        
        res.json({
            success: true,
            message: 'Strudel core is working',
            testEvents: events,
            eventCount: events.length,
            availableFunctions: Object.keys(strudelContext)
        });
    } catch (err) {
        res.json({
            success: false,
            error: err.message,
            stack: err.stack
        });
    }
});

// Headless pattern evaluation (for automated testing)
app.post('/evaluate', async (req, res) => {
    const { code, queryStart = 0, queryEnd = 1 } = req.body;
    
    if (!code) {
        return res.status(400).json({
            success: false,
            error: 'No code provided',
            errorType: 'ValidationError'
        });
    }

    try {
        const startTime = Date.now();
        const pattern = eval(code);

        if (!pattern || typeof pattern.queryArc !== 'function') {
            throw new Error('Code must return a valid Strudel Pattern');
        }

        const haps = pattern.queryArc(queryStart, queryEnd);
        
        const events = (haps || []).map(hap => ({
            value: hap.value,
            whole: hap.whole ? {
                begin: Number(hap.whole.begin),
                end: Number(hap.whole.end)
            } : null,
            part: {
                begin: Number(hap.part.begin),
                end: Number(hap.part.end)
            },
            context: hap.context || {}
        }));

        const evalTime = Date.now() - startTime;

        evaluationHistory.unshift({
            code: code.slice(0, 100),
            eventCount: events.length,
            timestamp: new Date().toISOString(),
            evalTime
        });
        if (evaluationHistory.length > MAX_HISTORY) {
            evaluationHistory.pop();
        }

        res.json({
            success: true,
            events,
            eventCount: events.length,
            evalTime,
            queryRange: { start: queryStart, end: queryEnd }
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
            errorType: error.constructor.name
        });
    }
});

// Set code in connected browsers (via WebSocket)
app.post('/set-code', (req, res) => {
    const { code } = req.body;
    
    if (!code) {
        return res.status(400).json({ success: false, error: 'No code provided' });
    }
    
    // Broadcast to all connected WebSocket clients
    let sent = 0;
    clients.forEach(ws => {
        if (ws.readyState === 1) { // OPEN
            ws.send(JSON.stringify({ type: 'set-code', code }));
            sent++;
        }
    });
    
    console.log(`[set-code] Sent to ${sent} clients`);
    
    res.json({ success: true, clientCount: sent });
});

// Trigger play in connected browsers
app.post('/play', (req, res) => {
    let sent = 0;
    clients.forEach(ws => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'play' }));
            sent++;
        }
    });
    console.log(`[play] Sent to ${sent} clients`);
    res.json({ success: true, clientCount: sent });
});

// Trigger stop in connected browsers
app.post('/stop', (req, res) => {
    let sent = 0;
    clients.forEach(ws => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'stop' }));
            sent++;
        }
    });
    console.log(`[stop] Sent to ${sent} clients`);
    res.json({ success: true, clientCount: sent });
});

// Trigger replay (stop + play) in connected browsers
app.post('/replay', (req, res) => {
    let sent = 0;
    clients.forEach(ws => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'replay' }));
            sent++;
        }
    });
    console.log(`[replay] Sent to ${sent} clients`);
    res.json({ success: true, clientCount: sent });
});

// Get evaluation history
app.get('/history', (req, res) => {
    res.json({
        history: evaluationHistory.slice(0, 20),
        total: evaluationHistory.length
    });
});

// Reset state
app.post('/reset', (req, res) => {
    evaluationHistory = [];
    res.json({ success: true, message: 'State reset' });
});

// Batch evaluate (for test suites)
app.post('/batch-evaluate', async (req, res) => {
    const { patterns, queryStart = 0, queryEnd = 1 } = req.body;

    if (!Array.isArray(patterns)) {
        return res.status(400).json({
            success: false,
            error: 'patterns must be an array'
        });
    }

    const results = patterns.map(item => {
        const code = typeof item === 'string' ? item : item.code;
        const name = typeof item === 'object' ? item.name : undefined;

        try {
            const pattern = eval(code);
            const haps = pattern.queryArc(queryStart, queryEnd);
            return {
                name,
                success: true,
                eventCount: haps?.length || 0,
                events: (haps || []).map(h => ({
                    value: h.value,
                    part: {
                        begin: Number(h.part.begin),
                        end: Number(h.part.end)
                    }
                }))
            };
        } catch (error) {
            return { name, success: false, error: error.message };
        }
    });

    res.json({ results, total: results.length });
});

// WebSocket for live updates
const clients = new Set();
wss.on('connection', ws => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.send(JSON.stringify({ type: 'connected', message: 'Connected to Strudel REPL server' }));
});

// Start server
const PORT = process.env.PORT || 7777;
server.listen(PORT, () => {
    console.log('');
    console.log('  🎵 Strudel REPL Server');
    console.log('  ──────────────────────');
    console.log(`  REPL UI:   http://localhost:${PORT}`);
    console.log(`  Test API:  http://localhost:${PORT}/test`);
    console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`  Runtime:   ${process.versions.bun ? 'Bun ' + process.versions.bun : 'Node.js ' + process.version}`);
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('');
});