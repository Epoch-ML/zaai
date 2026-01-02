// ingestion/parsers.js
/**
 * Data format parsers for the ingestion module.
 * 
 * This module provides parsers for various data formats including
 * JSON, CSV, XML, and other common formats.
 */

import { Transform } from 'stream';
import { DataIngestionError, SchemaError } from '../core/exceptions.js';
import { DataFormat } from '../core/base.js';

/**
 * Abstract base class for data parsers
 */
export class BaseParser {
    constructor(format, options = {}) {
        this.format = format;
        this.options = options;
        this.logger = console;
    }

    /**
     * Parse data from a stream or string
     * @abstract
     */
    async *parse(input, config = {}) {
        throw new Error('Method parse() must be implemented');
    }

    /**
     * Validate parsed data
     */
    validate(data) {
        return true;
    }

    /**
     * Transform parsed data
     */
    transform(data) {
        return data;
    }
}

/**
 * Parser for JSON format
 */
export class JSONParser extends BaseParser {
    constructor(options = {}) {
        super(DataFormat.JSON, options);
        this.streaming = options.streaming || false;
    }

    async *parse(input, config = {}) {
        try {
            if (typeof input === 'string') {
                // Parse string input
                const data = JSON.parse(input);
                
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (this.validate(item)) {
                            yield this.transform(item);
                        }
                    }
                } else {
                    if (this.validate(data)) {
                        yield this.transform(data);
                    }
                }
            } else if (input && typeof input.pipe === 'function') {
                // Parse stream input
                let buffer = '';
                
                for await (const chunk of input) {
                    buffer += chunk.toString();
                    
                    if (this.streaming) {
                        // Try to parse complete JSON objects from buffer
                        const lines = buffer.split('\n');
                        buffer = lines.pop(); // Keep incomplete line in buffer
                        
                        for (const line of lines) {
                            if (line.trim()) {
                                try {
                                    const data = JSON.parse(line);
                                    if (this.validate(data)) {
                                        yield this.transform(data);
                                    }
                                } catch (e) {
                                    this.logger.warn(`Failed to parse JSON line: ${e.message}`);
                                }
                            }
                        }
                    }
                }
                
                // Parse remaining buffer
                if (buffer.trim()) {
                    const data = JSON.parse(buffer);
                    
                    if (Array.isArray(data)) {
                        for (const item of data) {
                            if (this.validate(item)) {
                                yield this.transform(item);
                            }
                        }
                    } else {
                        if (this.validate(data)) {
                            yield this.transform(data);
                        }
                    }
                }
            }
        } catch (error) {
            throw new DataIngestionError(`JSON parsing failed: ${error.message}`);
        }
    }
}

/**
 * Parser for CSV format
 */
export class CSVParser extends BaseParser {
    constructor(options = {}) {
        super(DataFormat.CSV, options);
        this.delimiter = options.delimiter || ',';
        this.quote = options.quote || '"';
        this.headers = options.headers || null;
        this.skipHeader = options.skipHeader || true;
        this.encoding = options.encoding || 'utf-8';
    }

    async *parse(input, config = {}) {
        const delimiter = config.delimiter || this.delimiter;
        const quote = config.quote || this.quote;
        let headers = this.headers;
        let firstRow = true;
        
        try {
            const lines = await this._getLines(input);
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                const values = this._parseLine(line, delimiter, quote);
                
                if (firstRow && this.skipHeader) {
                    if (!headers) {
                        headers = values;
                    }
                    firstRow = false;
                    continue;
                }
                
                let record;
                if (headers) {
                    record = {};
                    for (let i = 0; i < headers.length; i++) {
                        record[headers[i]] = values[i] || null;
                    }
                } else {
                    record = values;
                }
                
                if (this.validate(record)) {
                    yield this.transform(record);
                }
            }
        } catch (error) {
            throw new DataIngestionError(`CSV parsing failed: ${error.message}`);
        }
    }

    async _getLines(input) {
        const lines = [];
        
        if (typeof input === 'string') {
            return input.split(/\r?\n/);
        } else if (input && typeof input.pipe === 'function') {
            let buffer = '';
            
            for await (const chunk of input) {
                buffer += chunk.toString();
                const parts = buffer.split(/\r?\n/);
                buffer = parts.pop(); // Keep incomplete line in buffer
                lines.push(...parts);
            }
            
            if (buffer) {
                lines.push(buffer);
            }
        }
        
        return lines;
    }

    _parseLine(line, delimiter, quote) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === quote) {
                if (inQuotes && nextChar === quote) {
                    // Escaped quote
                    current += quote;
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current);
        return values;
    }
}

/**
 * Parser for XML format
 */
export class XMLParser extends BaseParser {
    constructor(options = {}) {
        super(DataFormat.XML, options);
        this.rootElement = options.rootElement || null;
        this.recordElement = options.recordElement || 'record';
    }

    async *parse(input, config = {}) {
        try {
            const xml = await this._readInput(input);
            const data = this._parseXML(xml);
            
            if (Array.isArray(data)) {
                for (const item of data) {
                    if (this.validate(item)) {
                        yield this.transform(item);
                    }
                }
            } else {
                if (this.validate(data)) {
                    yield this.transform(data);
                }
            }
        } catch (error) {
            throw new DataIngestionError(`XML parsing failed: ${error.message}`);
        }
    }

    async _readInput(input) {
        if (typeof input === 'string') {
            return input;
        } else if (input && typeof input.pipe === 'function') {
            let buffer = '';
            for await (const chunk of input) {
                buffer += chunk.toString();
            }
            return buffer;
        }
        throw new Error('Invalid input type for XML parser');
    }

