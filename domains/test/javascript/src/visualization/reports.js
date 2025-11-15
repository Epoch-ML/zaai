// visualization/reports.js
/**
 * Report generation and building for the visualization module.
 * 
 * This module provides report creation, formatting, and export functionality.
 */

import { VisualizationError } from '../core/exceptions.js';
import { ChartGenerator } from './charts.js';

/**
 * Report section
 */
export class ReportSection {
    constructor(title, content = '', options = {}) {
        this.title = title;
        this.content = content;
        this.level = options.level || 1;
        this.pageBreak = options.pageBreak || false;
        this.subsections = [];
        this.charts = [];
        this.tables = [];
    }

    addSubsection(section) {
        section.level = this.level + 1;
        this.subsections.push(section);
        return this;
    }

    addChart(chart) {
        this.charts.push(chart);
        return this;
    }

    addTable(table) {
        this.tables.push(table);
        return this;
    }

    addContent(content) {
        this.content += '\n' + content;
        return this;
    }

    async render(format = 'html') {
        switch (format) {
            case 'html':
                return this._renderHTML();
            case 'markdown':
                return this._renderMarkdown();
            case 'json':
                return this._renderJSON();
            default:
                throw new VisualizationError(`Unsupported format: ${format}`);
        }
    }

    async _renderHTML() {
        const heading = `<h${this.level}>${this.title}</h${this.level}>`;
        const content = `<div>${this.content}</div>`;
        
        let html = heading + content;
        
        // Render charts
        for (const chart of this.charts) {
            const rendered = await chart.render();
            html += rendered.html;
        }
        
        // Render tables
        for (const table of this.tables) {
            html += this._renderTableHTML(table);
        }
        
        // Render subsections
        for (const subsection of this.subsections) {
            html += await subsection.render('html');
        }
        
        if (this.pageBreak) {
            html += '<div style="page-break-after: always;"></div>';
        }
        
        return html;
    }

    async _renderMarkdown() {
        const heading = '#'.repeat(this.level) + ' ' + this.title;
        let md = heading + '\n\n' + this.content + '\n\n';
        
        // Tables in markdown
        for (const table of this.tables) {
            md += this._renderTableMarkdown(table) + '\n\n';
        }
        
        // Subsections
        for (const subsection of this.subsections) {
            md += await subsection.render('markdown') + '\n\n';
        }
        
        return md;
    }

    _renderJSON() {
        return {
            title: this.title,
            level: this.level,
            content: this.content,
            charts: this.charts.map(c => c.data),
            tables: this.tables,
            subsections: this.subsections.map(s => s._renderJSON())
        };
    }

