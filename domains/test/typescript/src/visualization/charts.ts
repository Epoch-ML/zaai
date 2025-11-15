// src/visualization/charts.ts
/**
 * Chart implementations for the visualization module.
 */

import { BaseComponent, generateUUID, getTimestamp } from '../core/base.js';
import { ComponentType, Status } from '../core/types.js';
import { VisualizationException } from '../core/exceptions.js';
import type {
  IChart,
  ChartType,
  ChartConfig,
  ChartData,
  Dataset,
  DataPoint,
  RenderResult,
  ExportFormat,
  Theme,
  LegendConfig,
  AxesConfig,
  AxisConfig,
  TooltipConfig,
  AnimationConfig
} from './types.js';
import type { UUID } from '../types.js';

/**
 * Abstract base chart
 */
export abstract class BaseChart implements IChart {
  public readonly id: UUID;
  public readonly type: ChartType;
  public config: ChartConfig;
  protected data?: ChartData;
  protected rendered = false;
  protected container?: HTMLElement;

  constructor(type: ChartType, config: ChartConfig) {
    this.id = generateUUID();
    this.type = type;
    this.config = this.mergeWithDefaults(config);
  }

  protected mergeWithDefaults(config: ChartConfig): ChartConfig {
    return {
      width: 800,
      height: 600,
      theme: Theme.DEFAULT,
      responsive: true,
      legend: {
        show: true,
        position: 'top',
        align: 'center',
        orientation: 'horizontal'
      },
      tooltip: {
        show: true,
        shared: false,
        followCursor: true
      },
      animation: {
        enabled: true,
        duration: 750,
        easing: 'easeInOut',
        delay: 0
      },
      ...config,
      type: this.type
    };
  }

  public abstract render(): Promise<RenderResult>;

  public update(data: ChartData): void {
    this.data = data;
    if (this.rendered) {
      this.render();
    }
  }

  public resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    if (this.rendered) {
      this.render();
    }
  }

  public async export(format: ExportFormat): Promise<Uint8Array | string> {
    switch (format) {
      case ExportFormat.JSON:
        return this.exportJSON();
      case ExportFormat.SVG:
        return this.exportSVG();
      case ExportFormat.PNG:
        return this.exportPNG();
      case ExportFormat.HTML:
        return this.exportHTML();
      default:
        throw new VisualizationException(`Unsupported export format: ${format}`);
    }
  }

  protected exportJSON(): string {
    return JSON.stringify({
      type: this.type,
      config: this.config,
      data: this.data
    }, null, 2);
  }

  protected abstract exportSVG(): Promise<string>;
  protected abstract exportPNG(): Promise<Uint8Array>;
  protected abstract exportHTML(): Promise<string>;

  public destroy(): void {
    this.rendered = false;
    this.container = undefined;
    this.data = undefined;
  }

  protected getThemeColors(): string[] {
    const themes: Record<Theme, string[]> = {
      [Theme.DEFAULT]: [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
      ],
      [Theme.DARK]: [
        '#64b5f6', '#81c784', '#ffb74d', '#f06292', '#ba68c8',
        '#4dd0e1', '#fff176', '#90a4ae', '#ff8a65', '#a1887f'
      ],
      [Theme.LIGHT]: [
        '#039be5', '#43a047', '#fb8c00', '#e91e63', '#8e24aa',
        '#00acc1', '#fdd835', '#546e7a', '#ff5722', '#6d4c41'
      ],
      [Theme.COLORFUL]: [
        '#e91e63', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4',
        '#009688', '#4caf50', '#ffeb3b', '#ff9800', '#ff5722'
      ],
      [Theme.MONOCHROME]: [
        '#000000', '#333333', '#666666', '#999999', '#cccccc',
        '#e0e0e0', '#f5f5f5', '#808080', '#404040', '#c0c0c0'
      ],
      [Theme.CUSTOM]: this.config.colors || []
    };

    return themes[this.config.theme || Theme.DEFAULT] || themes[Theme.DEFAULT];
  }

  protected formatValue(value: unknown, format?: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (format) {
      // Apply custom format
      if (format.includes('%')) {
        return `${(Number(value) * 100).toFixed(2)}%`;
      }
      if (format.includes('$')) {
        return `$${Number(value).toFixed(2)}`;
      }
      if (format.includes(',')) {
        return Number(value).toLocaleString();
      }
    }

    return String(value);
  }
}

