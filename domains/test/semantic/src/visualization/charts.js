// visualization/charts.js
/**
 * Chart generation utilities for the visualization module.
 * 
 * This module provides chart creation and configuration
 * for various chart types and libraries.
 */

import { VisualizationError } from '../core/exceptions.js';
import { VisualizationConfig } from '../core/config.js';

// Chart types
export const ChartType = Object.freeze({
    LINE: 'line',
    BAR: 'bar',
    PIE: 'pie',
    SCATTER: 'scatter',
    AREA: 'area',
    HISTOGRAM: 'histogram',
    HEATMAP: 'heatmap',
    BOX: 'box',
    RADAR: 'radar',
    TREEMAP: 'treemap'
});

/**
 * Base chart class
 */
export class BaseChart {
    constructor(type, data, options = {}) {
        this.type = type;
        this.data = data;
        this.options = options;
        this.config = new VisualizationConfig(options);
        this.title = options.title || '';
        this.width = options.width || this.config.defaultWidth;
        this.height = options.height || this.config.defaultHeight;
    }

    /**
     * Render the chart
     */
    async render() {
        throw new Error('Method render() must be implemented');
    }

    /**
     * Export chart to format
     */
    async export(format) {
        throw new Error('Method export() must be implemented');
    }

    /**
     * Update chart data
     */
    updateData(data) {
        this.data = data;
    }

    /**
     * Update chart options
     */
    updateOptions(options) {
        this.options = { ...this.options, ...options };
    }
}

/**
 * Line chart
 */
export class LineChart extends BaseChart {
    constructor(data, options = {}) {
        super(ChartType.LINE, data, options);
        this.xField = options.xField || 'x';
        this.yField = options.yField || 'y';
        this.smooth = options.smooth || false;
        this.showPoints = options.showPoints ?? true;
    }

    async render() {
        // Mock render - in production would use Chart.js, D3, etc.
        const config = {
            type: 'line',
            data: this._prepareData(),
            options: this._getOptions()
        };

        return {
            html: this._generateHTML(config),
            config
        };
    }

    _prepareData() {
        if (Array.isArray(this.data)) {
            return {
                labels: this.data.map(d => d[this.xField]),
                datasets: [{
                    label: this.title,
                    data: this.data.map(d => d[this.yField]),
                    smooth: this.smooth
                }]
            };
        }

        return this.data;
    }

    _getOptions() {
        return {
            responsive: true,
            title: { display: !!this.title, text: this.title },
            scales: {
                x: { display: true },
                y: { display: true }
            },
            elements: {
                point: { radius: this.showPoints ? 3 : 0 }
            }
        };
    }

    _generateHTML(config) {
        return `
            <div style="width: ${this.width}px; height: ${this.height}px;">
                <canvas id="chart-${Date.now()}"></canvas>
                <script>
                    new Chart(document.getElementById('chart-${Date.now()}'), ${JSON.stringify(config)});
                </script>
            </div>
        `;
    }

    async export(format) {
        switch (format) {
            case 'png':
                return this._exportPNG();
            case 'svg':
                return this._exportSVG();
            case 'json':
                return this._prepareData();
            default:
                throw new VisualizationError(`Unsupported export format: ${format}`);
        }
    }

    async _exportPNG() {
        // Mock PNG export
        return Buffer.from('mock-png-data');
    }

    async _exportSVG() {
        // Mock SVG export
        return '<svg><!-- chart svg --></svg>';
    }
}

/**
 * Bar chart
 */
export class BarChart extends BaseChart {
    constructor(data, options = {}) {
        super(ChartType.BAR, data, options);
        this.orientation = options.orientation || 'vertical';
        this.stacked = options.stacked || false;
        this.categoryField = options.categoryField || 'category';
        this.valueField = options.valueField || 'value';
    }

    async render() {
        const config = {
            type: this.orientation === 'horizontal' ? 'horizontalBar' : 'bar',
            data: this._prepareData(),
            options: this._getOptions()
        };

        return {
            html: this._generateHTML(config),
            config
        };
    }

    _prepareData() {
        if (Array.isArray(this.data)) {
            return {
                labels: this.data.map(d => d[this.categoryField]),
                datasets: [{
                    label: this.title,
                    data: this.data.map(d => d[this.valueField]),
                    backgroundColor: this.config.colorPalette
                }]
            };
        }

        return this.data;
    }

    _getOptions() {
        return {
            responsive: true,
            title: { display: !!this.title, text: this.title },
            scales: {
                x: { stacked: this.stacked },
                y: { stacked: this.stacked }
            }
        };
    }

