// src/ingestion/parsers.ts
/**
 * Data format parsers for the ingestion module.
 */

import { DataIngestionException, SchemaException } from '../core/exceptions.js';
import { DataFormat } from '../core/types.js';
import type {
  IParser,
  ParserOptions,
  DataSchema,
  SchemaField,
  SchemaDataType,
  DataRecord
} from './types.js';
import { Transform, Readable } from 'stream';

/**
 * Abstract base parser
 */
export abstract class BaseParser<T = DataRecord> implements IParser<T> {
  public readonly format: DataFormat;
  protected readonly options: ParserOptions;

  constructor(format: DataFormat, options: ParserOptions = {}) {
    this.format = format;
    this.options = options;
  }

  public abstract async *parse(
    input: string | Buffer | NodeJS.ReadableStream
  ): AsyncGenerator<T, void, unknown>;

  public abstract parseBatch(input: string | Buffer): T[];

  public validate(data: unknown): boolean {
    return true;
  }

  public detectSchema(sample: T[]): DataSchema {
    if (sample.length === 0) {
      throw new SchemaException('Cannot detect schema from empty sample');
    }

    const fields: SchemaField[] = [];
    const firstRecord = sample[0] as any;
    
    for (const [key, value] of Object.entries(firstRecord)) {
      fields.push({
        name: key,
        type: this.detectType(value),
        nullable: this.isNullable(sample, key)
      });
    }

    return {
      name: 'detected',
      fields
    };
  }

  protected detectType(value: unknown): SchemaDataType {
    if (value === null || value === undefined) {
      return SchemaDataType.NULL;
    }
    
    if (typeof value === 'string') {
      if (this.isDate(value)) return SchemaDataType.DATETIME;
      return SchemaDataType.STRING;
    }
    
    if (typeof value === 'number') {
      return Number.isInteger(value) ? SchemaDataType.INTEGER : SchemaDataType.FLOAT;
    }
    
    if (typeof value === 'boolean') {
      return SchemaDataType.BOOLEAN;
    }
    
    if (Array.isArray(value)) {
      return SchemaDataType.ARRAY;
    }
    
    if (typeof value === 'object') {
      return SchemaDataType.OBJECT;
    }
    
    return SchemaDataType.UNKNOWN;
  }

  protected isDate(value: string): boolean {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  protected isNullable(sample: T[], field: string): boolean {
    return sample.some(record => 
      (record as any)[field] === null || 
      (record as any)[field] === undefined
    );
  }

  protected async readInput(input: string | Buffer | NodeJS.ReadableStream): Promise<string> {
    if (typeof input === 'string') {
      return input;
    }
    
    if (Buffer.isBuffer(input)) {
      return input.toString(this.options.encoding || 'utf8');
    }
    
    // Read from stream
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString(this.options.encoding || 'utf8');
  }
}

/**
 * JSON Parser
 */
export class JSONParser extends BaseParser<DataRecord> {
  private readonly streaming: boolean;

  constructor(options: ParserOptions = {}) {
    super(DataFormat.JSON, options);
    this.streaming = options.maxRows !== undefined;
  }

  public async *parse(
    input: string | Buffer | NodeJS.ReadableStream
  ): AsyncGenerator<DataRecord, void, unknown> {
    const content = await this.readInput(input);
    
    if (this.streaming) {
      // Parse JSON lines format
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (this.validate(data)) {
              yield data;
            }
          } catch (error) {
            if (this.options.strictMode) {
              throw new DataIngestionException(`Invalid JSON: ${error}`);
            }
          }
        }
      }
    } else {
      // Parse complete JSON
      try {
        const data = JSON.parse(content);
        
        if (Array.isArray(data)) {
          for (const item of data) {
            if (this.validate(item)) {
              yield item;
            }
          }
        } else {
          if (this.validate(data)) {
            yield data;
          }
        }
      } catch (error) {
        throw new DataIngestionException(`JSON parsing failed: ${error}`);
      }
    }
  }

  public parseBatch(input: string | Buffer): DataRecord[] {
    const content = typeof input === 'string' ? input : input.toString();
    
    try {
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      throw new DataIngestionException(`JSON parsing failed: ${error}`);
    }
  }

  public validate(data: unknown): boolean {
    return typeof data === 'object' && data !== null;
  }
}

/**
 * CSV Parser
 */
export class CSVParser extends BaseParser<DataRecord> {
  private readonly delimiter: string;
  private readonly quote: string;
  private readonly escape: string;
  private headers: string[] | null = null;

  constructor(options: ParserOptions = {}) {
    super(DataFormat.CSV, options);
    this.delimiter = options.delimiter || ',';
    this.quote = options.quote || '"';
    this.escape = options.escape || '"';
  }

  public async *parse(
    input: string | Buffer | NodeJS.ReadableStream
  ): AsyncGenerator<DataRecord, void, unknown> {
    const content = await this.readInput(input);
    const lines = content.split(/\r?\n/);
    
    let lineNumber = 0;
    
    // Skip rows if specified
    if (this.options.skipRows) {
      lineNumber = this.options.skipRows;
    }
    
    // Process headers
    if (this.options.headers === true && lineNumber < lines.length) {
      this.headers = this.parseLine(lines[lineNumber]!);
      lineNumber++;
    } else if (Array.isArray(this.options.headers)) {
      this.headers = this.options.headers;
    }
    
    // Parse data rows
    while (lineNumber < lines.length) {
      if (this.options.maxRows && lineNumber >= this.options.maxRows) {
        break;
      }
      
      const line = lines[lineNumber]!;
      if (line.trim()) {
        const values = this.parseLine(line);
        const record = this.createRecord(values);
        
        if (this.validate(record)) {
          yield record;
        }
      }
      
      lineNumber++;
    }
  }