/**
 * Line chart implementation
 */
export class LineChart extends BaseChart {
  constructor(config: ChartConfig = {}) {
    super(ChartType.LINE, config);
  }

  public async render(): Promise<RenderResult> {
    if (!this.data) {
      throw new VisualizationException('No data provided for line chart');
    }

    const svg = this.createSVG();
    const html = this.createHTML();

    this.rendered = true;

    return {
      svg,
      html,
      config: this.config
    };
  }

  private createSVG(): string {
    const { width = 800, height = 600 } = this.config;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    
    const colors = this.getThemeColors();
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Background
    svg += `<rect width="${width}" height="${height}" fill="white"/>`;
    
    // Title
    if (this.config.title) {
      svg += `<text x="${width / 2}" y="20" text-anchor="middle" font-size="16" font-weight="bold">${this.config.title}</text>`;
    }
    
    // Plot area
    svg += `<g transform="translate(${margin.left},${margin.top})">`;
    
    // Draw axes
    svg += this.drawAxes(plotWidth, plotHeight);
    
    // Draw lines for each dataset
    if (this.data?.datasets) {
      this.data.datasets.forEach((dataset, index) => {
        const color = dataset.borderColor || colors[index % colors.length];
        svg += this.drawLine(dataset, plotWidth, plotHeight, color as string);
      });
    }
    
    svg += `</g>`;
    
    // Legend
    if (this.config.legend?.show && this.data?.datasets) {
      svg += this.drawLegend(this.data.datasets, colors);
    }
    
    svg += `</svg>`;
    return svg;
  }

  private drawLine(dataset: Dataset, width: number, height: number, color: string): string {
    const points = dataset.data as Array<{ x: number; y: number }>;
    if (!points || points.length === 0) return '';
    
    // Calculate scales
    const xMin = Math.min(...points.map(p => p.x));
    const xMax = Math.max(...points.map(p => p.x));
    const yMin = Math.min(...points.map(p => p.y));
    const yMax = Math.max(...points.map(p => p.y));
    
    const xScale = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
    const yScale = (y: number) => height - ((y - yMin) / (yMax - yMin)) * height;
    
    // Create path
    let path = `M ${xScale(points[0]!.x)} ${yScale(points[0]!.y)}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${xScale(points[i]!.x)} ${yScale(points[i]!.y)}`;
    }
    
