// Strudel REPL Client
// Handles UI interactions and API communication

let lastEvents = [];

// Piano roll visualization
function drawPianoRoll(events) {
    const canvas = document.getElementById('pianoroll');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const width = rect.width;
    const height = rect.height;

    // Background
    ctx.fillStyle = '#16161e';
    ctx.fillRect(0, 0, width, height);

    if (!events || events.length === 0) {
        ctx.fillStyle = '#565f89';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Pattern visualization', width / 2, height / 2);
        return;
    }

    const cycles = parseFloat(document.getElementById('cycles').value) || 1;

    // Grid lines
    ctx.strokeStyle = '#292e42';
    for (let i = 0; i <= cycles; i++) {
        const x = (i / cycles) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Parse note values
    const noteData = events.map(e => {
        let noteNum = 60;
        const val = e.value;
        if (typeof val === 'string') {
            noteNum = parseNote(val);
        } else if (typeof val === 'number') {
            noteNum = val;
        } else if (val?.note) {
            noteNum = typeof val.note === 'string' ? parseNote(val.note) : val.note;
        } else if (val?.n !== undefined) {
            noteNum = val.n;
        }
        return { ...e, noteNum };
    });

    // Find note range
    const nums = noteData.map(e => e.noteNum).filter(n => !isNaN(n));
    const minNote = Math.min(...nums, 48) - 2;
    const maxNote = Math.max(...nums, 72) + 2;
    const range = maxNote - minNote || 24;

    // Colors for events
    const colors = ['#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#bb9af7', '#7dcfff'];

    // Draw events
    noteData.forEach((e, i) => {
        const x = (e.part.begin / cycles) * width;
        const w = Math.max(((e.part.end - e.part.begin) / cycles) * width - 2, 4);
        const y = (1 - (e.noteNum - minNote) / range) * (height - 20) + 10;
        const h = Math.max((height - 20) / range - 2, 8);

        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.roundRect(x + 1, y - h / 2, w, h, 3);
        ctx.fill();

        // Label if enough space
        if (w > 30) {
            ctx.fillStyle = '#1a1b26';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(formatValue(e.value), x + 5, y + 3);
        }
    });
}

// Parse note string to MIDI number
function parseNote(str) {
    const m = str.match(/([a-gA-G])([#b]?)(\d+)?/);
    if (!m) return 60;
    const notes = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    let n = notes[m[1].toLowerCase()] || 0;
    if (m[2] === '#') n++;
    if (m[2] === 'b') n--;
    return n + ((parseInt(m[3]) || 4) + 1) * 12;
}

// Format value for display
function formatValue(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return v.toString();
    if (v?.note) return v.note;
    if (v?.s) return v.s;
    return JSON.stringify(v);
}

// Evaluate pattern
async function runEval() {
    const code = document.getElementById('code').value;
    const cycles = parseFloat(document.getElementById('cycles').value) || 1;

    try {
        const res = await fetch('/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, queryStart: 0, queryEnd: cycles })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('statusDot').className = 'status-dot';
            document.getElementById('stats').style.display = 'flex';
            document.getElementById('eventCount').textContent = data.eventCount;
            document.getElementById('queryRange').textContent = '0 - ' + cycles;
            document.getElementById('evalTime').textContent = data.evalTime + 'ms';

            lastEvents = data.events;
            drawPianoRoll(data.events);

            // Render events list
            let html = '<div class="events-list">';
            data.events.forEach(e => {
                html += `<div class="event-item">
                    <span class="event-value">${formatValue(e.value)}</span>
                    <span class="event-time">${e.part.begin.toFixed(3)} → ${e.part.end.toFixed(3)}</span>
                    <span class="event-duration">${((e.part.end - e.part.begin) * 1000).toFixed(0)}ms</span>
                </div>`;
            });
            html += '</div>';
            document.getElementById('output').innerHTML = html;
        } else {
            document.getElementById('statusDot').className = 'status-dot error';
            document.getElementById('output').innerHTML = `
                <div class="error-box">
                    <div class="error-type">${data.errorType || 'Error'}</div>
                    <div class="error-message">${data.error}</div>
                </div>`;
            drawPianoRoll([]);
        }
    } catch (err) {
        document.getElementById('statusDot').className = 'status-dot error';
        document.getElementById('output').innerHTML = `
            <div class="error-box">
                <div class="error-type">Network Error</div>
                <div class="error-message">${err.message}</div>
            </div>`;
    }
}

// Reset state
async function runReset() {
    await fetch('/reset', { method: 'POST' });
    document.getElementById('output').innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">✓</div>
            <div>State reset</div>
        </div>`;
    document.getElementById('stats').style.display = 'none';
    lastEvents = [];
    drawPianoRoll([]);
}

// Health check
async function runHealth() {
    const res = await fetch('/health');
    const data = await res.json();
    document.getElementById('output').innerHTML = 
        `<pre style="color:#9ece6a;font-size:13px;">${JSON.stringify(data, null, 2)}</pre>`;
}

// Keyboard shortcuts
document.getElementById('code').addEventListener('keydown', e => {
    // Ctrl+Enter to run
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runEval();
    }
    // Tab for indent
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.substring(0, start) + '  ' + e.target.value.substring(end);
        e.target.selectionStart = e.target.selectionEnd = start + 2;
    }
});

// Resize handler
window.addEventListener('resize', () => drawPianoRoll(lastEvents));

// Initial draw
drawPianoRoll([]);