  public parseBatch(input: string | Buffer): DataRecord[] {
    const content = typeof input === 'string' ? input : input.toString();
    const lines = content.split(/\r?\n/);
    const records: DataRecord[] = [];
    
    let lineNumber = 0;
    
    if (this.options.headers === true && lineNumber < lines.length) {
      this.headers = this.parseLine(lines[lineNumber]!);
      lineNumber++;
    }
    
    while (lineNumber < lines.length) {
      const line = lines[lineNumber]!;
      if (line.trim()) {
        const values = this.parseLine(line);
        records.push(this.createRecord(values));
      }
      lineNumber++;
    }
    
    return records;
  }

  private parseLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === this.quote) {
        if (inQuotes && nextChar === this.quote) {
          current += this.quote;
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === this.delimiter && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }

  private createRecord(values: string[]): DataRecord {
    if (this.headers) {
      const record: DataRecord = {};
      for (let i = 0; i < this.headers.length; i++) {
        record[this.headers[i]!] = this.parseValue(values[i] || '');
      }
      return record;
    } else {
      return values.reduce((acc, val, idx) => {
        acc[`field_${idx}`] = this.parseValue(val);
        return acc;
      }, {} as DataRecord);
    }
  }

  private parseValue(value: string): unknown {
    // Try to parse as number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    
    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Check for null values
    if (this.options.nullValues?.includes(value)) {
      return null;
    }
    
    return value;
  }
}

/**
 * XML Parser
 */
export class XMLParser extends BaseParser<DataRecord> {
  private readonly recordTag: string;

  constructor(options: ParserOptions & { recordTag?: string } = {}) {
    super(DataFormat.XML, options);
    this.recordTag = options.recordTag || 'record';
  }

  public async *parse(
    input: string | Buffer | NodeJS.ReadableStream
  ): AsyncGenerator<DataRecord, void, unknown> {
    const content = await this.readInput(input);
    
    // Simple XML parsing (production would use proper XML parser)
    const recordPattern = new RegExp(`<${this.recordTag}>(.*?)</${this.recordTag}>`, 'gs');
    const matches = content.matchAll(recordPattern);
    
    for (const match of matches) {
      const record = this.parseXMLRecord(match[1]!);
      if (this.validate(record)) {
        yield record;
      }
    }
  }

  public parseBatch(input: string | Buffer): DataRecord[] {
    const content = typeof input === 'string' ? input : input.toString();
    const records: DataRecord[] = [];
    
    const recordPattern = new RegExp(`<${this.recordTag}>(.*?)</${this.recordTag}>`, 'gs');
    const matches = content.matchAll(recordPattern);
    
    for (const match of matches) {
      records.push(this.parseXMLRecord(match[1]!));
    }
    
    return records;
  }

  private parseXMLRecord(content: string): DataRecord {
    const record: DataRecord = {};
    
    // Extract simple tag values
    const tagPattern = /<(\w+)>([^<]*)<\/\1>/g;
    const tagMatches = content.matchAll(tagPattern);
    
    for (const match of tagMatches) {
      record[match[1]!] = match[2]!;
    }
    
    return record;
  }
}

/**
 * Parquet Parser (mock implementation)
 */
export class ParquetParser extends BaseParser<DataRecord> {
  constructor(options: ParserOptions = {}) {
    super(DataFormat.PARQUET, options);
  }

  public async *parse(
    input: string | Buffer | NodeJS.ReadableStream
  ): AsyncGenerator<DataRecord, void, unknown> {
    // Mock implementation (production would use parquet library)
    for (let i = 0; i < 10; i++) {
      yield {
        id: i,
        value: `parquet_value_${i}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  public parseBatch(input: string | Buffer): DataRecord[] {
    // Mock implementation
    return Array.from({ length: 5 }, (_, i) => ({
      id: i,
      value: `parquet_value_${i}`
    }));
  }
}

/**
 * Parser factory
 */
export class ParserFactory {
  private static parsers: Map<DataFormat, typeof BaseParser> = new Map([
    [DataFormat.JSON, JSONParser],
    [DataFormat.CSV, CSVParser],
    [DataFormat.XML, XMLParser],
    [DataFormat.PARQUET, ParquetParser]
  ]);

  public static create<T = DataRecord>(
    format: DataFormat,
    options?: ParserOptions
  ): IParser<T> {
    const ParserClass = this.parsers.get(format);
    
    if (!ParserClass) {
      throw new DataIngestionException(`No parser available for format: ${format}`);
    }
    
    return new ParserClass(options) as IParser<T>;
  }

  public static register(format: DataFormat, parserClass: typeof BaseParser): void {
    this.parsers.set(format, parserClass);
  }

  public static detectFormat(filename: string): DataFormat {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    const formatMap: Record<string, DataFormat> = {
      'json': DataFormat.JSON,
      'jsonl': DataFormat.JSON,
      'csv': DataFormat.CSV,
      'tsv': DataFormat.CSV,
      'xml': DataFormat.XML,
      'parquet': DataFormat.PARQUET,
      'xlsx': DataFormat.EXCEL,
      'xls': DataFormat.EXCEL,
      'txt': DataFormat.TEXT
    };
    
    return formatMap[ext || ''] || DataFormat.TEXT;
  }
}

/**
 * Create a transform stream for parsing
 */
export function createParseStream<T = DataRecord>(
  format: DataFormat,
  options?: ParserOptions
): Transform {
  const parser = ParserFactory.create<T>(format, options);
  
  return new Transform({
    objectMode: true,
    async transform(chunk: any, encoding: string, callback: Function) {
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