    return `<path d="${path}" stroke="${color}" stroke-width="2" fill="none"/>`;
  }

  private drawAxes(width: number, height: number): string {
    let axes = '';
    
    // X-axis
    axes += `<line x1="0" y1="${height}" x2="${width}" y2="${height}" stroke="black" stroke-width="1"/>`;
    
    // Y-axis
    axes += `<line x1="0" y1="0" x2="0" y2="${height}" stroke="black" stroke-width="1"/>`;
    
    // X-axis label
    if (this.config.axes?.x?.label) {
      axes += `<text x="${width / 2}" y="${height + 40}" text-anchor="middle" font-size="12">${this.config.axes.x.label}</text>`;
    }
    
    // Y-axis label
    if (this.config.axes?.y?.label) {
      axes += `<text x="-30" y="${height / 2}" text-anchor="middle" font-size="12" transform="rotate(-90, -30, ${height / 2})">${this.config.axes.y.label}</text>`;
    }
    
    return axes;
  }

  private drawLegend(datasets: Dataset[], colors: string[]): string {
    const x = (this.config.width || 800) - 150;
    const y = 50;
    let legend = `<g transform="translate(${x}, ${y})">`;
    
    datasets.forEach((dataset, index) => {
      const color = dataset.borderColor || colors[index % colors.length];
      const yPos = index * 20;
      
      legend += `<rect x="0" y="${yPos}" width="15" height="15" fill="${color}"/>`;
      legend += `<text x="20" y="${yPos + 12}" font-size="12">${dataset.label || `Series ${index + 1}`}</text>`;
    });
    
    legend += `</g>`;
    return legend;
  }

  private createHTML(): string {
    return `
      <div class="chart-container" style="width: ${this.config.width}px; height: ${this.config.height}px;">
        ${this.createSVG()}
      </div>
    `;
  }

  protected async exportSVG(): Promise<string> {
    return this.createSVG();
  }

  protected async exportPNG(): Promise<Uint8Array> {
    // Mock PNG export - in production, use canvas or image conversion library
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  }

  protected async exportHTML(): Promise<string> {
    return this.createHTML();
  }
}

/**
 * Bar chart implementation
 */
export class BarChart extends BaseChart {
  constructor(config: ChartConfig = {}) {
    super(ChartType.BAR, config);
  }

  public async render(): Promise<RenderResult> {
    if (!this.data) {
      throw new VisualizationException('No data provided for bar chart');
    }

    const svg = this.createSVG();
    const html = this.createHTML();

    this.rendered = true;

    return {
      svg,
      html,
      config: this.config
    };
  }

  private createSVG(): string {
    const { width = 800, height = 600 } = this.config;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    
    const colors = this.getThemeColors();
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Background
    svg += `<rect width="${width}" height="${height}" fill="white"/>`;
    
    // Title
    if (this.config.title) {
      svg += `<text x="${width / 2}" y="20" text-anchor="middle" font-size="16" font-weight="bold">${this.config.title}</text>`;
    }
    
    // Plot area
    svg += `<g transform="translate(${margin.left},${margin.top})">`;
    
    // Draw bars
    if (this.data?.datasets && this.data.labels) {
      const barWidth = plotWidth / this.data.labels.length;
      const datasetWidth = barWidth / this.data.datasets.length;
      
      this.data.datasets.forEach((dataset, datasetIndex) => {
        const color = dataset.backgroundColor || colors[datasetIndex % colors.length];
        
        (dataset.data as number[]).forEach((value, index) => {
          const x = index * barWidth + datasetIndex * datasetWidth;
          const barHeight = (value / this.getMaxValue()) * plotHeight;
          const y = plotHeight - barHeight;
          
          svg += `<rect x="${x}" y="${y}" width="${datasetWidth * 0.8}" height="${barHeight}" fill="${color}"/>`;
        });
      });
    }
    
    // Draw axes
    svg += this.drawAxes(plotWidth, plotHeight);
    
    svg += `</g>`;
    svg += `</svg>`;
    
    return svg;
  }

  private getMaxValue(): number {
    if (!this.data?.datasets) return 1;
    
    let max = 0;
    for (const dataset of this.data.datasets) {
      for (const value of dataset.data as number[]) {
        max = Math.max(max, value);
      }
    }
    
    return max || 1;
  }

  private drawAxes(width: number, height: number): string {
    let axes = '';
    
    // X-axis
    axes += `<line x1="0" y1="${height}" x2="${width}" y2="${height}" stroke="black" stroke-width="1"/>`;
    
    // Y-axis
    axes += `<line x1="0" y1="0" x2="0" y2="${height}" stroke="black" stroke-width="1"/>`;
    
    // X-axis labels
    if (this.data?.labels) {
      const barWidth = width / this.data.labels.length;
      this.data.labels.forEach((label, index) => {
        const x = index * barWidth + barWidth / 2;
        axes += `<text x="${x}" y="${height + 20}" text-anchor="middle" font-size="10">${label}</text>`;
      });
    }
    
    return axes;
  }

