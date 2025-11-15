// src/visualization/exporters.ts
/**
 * Export functionality for the visualization module.
 */

import { VisualizationException } from '../core/exceptions.js';
import type {
  IExporter,
  ExportFormat,
  ExportOptions,
  IChart,
  Report,
  Dashboard,
  Widget,
  Table
} from './types.js';
import type { DataRecord } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Abstract base exporter
 */
export abstract class BaseExporter<T = unknown> implements IExporter<T> {
  public readonly format: ExportFormat;

  constructor(format: ExportFormat) {
    this.format = format;
  }

  public abstract export(data: T, options?: ExportOptions): Promise<Uint8Array | string>;
  
  public canExport(data: unknown): boolean {
    return data !== null && data !== undefined;
  }

  protected async saveToFile(
    content: Uint8Array | string,
    filename: string
  ): Promise<void> {
    const buffer = typeof content === 'string' 
      ? Buffer.from(content, 'utf8')
      : Buffer.from(content);
    
    await fs.promises.writeFile(filename, buffer);
  }

  protected getFileExtension(): string {
    const extensions: Record<ExportFormat, string> = {
      [ExportFormat.JSON]: 'json',
      [ExportFormat.CSV]: 'csv',
      [ExportFormat.EXCEL]: 'xlsx',
      [ExportFormat.PDF]: 'pdf',
      [ExportFormat.PNG]: 'png',
      [ExportFormat.SVG]: 'svg',
      [ExportFormat.HTML]: 'html',
      [ExportFormat.MARKDOWN]: 'md'
    };
    
    return extensions[this.format] || 'txt';
  }
}

/**
 * JSON Exporter
 */
export class JSONExporter extends BaseExporter<any> {
  constructor() {
    super(ExportFormat.JSON);
  }

  public async export(data: any, options?: ExportOptions): Promise<string> {
    const indent = options?.metadata?.indent as number || 2;
    const json = JSON.stringify(data, null, indent);
    
    if (options?.filename) {
      await this.saveToFile(json, options.filename);
    }
    
    return json;
  }