    _parseXML(xml) {
        // Simplified XML parsing (in production, use xml2js or similar)
        const records = [];
        const recordPattern = new RegExp(`<${this.recordElement}>(.*?)</${this.recordElement}>`, 'gs');
        const matches = xml.matchAll(recordPattern);
        
        for (const match of matches) {
            const record = {};
            const content = match[1];
            
            // Extract simple tag values
            const tagPattern = /<(\w+)>([^<]*)<\/\1>/g;
            const tagMatches = content.matchAll(tagPattern);
            
            for (const tagMatch of tagMatches) {
                record[tagMatch[1]] = tagMatch[2];
            }
            
            records.push(record);
        }
        
        return records;
    }
}

/**
 * Parser for text/plain format
 */
export class TextParser extends BaseParser {
    constructor(options = {}) {
        super(DataFormat.TEXT, options);
        this.lineByLine = options.lineByLine || true;
        this.encoding = options.encoding || 'utf-8';
    }

    async *parse(input, config = {}) {
        try {
            if (this.lineByLine) {
                const lines = await this._getLines(input);
                
                for (const line of lines) {
                    if (line.trim()) {
                        const record = { text: line };
                        if (this.validate(record)) {
                            yield this.transform(record);
                        }
                    }
                }
            } else {
                const text = await this._readAll(input);
                const record = { text };
                if (this.validate(record)) {
                    yield this.transform(record);
                }
            }
        } catch (error) {
            throw new DataIngestionError(`Text parsing failed: ${error.message}`);
        }
    }

    async _getLines(input) {
        if (typeof input === 'string') {
            return input.split(/\r?\n/);
        } else if (input && typeof input.pipe === 'function') {
            const lines = [];
            let buffer = '';
            
            for await (const chunk of input) {
                buffer += chunk.toString();
                const parts = buffer.split(/\r?\n/);
                buffer = parts.pop();
                lines.push(...parts);
            }
            
            if (buffer) {
                lines.push(buffer);
            }
            
            return lines;
        }
        return [];
    }

    async _readAll(input) {
        if (typeof input === 'string') {
            return input;
        } else if (input && typeof input.pipe === 'function') {
            let buffer = '';
            for await (const chunk of input) {
                buffer += chunk.toString();
            }
            return buffer;
        }
        return '';
    }
}

/**
 * Parser for Parquet format (mock implementation)
 */
export class ParquetParser extends BaseParser {
    constructor(options = {}) {
        super(DataFormat.PARQUET, options);
    }

    async *parse(input, config = {}) {
        // Mock implementation (in production, use parquetjs or similar)
        this.logger.info('Parsing Parquet file (mock implementation)');
        
        // Generate mock data
        for (let i = 0; i < 10; i++) {
            const record = {
                id: i,
                value: `parquet_value_${i}`,
                timestamp: new Date().toISOString()
            };
            
            if (this.validate(record)) {
                yield this.transform(record);
            }
        }
    }
}

/**
 * Parser for Excel format (mock implementation)
 */
export class ExcelParser extends BaseParser {
    constructor(options = {}) {
        super(DataFormat.EXCEL, options);
        this.sheetName = options.sheetName || null;
        this.headerRow = options.headerRow || 0;
    }

    async *parse(input, config = {}) {
        // Mock implementation (in production, use xlsx or similar)
        this.logger.info('Parsing Excel file (mock implementation)');
        
        // Generate mock data
        const headers = ['id', 'name', 'value', 'date'];
        
        for (let i = 0; i < 15; i++) {
            const record = {
                id: i,
                name: `excel_name_${i}`,
                value: i * 100,
                date: new Date().toISOString()
            };
            
            if (this.validate(record)) {
                yield this.transform(record);
            }
        }
    }
}

/**
 * Parser registry and factory
 */
const PARSERS = {
    [DataFormat.JSON]: JSONParser,
    [DataFormat.CSV]: CSVParser,
    [DataFormat.XML]: XMLParser,
    [DataFormat.TEXT]: TextParser,
    [DataFormat.PARQUET]: ParquetParser,
    [DataFormat.EXCEL]: ExcelParser
};

/**
 * Get parser for a specific format
 */
export function getParser(format, options = {}) {
    const ParserClass = PARSERS[format];
    
    if (!ParserClass) {
        throw new DataIngestionError(`No parser available for format: ${format}`);
    }
    
    return new ParserClass(options);
}

/**
 * Detect format from file extension
 */
export function detectFormat(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    const extensionMap = {
        'json': DataFormat.JSON,
        'jsonl': DataFormat.JSON,
        'csv': DataFormat.CSV,
        'tsv': DataFormat.CSV,
        'xml': DataFormat.XML,
        'txt': DataFormat.TEXT,
        'log': DataFormat.TEXT,
        'parquet': DataFormat.PARQUET,
        'xlsx': DataFormat.EXCEL,
        'xls': DataFormat.EXCEL
    };
    
    return extensionMap[ext] || DataFormat.TEXT;
}

/**
 * Create a transform stream for parsing
 */
export function createParseStream(format, options = {}) {
    const parser = getParser(format, options);
    
    return new Transform({
        objectMode: true,
        async transform(chunk, encoding, callback) {
            try {
                for await (const record of parser.parse(chunk)) {
                    this.push(record);
                }
                callback();
            } catch (error) {
                callback(error);
            }
        }
    });
}