  private createHTML(): string {
    return `
      <div class="chart-container" style="width: ${this.config.width}px; height: ${this.config.height}px;">
        ${this.createSVG()}
      </div>
    `;
  }

  protected async exportSVG(): Promise<string> {
    return this.createSVG();
  }

  protected async exportPNG(): Promise<Uint8Array> {
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  }

  protected async exportHTML(): Promise<string> {
    return this.createHTML();
  }
}

/**
 * Pie chart implementation
 */
export class PieChart extends BaseChart {
  constructor(config: ChartConfig = {}) {
    super(ChartType.PIE, config);
  }

  public async render(): Promise<RenderResult> {
    if (!this.data || !this.data.datasets || this.data.datasets.length === 0) {
      throw new VisualizationException('No data provided for pie chart');
    }

    const svg = this.createSVG();
    const html = this.createHTML();

    this.rendered = true;

    return {
      svg,
      html,
      config: this.config
    };
  }

  private createSVG(): string {
    const { width = 800, height = 600 } = this.config;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;
    
    const colors = this.getThemeColors();
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Background
    svg += `<rect width="${width}" height="${height}" fill="white"/>`;
    
    // Title
    if (this.config.title) {
      svg += `<text x="${centerX}" y="30" text-anchor="middle" font-size="16" font-weight="bold">${this.config.title}</text>`;
    }
    
    // Draw pie slices
    if (this.data?.datasets && this.data.datasets[0]) {
      const dataset = this.data.datasets[0];
      const values = dataset.data as number[];
      const total = values.reduce((sum, val) => sum + val, 0);
      
      let currentAngle = -Math.PI / 2;
      
      values.forEach((value, index) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        const endAngle = currentAngle + sliceAngle;
        
        const x1 = centerX + radius * Math.cos(currentAngle);
        const y1 = centerY + radius * Math.sin(currentAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);
        
        const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
        
        const color = colors[index % colors.length];
        const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
        
        svg += `<path d="${path}" fill="${color}" stroke="white" stroke-width="2"/>`;
        
        // Add label
        if (this.data.labels && this.data.labels[index]) {
          const labelAngle = currentAngle + sliceAngle / 2;
          const labelX = centerX + (radius * 0.7) * Math.cos(labelAngle);
          const labelY = centerY + (radius * 0.7) * Math.sin(labelAngle);
          const percentage = ((value / total) * 100).toFixed(1);
          
          svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="12" fill="white">${percentage}%</text>`;
        }
        
        currentAngle = endAngle;
      });
    }
    
    // Legend
    if (this.config.legend?.show && this.data?.labels) {
      svg += this.drawLegend(this.data.labels, colors);
    }
    
    svg += `</svg>`;
    return svg;
  }

  private drawLegend(labels: string[], colors: string[]): string {
    const x = (this.config.width || 800) - 150;
    const y = 100;
    let legend = `<g transform="translate(${x}, ${y})">`;
    
    labels.forEach((label, index) => {
      const yPos = index * 20;
      legend += `<rect x="0" y="${yPos}" width="15" height="15" fill="${colors[index % colors.length]}"/>`;
      legend += `<text x="20" y="${yPos + 12}" font-size="12">${label}</text>`;
    });
    
    legend += `</g>`;
    return legend;
  }

  private createHTML(): string {
    return `
      <div class="chart-container" style="width: ${this.config.width}px; height: ${this.config.height}px;">
        ${this.createSVG()}
      </div>
    `;
  }

  protected async exportSVG(): Promise<string> {
    return this.createSVG();
  }

  protected async exportPNG(): Promise<Uint8Array> {
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  }

  protected async exportHTML(): Promise<string> {
    return this.createHTML();
  }
}

/**
 * Scatter plot implementation
 */
export class ScatterChart extends BaseChart {
  constructor(config: ChartConfig = {}) {
    super(ChartType.SCATTER, config);
  }

  public async render(): Promise<RenderResult> {
    if (!this.data) {
      throw new VisualizationException('No data provided for scatter chart');
    }

    const svg = this.createSVG();
    const html = this.createHTML();

    this.rendered = true;

    return {
      svg,
      html,
      config: this.config
    };
  }

  private createSVG(): string {
    const { width = 800, height = 600 } = this.config;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    
    const colors = this.getThemeColors();
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    
    svg += `<rect width="${width}" height="${height}" fill="white"/>`;
    
    if (this.config.title) {
      svg += `<text x="${width / 2}" y="20" text-anchor="middle" font-size="16" font-weight="bold">${this.config.title}</text>`;
    }
    
    svg += `<g transform="translate(${margin.left},${margin.top})">`;
    
    // Draw points for each dataset
    if (this.data?.datasets) {
      this.data.datasets.forEach((dataset, index) => {
        const color = dataset.borderColor || colors[index % colors.length];
        const points = dataset.data as Array<{ x: number; y: number }>;
        
        // Calculate scales
        const xMin = Math.min(...points.map(p => p.x));
        const xMax = Math.max(...points.map(p => p.x));
        const yMin = Math.min(...points.map(p => p.y));
        const yMax = Math.max(...points.map(p => p.y));
        
        const xScale = (x: number) => ((x - xMin) / (xMax - xMin)) * plotWidth;
        const yScale = (y: number) => plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;
        
        points.forEach(point => {
          svg += `<circle cx="${xScale(point.x)}" cy="${yScale(point.y)}" r="4" fill="${color}"/>`;
        });
      });
    }
    
    // Draw axes
    svg += `<line x1="0" y1="${plotHeight}" x2="${plotWidth}" y2="${plotHeight}" stroke="black" stroke-width="1"/>`;
    svg += `<line x1="0" y1="0" x2="0" y2="${plotHeight}" stroke="black" stroke-width="1"/>`;
    
    svg += `</g>`;
    svg += `</svg>`;
    
    return svg;
  }

  private createHTML(): string {
    return `
      <div class="chart-container" style="width: ${this.config.width}px; height: ${this.config.height}px;">
        ${this.createSVG()}
      </div>
    `;
  }

  protected async exportSVG(): Promise<string> {
    return this.createSVG();
  }

  protected async exportPNG(): Promise<Uint8Array> {
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  }

  protected async exportHTML(): Promise<string> {
    return this.createHTML();
  }
}

/**
 * Chart factory
 */
export class ChartFactory {
  public static create(type: ChartType, config?: ChartConfig): IChart {
    const chartConfig = config || {};
    
    switch (type) {
      case ChartType.LINE:
        return new LineChart(chartConfig);
      case ChartType.BAR:
        return new BarChart(chartConfig);
      case ChartType.PIE:
        return new PieChart(chartConfig);
      case ChartType.SCATTER:
        return new ScatterChart(chartConfig);
      default:
        throw new VisualizationException(`Unsupported chart type: ${type}`);
    }
  }

  public static createFromData(data: ChartData, config?: ChartConfig): IChart {
    // Infer chart type from data structure
    const type = this.inferChartType(data);
    const chart = this.create(type, config);
    chart.update(data);
    return chart;
  }

  private static inferChartType(data: ChartData): ChartType {
    if (!data.datasets || data.datasets.length === 0) {
      return ChartType.LINE;
    }

    const firstDataPoint = data.datasets[0]?.data[0];
    
    if (typeof firstDataPoint === 'object' && 'x' in firstDataPoint && 'y' in firstDataPoint) {
      return ChartType.SCATTER;
    }
    
    if (data.labels && data.labels.length > 0) {
      return ChartType.BAR;
    }
    
    return ChartType.LINE;
  }
}