    _generateHTML(config) {
        return `
            <div style="width: ${this.width}px; height: ${this.height}px;">
                <canvas id="chart-${Date.now()}"></canvas>
                <script>
                    new Chart(document.getElementById('chart-${Date.now()}'), ${JSON.stringify(config)});
                </script>
            </div>
        `;
    }

    async export(format) {
        // Similar to LineChart export
        return super.export(format);
    }
}

/**
 * Pie chart
 */
export class PieChart extends BaseChart {
    constructor(data, options = {}) {
        super(ChartType.PIE, data, options);
        this.labelField = options.labelField || 'label';
        this.valueField = options.valueField || 'value';
        this.donut = options.donut || false;
    }

    async render() {
        const config = {
            type: this.donut ? 'doughnut' : 'pie',
            data: this._prepareData(),
            options: this._getOptions()
        };

        return {
            html: this._generateHTML(config),
            config
        };
    }

    _prepareData() {
        if (Array.isArray(this.data)) {
            return {
                labels: this.data.map(d => d[this.labelField]),
                datasets: [{
                    data: this.data.map(d => d[this.valueField]),
                    backgroundColor: this.config.colorPalette
                }]
            };
        }

        return this.data;
    }

    _getOptions() {
        return {
            responsive: true,
            title: { display: !!this.title, text: this.title },
            legend: { position: 'bottom' }
        };
    }

    _generateHTML(config) {
        return `
            <div style="width: ${this.width}px; height: ${this.height}px;">
                <canvas id="chart-${Date.now()}"></canvas>
                <script>
                    new Chart(document.getElementById('chart-${Date.now()}'), ${JSON.stringify(config)});
                </script>
            </div>
        `;
    }

    async export(format) {
        // Similar to LineChart export
        return super.export(format);
    }
}

/**
 * Chart generator - factory for creating charts
 */
export class ChartGenerator {
    constructor(config = {}) {
        this.config = new VisualizationConfig(config);
        this.theme = config.theme || this.config.defaultTheme;
    }

    /**
     * Create a chart
     */
    createChart(type, data, options = {}) {
        const chartOptions = {
            ...options,
            theme: this.theme
        };

        switch (type) {
            case ChartType.LINE:
                return new LineChart(data, chartOptions);
            
            case ChartType.BAR:
                return new BarChart(data, chartOptions);
            
            case ChartType.PIE:
                return new PieChart(data, chartOptions);
            
            case ChartType.SCATTER:
                return new ScatterChart(data, chartOptions);
            
            case ChartType.AREA:
                return new AreaChart(data, chartOptions);
            
            default:
                throw new VisualizationError(`Unsupported chart type: ${type}`);
        }
    }

    /**
     * Create chart from specification
     */
    createFromSpec(spec) {
        return this.createChart(spec.type, spec.data, spec.options);
    }

    /**
     * Auto-detect best chart type for data
     */
    autoChart(data, options = {}) {
        const chartType = this._detectChartType(data);
        return this.createChart(chartType, data, options);
    }

    _detectChartType(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return ChartType.BAR;
        }

        const firstItem = data[0];
        const keys = Object.keys(firstItem);

        // Simple heuristics for chart type detection
        if (keys.length === 2) {
            const hasNumeric = keys.some(k => 
                typeof firstItem[k] === 'number'
            );
            
            if (hasNumeric) {
                // Check if data looks like time series
                const hasDate = keys.some(k => 
                    this._isDateLike(firstItem[k])
                );
                
                return hasDate ? ChartType.LINE : ChartType.BAR;
            }
        }

        if (keys.length > 3) {
            return ChartType.SCATTER;
        }

        return ChartType.BAR;
    }

    _isDateLike(value) {
        if (value instanceof Date) return true;
        if (typeof value === 'string') {
            const date = new Date(value);
            return !isNaN(date.getTime());
        }
        return false;
    }
}

/**
 * Additional chart types
 */

export class ScatterChart extends BaseChart {
    constructor(data, options = {}) {
        super(ChartType.SCATTER, data, options);
    }

    async render() {
        // Implementation similar to other charts
        return { html: '<div>Scatter Chart</div>' };
    }

    async export(format) {
        return super.export(format);
    }
}

export class AreaChart extends LineChart {
    constructor(data, options = {}) {
        super(data, { ...options, fill: true });
        this.type = ChartType.AREA;
    }
}

export class HeatmapChart extends BaseChart {
    constructor(data, options = {}) {
        super(ChartType.HEATMAP, data, options);
    }

    async render() {
        // Implementation for heatmap
        return { html: '<div>Heatmap Chart</div>' };
    }

    async export(format) {
        return super.export(format);
    }
}