  public canExport(data: unknown): boolean {
    try {
      JSON.stringify(data);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * CSV Exporter
 */
export class CSVExporter extends BaseExporter<DataRecord[]> {
  private delimiter = ',';
  private quote = '"';
  private escape = '"';

  constructor() {
    super(ExportFormat.CSV);
  }

  public async export(data: DataRecord[], options?: ExportOptions): Promise<string> {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    // Extract headers
    const headers = this.extractHeaders(data);
    const rows: string[] = [];
    
    // Add header row
    rows.push(this.formatRow(headers));
    
    // Add data rows
    for (const record of data) {
      const values = headers.map(header => this.formatValue(record[header]));
      rows.push(this.formatRow(values));
    }
    
    const csv = rows.join('\n');
    
    if (options?.filename) {
      await this.saveToFile(csv, options.filename);
    }
    
    return csv;
  }

  private extractHeaders(data: DataRecord[]): string[] {
    const headers = new Set<string>();
    
    for (const record of data) {
      Object.keys(record).forEach(key => headers.add(key));
    }
    
    return Array.from(headers);
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    
    // Check if value needs quoting
    if (
      stringValue.includes(this.delimiter) ||
      stringValue.includes(this.quote) ||
      stringValue.includes('\n') ||
      stringValue.includes('\r')
    ) {
      // Escape quotes by doubling them
      const escaped = stringValue.replace(
        new RegExp(this.quote, 'g'),
        this.escape + this.quote
      );
      return `${this.quote}${escaped}${this.quote}`;
    }
    
    return stringValue;
  }

  private formatRow(values: string[]): string {
    return values.join(this.delimiter);
  }

  public canExport(data: unknown): boolean {
    return Array.isArray(data);
  }
}

/**
 * HTML Exporter
 */
export class HTMLExporter extends BaseExporter<any> {
  constructor() {
    super(ExportFormat.HTML);
  }

  public async export(data: any, options?: ExportOptions): Promise<string> {
    const title = options?.metadata?.title as string || 'Export';
    const html = this.createHTML(data, title);
    
    if (options?.filename) {
      await this.saveToFile(html, options.filename);
    }
    
    return html;
  }

  private createHTML(data: any, title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        th {
            background-color: #f8f8f8;
            font-weight: 600;
        }
        .chart-container {
            margin: 20px 0;
        }
        .metric {
            display: inline-block;
            margin: 10px;
            padding: 15px;
            background: #f0f0f0;
            border-radius: 4px;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #2196f3;
        }
        .metric-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${title}</h1>
        ${this.renderContent(data)}
    </div>
</body>
</html>`;
  }

  private renderContent(data: any): string {
    if (Array.isArray(data)) {
      return this.renderTable(data);
    }
    
    if (typeof data === 'object' && data !== null) {
      if ('sections' in data) {
        // Render as report
        return this.renderReport(data as Report);
      }
      if ('widgets' in data) {
        // Render as dashboard
        return this.renderDashboard(data as Dashboard);
      }
      return this.renderObject(data);
    }
    
    return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  }

  private renderTable(data: any[]): string {
    if (data.length === 0) return '<p>No data</p>';
    
    const headers = Object.keys(data[0]);
    
    let html = '<table>';
    html += '<thead><tr>';
    headers.forEach(header => {
      html += `<th>${header}</th>`;
    });
    html += '</tr></thead>';
    
    html += '<tbody>';
    data.forEach(row => {
      html += '<tr>';
      headers.forEach(header => {
        html += `<td>${row[header] ?? ''}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    
    return html;
  }

  private renderObject(data: Record<string, any>): string {
    let html = '<dl>';
    
    for (const [key, value] of Object.entries(data)) {
      html += `<dt><strong>${key}:</strong></dt>`;
      html += `<dd>${typeof value === 'object' ? JSON.stringify(value) : value}</dd>`;
    }
    
    html += '</dl>';
    return html;
  }

  private renderReport(report: Report): string {
    let html = '';
    
    if (report.config.description) {
      html += `<p>${report.config.description}</p>`;
    }
    
    report.sections.forEach(section => {
      html += `<section>`;
      html += `<h${section.level + 1}>${section.title}</h${section.level + 1}>`;
      
      if (section.content) {
        html += `<div>${section.content}</div>`;
      }
      
      if (section.tables) {
        section.tables.forEach(table => {
          html += this.renderTableElement(table);
        });
      }
      
      if (section.subsections) {
        section.subsections.forEach(subsection => {
          html += this.renderReport({ 
            id: report.id,
            config: report.config,
            sections: [subsection]
          });
        });
      }
      
      html += `</section>`;
    });
    
    return html;
  }

  private renderTableElement(table: Table): string {
    let html = '<table>';
    
    if (table.caption) {
      html += `<caption>${table.caption}</caption>`;
    }
    
    if (table.headers) {
      html += '<thead><tr>';
      table.headers.forEach(header => {
        html += `<th>${header}</th>`;
      });
      html += '</tr></thead>';
    }
    
    html += '<tbody>';
    table.rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => {
        html += `<td>${cell ?? ''}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    
    return html;
  }

  private renderDashboard(dashboard: Dashboard): string {
    let html = '<div class="dashboard">';
    
    dashboard.widgets.forEach(widget => {
      html += this.renderWidget(widget);
    });
    
    html += '</div>';
    return html;
  }

  private renderWidget(widget: Widget): string {
    return `
      <div class="widget" style="width: ${widget.size?.width}px; height: ${widget.size?.height}px;">
        <h3>${widget.title || 'Widget'}</h3>
        <div class="widget-content">
          ${JSON.stringify(widget.config)}
        </div>
      </div>
    `;
  }
}

/**
 * Markdown Exporter
 */
export class MarkdownExporter extends BaseExporter<any> {
  constructor() {
    super(ExportFormat.MARKDOWN);
  }

  public async export(data: any, options?: ExportOptions): Promise<string> {
    const title = options?.metadata?.title as string || 'Export';
    const markdown = this.createMarkdown(data, title);
    
    if (options?.filename) {
      await this.saveToFile(markdown, options.filename);
    }
    
    return markdown;
  }

  private createMarkdown(data: any, title: string): string {
    let md = `# ${title}\n\n`;
    
    if (Array.isArray(data)) {
      md += this.renderTable(data);
    } else if (typeof data === 'object' && data !== null) {
      if ('sections' in data) {
        md += this.renderReport(data as Report);
      } else {
        md += this.renderObject(data);
      }
    } else {
      md += `\`\`\`\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
    }
    
    return md;
  }

  private renderTable(data: any[]): string {
    if (data.length === 0) return 'No data\n';
    
    const headers = Object.keys(data[0]);
    
    let md = '| ' + headers.join(' | ') + ' |\n';
    md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    
    data.forEach(row => {
      const values = headers.map(header => String(row[header] ?? ''));
      md += '| ' + values.join(' | ') + ' |\n';
    });
    
    return md + '\n';
  }

  private renderObject(data: Record<string, any>): string {
    let md = '';
    
    for (const [key, value] of Object.entries(data)) {
      md += `**${key}**: `;
      
      if (typeof value === 'object') {
        md += '\n```json\n' + JSON.stringify(value, null, 2) + '\n```\n';
      } else {
        md += `${value}\n`;
      }
      
      md += '\n';
    }
    
    return md;
  }

  private renderReport(report: Report): string {
    let md = '';
    
    if (report.config.description) {
      md += `${report.config.description}\n\n`;
    }
    
    report.sections.forEach(section => {
      const hashes = '#'.repeat(section.level + 1);
      md += `${hashes} ${section.title}\n\n`;
      
      if (section.content) {
        md += `${section.content}\n\n`;
      }
      
      if (section.tables) {
        section.tables.forEach(table => {
          if (table.caption) {
            md += `**${table.caption}**\n\n`;
          }
          md += this.renderTableFromTable(table);
        });
      }
      
      if (section.subsections) {
        section.subsections.forEach(subsection => {
          const subReport: Report = {
            id: report.id,
            config: report.config,
            sections: [subsection]
          };
          md += this.renderReport(subReport);
        });
      }
    });
    
    return md;
  }

  private renderTableFromTable(table: Table): string {
    let md = '';
    
    if (table.headers) {
      md += '| ' + table.headers.join(' | ') + ' |\n';
      md += '| ' + table.headers.map(() => '---').join(' | ') + ' |\n';
    }
    
    table.rows.forEach(row => {
      md += '| ' + row.map(cell => String(cell ?? '')).join(' | ') + ' |\n';
    });
    
    return md + '\n';
  }
}

/**
 * PDF Exporter (mock implementation)
 */
export class PDFExporter extends BaseExporter<any> {
  constructor() {
    super(ExportFormat.PDF);
  }

  public async export(data: any, options?: ExportOptions): Promise<Uint8Array> {
    // Mock PDF generation
    // In production, use a library like pdfkit or puppeteer
    const mockPDF = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, // %PDF-1.4
      0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A        // PDF header
    ]);
    
    if (options?.filename) {
      await this.saveToFile(mockPDF, options.filename);
    }
    
    return mockPDF;
  }
}

/**
 * Excel Exporter (mock implementation)
 */
export class ExcelExporter extends BaseExporter<DataRecord[]> {
  constructor() {
    super(ExportFormat.EXCEL);
  }

  public async export(data: DataRecord[], options?: ExportOptions): Promise<Uint8Array> {
    // Mock Excel generation
    // In production, use a library like exceljs or xlsx
    const mockExcel = new Uint8Array([
      0x50, 0x4B, 0x03, 0x04, // ZIP header for XLSX
      0x14, 0x00, 0x00, 0x00
    ]);
    
    if (options?.filename) {
      await this.saveToFile(mockExcel, options.filename);
    }
    
    return mockExcel;
  }

  public canExport(data: unknown): boolean {
    return Array.isArray(data);
  }
}

/**
 * PNG Exporter (mock implementation)
 */
export class PNGExporter extends BaseExporter<IChart> {
  constructor() {
    super(ExportFormat.PNG);
  }

  public async export(chart: IChart, options?: ExportOptions): Promise<Uint8Array> {
    // Use chart's export method
    const png = await chart.export(ExportFormat.PNG);
    
    if (typeof png === 'string') {
      // Convert base64 to Uint8Array if needed
      const buffer = Buffer.from(png, 'base64');
      return new Uint8Array(buffer);
    }
    
    if (options?.filename) {
      await this.saveToFile(png, options.filename);
    }
    
    return png;
  }

  public canExport(data: unknown): boolean {
    return typeof data === 'object' && 
           data !== null && 
           'export' in data &&
           typeof (data as any).export === 'function';
  }
}

/**
 * SVG Exporter
 */
export class SVGExporter extends BaseExporter<IChart> {
  constructor() {
    super(ExportFormat.SVG);
  }

  public async export(chart: IChart, options?: ExportOptions): Promise<string> {
    const svg = await chart.export(ExportFormat.SVG);
    
    if (options?.filename) {
      await this.saveToFile(svg, options.filename);
    }
    
    return svg as string;
  }

  public canExport(data: unknown): boolean {
    return typeof data === 'object' && 
           data !== null && 
           'export' in data &&
           typeof (data as any).export === 'function';
  }
}

/**
 * Export factory
 */
export class ExporterFactory {
  private static exporters: Map<ExportFormat, IExporter<any>> = new Map([
    [ExportFormat.JSON, new JSONExporter()],
    [ExportFormat.CSV, new CSVExporter()],
    [ExportFormat.HTML, new HTMLExporter()],
    [ExportFormat.MARKDOWN, new MarkdownExporter()],
    [ExportFormat.PDF, new PDFExporter()],
    [ExportFormat.EXCEL, new ExcelExporter()],
    [ExportFormat.PNG, new PNGExporter()],
    [ExportFormat.SVG, new SVGExporter()]
  ]);

  public static getExporter<T = any>(format: ExportFormat): IExporter<T> {
    const exporter = this.exporters.get(format);
    
    if (!exporter) {
      throw new VisualizationException(`No exporter available for format: ${format}`);
    }
    
    return exporter;
  }

  public static async export<T = any>(
    data: T,
    format: ExportFormat,
    options?: ExportOptions
  ): Promise<Uint8Array | string> {
    const exporter = this.getExporter<T>(format);
    
    if (!exporter.canExport(data)) {
      throw new VisualizationException(
        `Data cannot be exported to format: ${format}`
      );
    }
    
    return exporter.export(data, options);
  }

  public static registerExporter<T = any>(
    format: ExportFormat,
    exporter: IExporter<T>
  ): void {
    this.exporters.set(format, exporter);
  }
}

/**
 * Multi-format exporter
 */
export class MultiFormatExporter {
  public async exportAll<T = any>(
    data: T,
    formats: ExportFormat[],
    baseFilename: string
  ): Promise<Map<ExportFormat, Uint8Array | string>> {
    const results = new Map<ExportFormat, Uint8Array | string>();
    
    for (const format of formats) {
      const exporter = ExporterFactory.getExporter<T>(format);
      const extension = this.getExtension(format);
      const filename = `${baseFilename}.${extension}`;
      
      const result = await exporter.export(data, { 
        format,
        filename 
      });
      
      results.set(format, result);
    }
    
    return results;
  }

  private getExtension(format: ExportFormat): string {
    const extensions: Record<ExportFormat, string> = {
      [ExportFormat.JSON]: 'json',
      [ExportFormat.CSV]: 'csv',
      [ExportFormat.EXCEL]: 'xlsx',
      [ExportFormat.PDF]: 'pdf',
      [ExportFormat.PNG]: 'png',
      [ExportFormat.SVG]: 'svg',
      [ExportFormat.HTML]: 'html',
      [ExportFormat.MARKDOWN]: 'md'
    };
    
    return extensions[format] || 'dat';
  }
}