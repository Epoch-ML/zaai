// Strudel REPL Server
// Evaluates Strudel patterns and returns events

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// Strudel imports
import { Pattern, TimeSpan, State } from '@strudel/core';
import { mini } from '@strudel/mini';
import * as core from '@strudel/core';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Strudel context for eval
const strudelContext = {
    Pattern,
    TimeSpan,
    State,
    mini,
    // Core pattern functions
    note: core.note,
    n: core.n,
    sound: core.sound,
    s: core.s,
    gain: core.gain,
    pan: core.pan,
    speed: core.speed,
    begin: core.begin,
    end: core.end,
    // Composition
    stack: core.stack,
    cat: core.cat,
    fastcat: core.fastcat,
    slowcat: core.slowcat,
    sequence: core.sequence,
    // Transformations
    fast: core.fast,
    slow: core.slow,
    rev: core.rev,
    every: core.every,
    jux: core.jux,
    sometimes: core.sometimes
};

// Make context available globally for eval
Object.assign(globalThis, strudelContext);

// State
let currentPattern = null;
let evaluationHistory = [];
const MAX_HISTORY = 100;

// WebSocket clients
const clients = new Set();

function broadcastToClients(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
        if (client.readyState === 1) {
            client.send(data);
        }
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'strudel-repl',
        version: '1.0.0',
        runtime: process.versions.bun ? 'bun' : 'node',
        uptime: process.uptime()
    });
});

// Evaluate pattern code
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
        // Evaluate the code
        const startTime = Date.now();
        const pattern = eval(code);

        if (!pattern || typeof pattern.queryArc !== 'function') {
            throw new Error('Code must return a valid Strudel Pattern');
        }

        // Query events from the pattern
        const span = new TimeSpan(queryStart, queryEnd);
        const state = new State(span);
        const haps = pattern.queryArc(span, state);

        // Convert haps to serializable format
        const events = haps.map(hap => ({
            value: hap.value,
            whole: hap.whole ? {
                begin: hap.whole.begin.valueOf(),
                end: hap.whole.end.valueOf()
            } : null,
            part: {
                begin: hap.part.begin.valueOf(),
                end: hap.part.end.valueOf()
            },
            context: hap.context || {}
        }));

        const evalTime = Date.now() - startTime;

        // Store in history
        evaluationHistory.unshift({
            code,
            eventCount: events.length,
            timestamp: new Date().toISOString(),
            evalTime
        });
        if (evaluationHistory.length > MAX_HISTORY) {
            evaluationHistory.pop();
        }

        // Update current pattern
        currentPattern = pattern;

        // Broadcast to WebSocket clients
        broadcastToClients({
            type: 'evaluation',
            eventCount: events.length,
            evalTime
        });

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
            errorType: error.constructor.name,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Analyze pattern without full query
app.post('/analyze', async (req, res) => {
    const { code } = req.body;

    try {
        const pattern = eval(code);

        res.json({
            success: true,
            isPattern: pattern instanceof Pattern,
            hasQueryArc: typeof pattern?.queryArc === 'function',
            patternType: pattern?.constructor?.name
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            errorType: error.constructor.name
        });
    }
});

// Get current state
app.get('/state', (req, res) => {
    res.json({
        hasPattern: currentPattern !== null,
        historyCount: evaluationHistory.length,
        recentEvaluations: evaluationHistory.slice(0, 10),
        timestamp: Date.now()
    });
});

// Get evaluation history
app.get('/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, MAX_HISTORY);
    res.json({
        history: evaluationHistory.slice(0, limit),
        total: evaluationHistory.length
    });
});

// Reset state
app.post('/reset', (req, res) => {
    currentPattern = null;
    evaluationHistory = [];

    broadcastToClients({ type: 'reset' });

    res.json({ success: true, message: 'State reset' });
});

// Batch evaluate multiple patterns
app.post('/batch-evaluate', async (req, res) => {
    const { patterns, queryStart = 0, queryEnd = 1 } = req.body;

    if (!Array.isArray(patterns)) {
        return res.status(400).json({
            success: false,
            error: 'patterns must be an array'
        });
    }

    const results = [];

    for (const item of patterns) {
        const code = typeof item === 'string' ? item : item.code;
        const name = typeof item === 'object' ? item.name : undefined;

        try {
            const pattern = eval(code);
            const span = new TimeSpan(queryStart, queryEnd);
            const state = new State(span);
            const haps = pattern.queryArc(span, state);

            results.push({
                name,
                success: true,
                eventCount: haps.length,
                events: haps.map(h => ({
                    value: h.value,
                    part: { begin: h.part.begin.valueOf(), end: h.part.end.valueOf() }
                }))
            });
        } catch (error) {
            results.push({
                name,
                success: false,
                error: error.message
            });
        }
    }

    res.json({ results, total: results.length });
});

// WebSocket handling
wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('close', () => {
        clients.delete(ws);
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            // Handle incoming WebSocket commands if needed
            if (message.type === 'evaluate') {
                // Could add async evaluation here
            }
        } catch (e) {
            // Ignore invalid JSON
        }
    });

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Strudel REPL'
    }));
});

// Start server
const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
    console.log(`Strudel REPL server running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`Runtime: ${process.versions.bun ? 'Bun ' + process.versions.bun : 'Node.js ' + process.version}`);
});