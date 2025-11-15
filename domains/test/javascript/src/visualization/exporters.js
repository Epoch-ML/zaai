// visualization/exporters.js
/**
 * Data export utilities for the visualization module.
 * 
 * This module provides export functionality for various formats
 * including CSV, Excel, JSON, and more.
 */

import fs from 'fs';
import path from 'path';
import { VisualizationError } from '../core/exceptions.js';

/**
 * Base exporter class
 */
export class BaseExporter {
    constructor(format, options = {}) {
        this.format = format;
        this.options = options;
        this.encoding = options.encoding || 'utf-8';
        this.logger = console;
    }

    /**
     * Export data
     * @abstract
     */
    async export(data, outputPath = null) {
        throw new Error('Method export() must be implemented');
    }

    /**
     * Validate data before export
     */
    validate(data) {
        if (!data) {
            throw new VisualizationError('No data provided for export');
        }
        return true;
    }

    /**
     * Write to file
     */
    async writeFile(outputPath, content) {
        await fs.promises.writeFile(outputPath, content, this.encoding);
        this.logger.info(`Exported to ${outputPath}`);
        return outputPath;
    }
}

/**
 * CSV exporter
 */
export class CSVExporter extends BaseExporter {
    constructor(options = {}) {
        super('csv', options);
        this.delimiter = options.delimiter || ',';
        this.quote = options.quote || '"';
        this.includeHeaders = options.includeHeaders ?? true;
        this.lineEnding = options.lineEnding || '\n';
    }

    async export(data, outputPath = null) {
        this.validate(data);
        
        const csv = this.convertToCSV(data);
        
        if (outputPath) {
            return await this.writeFile(outputPath, csv);
        }
        
        return csv;
    }

    convertToCSV(data) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        
        if (data.length === 0) {
            return '';
        }
        
        const headers = Object.keys(data[0]);
        let csv = '';
        
        // Add headers
        if (this.includeHeaders) {
            csv += headers.map(h => this.escapeValue(h)).join(this.delimiter);
            csv += this.lineEnding;
        }
        
        // Add rows
        for (const row of data) {
            const values = headers.map(h => this.escapeValue(row[h]));
            csv += values.join(this.delimiter);
            csv += this.lineEnding;
        }
        
        return csv;
    }

    escapeValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        
        const stringValue = String(value);
        
        // Check if value needs quoting
        if (stringValue.includes(this.delimiter) || 
            stringValue.includes(this.quote) || 
            stringValue.includes('\n') || 
            stringValue.includes('\r')) {
            
            // Escape quotes by doubling them
            const escaped = stringValue.replace(
                new RegExp(this.quote, 'g'), 
                this.quote + this.quote
            );
            
            return this.quote + escaped + this.quote;
        }
        
        return stringValue;
    }
}

/**
 * JSON exporter
 */
export class JSONExporter extends BaseExporter {
    constructor(options = {}) {
        super('json', options);
        this.pretty = options.pretty ?? true;
        this.indent = options.indent || 2;
    }

    async export(data, outputPath = null) {
        this.validate(data);
        
        const json = this.pretty 
            ? JSON.stringify(data, null, this.indent)
            : JSON.stringify(data);
        
        if (outputPath) {
            return await this.writeFile(outputPath, json);
        }
        
        return json;
    }
}

/**
 * Excel exporter (mock implementation)
 */
export class ExcelExporter extends BaseExporter {
    constructor(options = {}) {
        super('xlsx', options);
        this.sheetName = options.sheetName || 'Sheet1';
        this.includeHeaders = options.includeHeaders ?? true;
    }

    async export(data, outputPath = null) {
        this.validate(data);
        
        // In production, would use xlsx or similar library
        const workbook = this.createWorkbook(data);
        
        if (outputPath) {
            // Mock write
            await this.writeFile(outputPath, JSON.stringify(workbook));
            this.logger.info('Excel export would require xlsx library');
        }
        
        return workbook;
    }

    createWorkbook(data) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        
        const headers = data.length > 0 ? Object.keys(data[0]) : [];
        const rows = data.map(item => 
            headers.map(h => item[h])
        );
        
        return {
            sheets: [{
                name: this.sheetName,
                headers: this.includeHeaders ? headers : null,
                data: rows
            }]
        };
    }
}

/**
 * HTML table exporter
 */
export class HTMLExporter extends BaseExporter {
    constructor(options = {}) {
        super('html', options);
        this.tableClass = options.tableClass || 'data-table';
        this.includeStyles = options.includeStyles ?? true;
        this.title = options.title || 'Exported Data';
    }

    async export(data, outputPath = null) {
        this.validate(data);
        
        const html = this.convertToHTML(data);
        
        if (outputPath) {
            return await this.writeFile(outputPath, html);
        }
        
        return html;
    }

    convertToHTML(data) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        
        let html = '<!DOCTYPE html>\n<html>\n<head>\n';
        html += `<title>${this.title}</title>\n`;
        
        if (this.includeStyles) {
            html += this.getStyles();
        }
        