    _renderTableHTML(table) {
        let html = '<table class="report-table">';
        
        // Headers
        if (table.headers) {
            html += '<thead><tr>';
            for (const header of table.headers) {
                html += `<th>${header}</th>`;
            }
            html += '</tr></thead>';
        }
        
        // Body
        html += '<tbody>';
        for (const row of table.rows) {
            html += '<tr>';
            for (const cell of row) {
                html += `<td>${cell}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        
        return html;
    }

    _renderTableMarkdown(table) {
        let md = '';
        
        // Headers
        if (table.headers) {
            md += '| ' + table.headers.join(' | ') + ' |\n';
            md += '|' + table.headers.map(() => ' --- ').join('|') + '|\n';
        }
        
        // Rows
        for (const row of table.rows) {
            md += '| ' + row.join(' | ') + ' |\n';
        }
        
        return md;
    }
}

/**
 * Report builder
 */
export class ReportBuilder {
    constructor(title = 'Report', options = {}) {
        this.title = title;
        this.metadata = {
            author: options.author || 'Analytics Platform',
            date: options.date || new Date(),
            version: options.version || '1.0',
            description: options.description || ''
        };
        this.sections = [];
        this.theme = options.theme || 'default';
        this.format = options.format || 'html';
        this.chartGenerator = new ChartGenerator({ theme: this.theme });
    }

    /**
     * Add a section to the report
     */
    addSection(title, content = '', options = {}) {
        const section = new ReportSection(title, content, options);
        this.sections.push(section);
        return section;
    }

    /**
     * Add summary section with statistics
     */
    addSummary(data, statistics) {
        const section = this.addSection('Executive Summary');
        
        // Add key metrics
        section.addContent('## Key Metrics\n');
        for (const [key, value] of Object.entries(statistics)) {
            section.addContent(`- **${key}**: ${value}`);
        }
        
        // Add summary chart if applicable
        if (data && data.length > 0) {
            const chart = this.chartGenerator.autoChart(data);
            section.addChart(chart);
        }
        
        return section;
    }

    /**
     * Add data table section
     */
    addDataTable(title, data, options = {}) {
        const section = this.addSection(title);
        
        if (Array.isArray(data) && data.length > 0) {
            const headers = Object.keys(data[0]);
            const rows = data.map(item => 
                headers.map(h => item[h])
            );
            
            section.addTable({
                headers,
                rows,
                ...options
            });
        }
        
        return section;
    }

    /**
     * Add chart section
     */
    addChart(title, chartType, data, options = {}) {
        const section = this.addSection(title);
        const chart = this.chartGenerator.createChart(chartType, data, options);
        section.addChart(chart);
        return section;
    }

    /**
     * Build the complete report
     */
    async build(format = null) {
        format = format || this.format;
        
        switch (format) {
            case 'html':
                return this._buildHTML();
            case 'markdown':
                return this._buildMarkdown();
            case 'pdf':
                return this._buildPDF();
            case 'json':
                return this._buildJSON();
            default:
                throw new VisualizationError(`Unsupported format: ${format}`);
        }
    }

    async _buildHTML() {
        let html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this.title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #333; border-bottom: 2px solid #333; }
                    h2 { color: #666; margin-top: 30px; }
                    h3 { color: #999; }
                    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .metadata { color: #666; font-size: 0.9em; margin-bottom: 30px; }
                    .chart-container { margin: 20px 0; }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            </head>
            <body>
        `;
        
        // Add title and metadata
        html += `<h1>${this.title}</h1>`;
        html += `<div class="metadata">`;
        html += `<p>Author: ${this.metadata.author}</p>`;
        html += `<p>Date: ${this.metadata.date.toLocaleDateString()}</p>`;
        html += `<p>Version: ${this.metadata.version}</p>`;
        if (this.metadata.description) {
            html += `<p>${this.metadata.description}</p>`;
        }
        html += `</div>`;
        
        // Add sections
        for (const section of this.sections) {
            html += await section.render('html');
        }
        
        html += `
            </body>
            </html>
        `;
        
        return html;
    }

    async _buildMarkdown() {
        let md = `# ${this.title}\n\n`;
        
        // Metadata
        md += `**Author:** ${this.metadata.author}\n`;
        md += `**Date:** ${this.metadata.date.toLocaleDateString()}\n`;
        md += `**Version:** ${this.metadata.version}\n\n`;
        
        if (this.metadata.description) {
            md += `${this.metadata.description}\n\n`;
        }
        
        md += '---\n\n';
        
        // Sections
        for (const section of this.sections) {
            md += await section.render('markdown');
            md += '\n\n';
        }
        
        return md;
    }

    async _buildPDF() {
        // In production, would use puppeteer or similar
        const html = await this._buildHTML();
        
        // Mock PDF generation
        return {
            format: 'pdf',
            content: Buffer.from(html),
            pages: this.sections.length,
            message: 'PDF generation would require puppeteer or similar library'
        };
    }

    _buildJSON() {
        return {
            title: this.title,
            metadata: this.metadata,
            sections: this.sections.map(s => s._renderJSON()),
            format: this.format,
            theme: this.theme
        };
    }

    /**
     * Save report to file
     */
    async save(filepath) {
        const fs = await import('fs');
        const path = await import('path');
        
        const ext = path.extname(filepath).toLowerCase();
        let format;
        
        switch (ext) {
            case '.html':
                format = 'html';
                break;
            case '.md':
            case '.markdown':
                format = 'markdown';
                break;
            case '.pdf':
                format = 'pdf';
                break;
            case '.json':
                format = 'json';
                break;
            default:
                format = this.format;
        }
        
        const content = await this.build(format);
        
        if (format === 'pdf' && content.content) {
            await fs.promises.writeFile(filepath, content.content);
        } else if (typeof content === 'string') {
            await fs.promises.writeFile(filepath, content, 'utf-8');
        } else {
            await fs.promises.writeFile(filepath, JSON.stringify(content, null, 2), 'utf-8');
        }
        
        return filepath;
    }
}

/**
 * Dashboard builder for interactive reports
 */
export class DashboardBuilder extends ReportBuilder {
    constructor(title = 'Dashboard', options = {}) {
        super(title, { ...options, format: 'html' });
        this.refreshInterval = options.refreshInterval || null;
        this.interactive = options.interactive ?? true;
        this.widgets = [];
    }

    /**
     * Add a widget to the dashboard
     */
    addWidget(widget) {
        this.widgets.push(widget);
        return this;
    }

    /**
     * Add a real-time chart widget
     */
    addRealtimeChart(title, dataSource, chartType, options = {}) {
        const widget = {
            type: 'realtime-chart',
            title,
            dataSource,
            chartType,
            options,
            refreshInterval: options.refreshInterval || 5000
        };
        
        return this.addWidget(widget);
    }

    /**
     * Add a metric card widget
     */
    addMetricCard(title, value, options = {}) {
        const widget = {
            type: 'metric-card',
            title,
            value,
            trend: options.trend || null,
            icon: options.icon || null,
            color: options.color || '#333'
        };
        
        return this.addWidget(widget);
    }

    /**
     * Add a data grid widget
     */
    addDataGrid(title, dataSource, options = {}) {
        const widget = {
            type: 'data-grid',
            title,
            dataSource,
            columns: options.columns || null,
            sortable: options.sortable ?? true,
            filterable: options.filterable ?? true,
            pageSize: options.pageSize || 20
        };
        
        return this.addWidget(widget);
    }

    /**
     * Add a gauge widget
     */
    addGauge(title, value, min = 0, max = 100, options = {}) {
        const widget = {
            type: 'gauge',
            title,
            value,
            min,
            max,
            thresholds: options.thresholds || [
                { value: 30, color: '#28a745' },
                { value: 70, color: '#ffc107' },
                { value: 90, color: '#dc3545' }
            ],
            unit: options.unit || '%'
        };
        
        return this.addWidget(widget);
    }

    async _buildHTML() {
        let html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this.title}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        padding: 20px;
                    }
                    .dashboard-header {
                        background: rgba(255, 255, 255, 0.95);
                        padding: 20px 30px;
                        border-radius: 12px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                        margin-bottom: 30px;
                        backdrop-filter: blur(10px);
                    }
                    .dashboard-header h1 {
                        color: #333;
                        font-size: 2em;
                        margin-bottom: 10px;
                    }
                    .dashboard-header p {
                        color: #666;
                        font-size: 0.9em;
                    }
                    .dashboard-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                        gap: 20px;
                        margin-bottom: 30px;
                    }
                    .widget {
                        background: rgba(255, 255, 255, 0.95);
                        padding: 20px;
                        border-radius: 12px;
                        box-shadow: 0 5px 20px rgba(0,0,0,0.1);
                        backdrop-filter: blur(10px);
                        transition: transform 0.3s ease, box-shadow 0.3s ease;
                    }
                    .widget:hover {
                        transform: translateY(-5px);
                        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                    }
                    .widget h3 {
                        color: #444;
                        font-size: 1.1em;
                        margin-bottom: 15px;
                        padding-bottom: 10px;
                        border-bottom: 2px solid #f0f0f0;
                    }
                    .metric-card {
                        text-align: center;
                        padding: 30px 20px;
                    }
                    .metric-value {
                        font-size: 3em;
                        font-weight: 700;
                        color: #333;
                        line-height: 1;
                        margin-bottom: 10px;
                    }
                    .metric-title {
                        color: #777;
                        font-size: 0.95em;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        margin-top: 15px;
                    }
                    .metric-trend {
                        display: inline-block;
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 0.85em;
                        font-weight: 600;
                        margin-top: 10px;
                    }
                    .metric-trend.positive {
                        background: #d4f4dd;
                        color: #28a745;
                    }
                    .metric-trend.negative {
                        background: #fce4e4;
                        color: #dc3545;
                    }
                    .chart-widget {
                        grid-column: span 2;
                    }
                    .gauge-container {
                        position: relative;
                        width: 200px;
                        height: 100px;
                        margin: 20px auto;
                    }
                    .data-grid {
                        overflow-x: auto;
                    }
                    .data-grid table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    .data-grid th,
                    .data-grid td {
                        padding: 10px;
                        text-align: left;
                        border-bottom: 1px solid #f0f0f0;
                    }
                    .data-grid th {
                        background: #f8f9fa;
                        font-weight: 600;
                        color: #555;
                        cursor: pointer;
                    }
                    .data-grid tr:hover {
                        background: #f8f9fa;
                    }
                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.7; }
                        100% { opacity: 1; }
                    }
                    .updating {
                        animation: pulse 1s infinite;
                    }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            </head>
            <body>
                <div class="dashboard-header">
                    <h1>${this.title}</h1>
                    <p>Last updated: <span id="last-updated">${new Date().toLocaleString()}</span></p>
                </div>
                <div class="dashboard-grid">
        `;
        
        // Add widgets
        for (const widget of this.widgets) {
            html += this._renderWidget(widget);
        }
        
        // Add sections in a separate container
        if (this.sections.length > 0) {
            html += `</div><div class="dashboard-sections">`;
            for (const section of this.sections) {
                html += `<div class="widget" style="margin-bottom: 20px;">`;
                html += await section.render('html');
                html += `</div>`;
            }
        }
        
        html += `
                </div>
                <script>
                    // Auto-refresh if configured
                    ${this.refreshInterval ? `
                    setInterval(() => {
                        document.body.classList.add('updating');
                        setTimeout(() => {
                            location.reload();
                        }, 500);
                    }, ${this.refreshInterval});
                    ` : ''}
                    
                    // Update timestamp
                    setInterval(() => {
                        document.getElementById('last-updated').textContent = new Date().toLocaleString();
                    }, 1000);

                    // Sortable table headers
                    document.querySelectorAll('.data-grid th').forEach(th => {
                        th.addEventListener('click', () => {
                            console.log('Sort by', th.textContent);
                        });
                    });
                </script>
            </body>
            </html>
        `;
        
        return html;
    }

    _renderWidget(widget) {
        switch (widget.type) {
            case 'metric-card':
                return this._renderMetricCard(widget);
            case 'realtime-chart':
                return this._renderRealtimeChart(widget);
            case 'data-grid':
                return this._renderDataGrid(widget);
            case 'gauge':
                return this._renderGauge(widget);
            default:
                return `<div class="widget">Unknown widget type: ${widget.type}</div>`;
        }
    }

    _renderMetricCard(widget) {
        const trendClass = widget.trend && widget.trend > 0 ? 'positive' : 'negative';
        const trendIcon = widget.trend 
            ? (widget.trend > 0 ? '▲' : '▼')
            : '';
        
        return `
            <div class="widget metric-card">
                <div class="metric-value" style="color: ${widget.color}">
                    ${widget.value}
                </div>
                <div class="metric-title">${widget.title}</div>
                ${widget.trend !== null ? `
                    <div class="metric-trend ${trendClass}">
                        ${trendIcon} ${Math.abs(widget.trend)}%
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderRealtimeChart(widget) {
        const chartId = `chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div class="widget chart-widget">
                <h3>${widget.title}</h3>
                <canvas id="${chartId}"></canvas>
                <script>
                    (function() {
                        const ctx = document.getElementById('${chartId}').getContext('2d');
                        const chart = new Chart(ctx, {
                            type: '${widget.chartType}',
                            data: { 
                                labels: [],
                                datasets: [{
                                    label: '${widget.title}',
                                    data: [],
                                    borderColor: '#667eea',
                                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                                    borderWidth: 2,
                                    tension: 0.4
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        display: false
                                    }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true
                                    }
                                },
                                ...${JSON.stringify(widget.options || {})}
                            }
                        });
                        
                        // Update data periodically
                        setInterval(async () => {
                            const newData = Math.random() * 100;
                            const newLabel = new Date().toLocaleTimeString();
                            
                            chart.data.labels.push(newLabel);
                            chart.data.datasets[0].data.push(newData);
                            
                            // Keep last 20 points
                            if (chart.data.labels.length > 20) {
                                chart.data.labels.shift();
                                chart.data.datasets[0].data.shift();
                            }
                            
                            chart.update('none'); // No animation for smoother updates
                        }, ${widget.refreshInterval});
                    })();
                </script>
            </div>
        `;
    }

    _renderDataGrid(widget) {
        // Mock data for demonstration
        const mockData = [
            { id: 1, name: 'Item 1', value: 100, status: 'Active' },
            { id: 2, name: 'Item 2', value: 200, status: 'Pending' },
            { id: 3, name: 'Item 3', value: 150, status: 'Active' },
            { id: 4, name: 'Item 4', value: 300, status: 'Completed' },
            { id: 5, name: 'Item 5', value: 250, status: 'Active' }
        ];
        
        const columns = widget.columns || (mockData.length > 0 ? Object.keys(mockData[0]) : []);
        
        return `
            <div class="widget data-grid" style="grid-column: span 2;">
                <h3>${widget.title}</h3>
                <table>
                    <thead>
                        <tr>
                            ${columns.map(col => `<th>${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${mockData.slice(0, 5).map(row => `
                            <tr>
                                ${columns.map(col => `<td>${row[col] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    _renderGauge(widget) {
        const percentage = ((widget.value - widget.min) / (widget.max - widget.min)) * 100;
        const rotation = (percentage * 180 / 100) - 90;
        
        return `
            <div class="widget">
                <h3>${widget.title}</h3>
                <div class="gauge-container">
                    <svg viewBox="0 0 200 100" style="width: 100%; height: 100%;">
                        <!-- Background arc -->
                        <path d="M 10 90 A 80 80 0 0 1 190 90" 
                              fill="none" 
                              stroke="#e0e0e0" 
                              stroke-width="10"/>
                        
                        <!-- Value arc -->
                        <path d="M 10 90 A 80 80 0 0 1 190 90" 
                              fill="none" 
                              stroke="#667eea" 
                              stroke-width="10"
                              stroke-dasharray="${percentage * 2.51} 251"
                              stroke-linecap="round"/>
                        
                        <!-- Center text -->
                        <text x="100" y="85" 
                              text-anchor="middle" 
                              font-size="24" 
                              font-weight="bold" 
                              fill="#333">
                            ${widget.value}${widget.unit}
                        </text>
                    </svg>
                </div>
            </div>
        `;
    }
}

/**
 * Create a basic report
 */
export function createReport(title, data, options = {}) {
    const report = new ReportBuilder(title, options);
    
    // Auto-generate sections based on data
    if (Array.isArray(data) && data.length > 0) {
        report.addDataTable('Data', data);
    }
    
    return report;
}

/**
 * Create a dashboard
 */
export function createDashboard(title, options = {}) {
    return new DashboardBuilder(title, options);
}