        html += '</head>\n<body>\n';
        html += `<h1>${this.title}</h1>\n`;
        html += this.createTable(data);
        html += '\n</body>\n</html>';
        
        return html;
    }

    createTable(data) {
        if (data.length === 0) {
            return '<p>No data available</p>';
        }
        
        const headers = Object.keys(data[0]);
        let table = `<table class="${this.tableClass}">\n`;
        
        // Headers
        table += '<thead>\n<tr>\n';
        for (const header of headers) {
            table += `<th>${this.escapeHTML(header)}</th>\n`;
        }
        table += '</tr>\n</thead>\n';
        
        // Body
        table += '<tbody>\n';
        for (const row of data) {
            table += '<tr>\n';
            for (const header of headers) {
                const value = row[header];
                table += `<td>${this.escapeHTML(value)}</td>\n`;
            }
            table += '</tr>\n';
        }
        table += '</tbody>\n</table>';
        
        return table;
    }

    escapeHTML(value) {
        if (value === null || value === undefined) {
            return '';
        }
        
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    getStyles() {
        return `
<style>
    body {
        font-family: Arial, sans-serif;
        margin: 20px;
    }
    .${this.tableClass} {
        border-collapse: collapse;
        width: 100%;
        margin-top: 20px;
    }
    .${this.tableClass} th,
    .${this.tableClass} td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
    }
    .${this.tableClass} th {
        background-color: #f2f2f2;
        font-weight: bold;
    }
    .${this.tableClass} tr:nth-child(even) {
        background-color: #f9f9f9;
    }
</style>
`;
    }
}

/**
 * Markdown exporter
 */
export class MarkdownExporter extends BaseExporter {
    constructor(options = {}) {
        super('markdown', options);
        this.title = options.title || '';
        this.tableAlignment = options.tableAlignment || 'left';
    }

    async export(data, outputPath = null) {
        this.validate(data);
        
        const markdown = this.convertToMarkdown(data);
        
        if (outputPath) {
            return await this.writeFile(outputPath, markdown);
        }
        
        return markdown;
    }

    convertToMarkdown(data) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        
        let md = '';
        
        if (this.title) {
            md += `# ${this.title}\n\n`;
        }
        
        if (data.length === 0) {
            md += 'No data available\n';
            return md;
        }
        
        // Create table
        const headers = Object.keys(data[0]);
        
        // Headers
        md += '| ' + headers.join(' | ') + ' |\n';
        
        // Separator
        const separator = this.tableAlignment === 'center' ? ':---:' : '---';
        md += '| ' + headers.map(() => separator).join(' | ') + ' |\n';
        
        // Rows
        for (const row of data) {
            const values = headers.map(h => String(row[h] || ''));
            md += '| ' + values.join(' | ') + ' |\n';
        }
        
        return md;
    }
}

/**
 * Multi-format exporter
 */
export class MultiExporter {
    constructor(formats = ['json', 'csv'], options = {}) {
        this.formats = formats;
        this.options = options;
        this.exporters = {};
        
        // Initialize exporters
        for (const format of formats) {
            this.exporters[format] = this.createExporter(format, options[format] || {});
        }
    }

    createExporter(format, options) {
        switch (format) {
            case 'csv':
                return new CSVExporter(options);
            case 'json':
                return new JSONExporter(options);
            case 'xlsx':
            case 'excel':
                return new ExcelExporter(options);
            case 'html':
                return new HTMLExporter(options);
            case 'markdown':
            case 'md':
                return new MarkdownExporter(options);
            default:
                throw new VisualizationError(`Unsupported export format: ${format}`);
        }
    }

    async export(data, outputDir = null) {
        const results = {};
        
        for (const format of this.formats) {
            const exporter = this.exporters[format];
            
            let outputPath = null;
            if (outputDir) {
                const filename = `export_${Date.now()}.${format}`;
                outputPath = path.join(outputDir, filename);
            }
            
            results[format] = await exporter.export(data, outputPath);
        }
        
        return results;
    }

    async exportToZip(data, zipPath) {
        // In production, would use archiver or similar library
        const results = await this.export(data);
        
        return {
            zipPath,
            formats: this.formats,
            message: 'ZIP export would require archiver library'
        };
    }
}

/**
 * Create exporter based on file extension
 */
export function createExporter(filepath, options = {}) {
    const ext = path.extname(filepath).toLowerCase().slice(1);
    
    switch (ext) {
        case 'csv':
        case 'tsv':
            return new CSVExporter({ 
                ...options, 
                delimiter: ext === 'tsv' ? '\t' : ',' 
            });
        case 'json':
            return new JSONExporter(options);
        case 'xlsx':
        case 'xls':
            return new ExcelExporter(options);
        case 'html':
        case 'htm':
            return new HTMLExporter(options);
        case 'md':
        case 'markdown':
            return new MarkdownExporter(options);
        default:
            throw new VisualizationError(`Cannot determine exporter for extension: ${ext}`);
    }
}