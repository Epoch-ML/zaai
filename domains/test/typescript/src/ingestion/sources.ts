// src/ingestion/sources.ts
/**
 * Data source implementations for the ingestion module.
 */

import { BaseComponent, generateUUID, getTimestamp } from '../core/base.js';
import { DataIngestionException, ConnectionException } from '../core/exceptions.js';
import { ComponentType, Status, DataFormat } from '../core/types.js';
import type {
  IDataSource,
  SourceType,
  SourceConfig,
  ConnectionState,
  ReadOptions,
  SourceMetadata,
  DataRecord
} from './types.js';
import type { UUID, Nullable, FilePath, URL } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

/**
 * Abstract base data source
 */
export abstract class BaseDataSource extends BaseComponent implements IDataSource {
  public readonly type: SourceType;
  protected _connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  protected config: SourceConfig;

  constructor(name: string, type: SourceType, config: SourceConfig) {
    super(name, ComponentType.INGESTER);
    this.type = type;
    this.config = config;
  }

  public get connectionState(): ConnectionState {
    return this._connectionState;
  }

  protected setConnectionState(state: ConnectionState): void {
    this._connectionState = state;
    this.emitEvent('connection:state', { state });
  }

  public abstract connect(): Promise<void>;
  public abstract disconnect(): Promise<void>;
  public abstract async *read<T = DataRecord>(options?: ReadOptions): AsyncGenerator<T, void, unknown>;
  public abstract getMetadata(): Promise<SourceMetadata>;

  public async readBatch<T = DataRecord>(size: number, options?: ReadOptions): Promise<T[]> {
    const batch: T[] = [];
    let count = 0;

    for await (const item of this.read<T>(options)) {
      batch.push(item);
      count++;
      if (count >= size) break;
    }

    return batch;
  }

  public async validate(): Promise<boolean> {
    try {
      await this.connect();
      await this.disconnect();
      return true;
    } catch {
      return false;
    }
  }

  public async initialize(): Promise<void> {
    this.logger.debug(`Initializing ${this.type} source: ${this.name}`);
  }

  public async cleanup(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED) {
      await this.disconnect();
    }
  }
}

/**
 * File data source
 */
export class FileSource extends BaseDataSource {
  private readonly filePath: FilePath;
  private readonly format: DataFormat;
  private fileHandle: fs.promises.FileHandle | null = null;
  private stream: fs.ReadStream | null = null;

  constructor(filePath: FilePath, format?: DataFormat, config?: Partial<SourceConfig>) {
    super(
      `file:${path.basename(filePath as string)}`,
      SourceType.FILE,
      {
        type: SourceType.FILE,
        name: path.basename(filePath as string),
        format: format || FileSource.detectFormat(filePath),
        ...config
      }
    );
    this.filePath = filePath;
    this.format = this.config.format!;
  }

  public async connect(): Promise<void> {
    try {
      this.setConnectionState(ConnectionState.CONNECTING);
      
      // Check if file exists
      await fs.promises.access(this.filePath as string, fs.constants.R_OK);
      
      // Open file handle
      this.fileHandle = await fs.promises.open(this.filePath as string, 'r');
      
      this.setConnectionState(ConnectionState.CONNECTED);
      this.logger.info(`Connected to file: ${this.filePath}`);
    } catch (error) {
      this.setConnectionState(ConnectionState.ERROR);
      throw new ConnectionException(
        `Failed to connect to file: ${this.filePath}`,
        this.filePath as string
      );
    }
  }

  public async disconnect(): Promise<void> {
    try {
      this.setConnectionState(ConnectionState.DISCONNECTING);
      
      if (this.stream) {
        this.stream.destroy();
        this.stream = null;
      }
      
      if (this.fileHandle) {
        await this.fileHandle.close();
        this.fileHandle = null;
      }
      
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.logger.info(`Disconnected from file: ${this.filePath}`);
    } catch (error) {
      this.setConnectionState(ConnectionState.ERROR);
      throw new ConnectionException(`Failed to disconnect from file: ${error}`);
    }
  }

  public async *read<T = DataRecord>(options?: ReadOptions): AsyncGenerator<T, void, unknown> {
    if (this.connectionState !== ConnectionState.CONNECTED) {
      await this.connect();
    }

    // Create read stream
    this.stream = fs.createReadStream(this.filePath as string, {
      encoding: 'utf8',
      highWaterMark: 64 * 1024 // 64KB chunks
    });

    // Read file line by line for text formats
    if (this.format === DataFormat.CSV || this.format === DataFormat.TEXT) {
      let buffer = '';
      
      for await (const chunk of this.stream) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            // Parse based on format
            const record = this.parseLine(line);
            if (options?.filter && !this.matchesFilter(record, options.filter)) {
              continue;
            }
            yield record as T;
          }
        }
      }
      
      // Process remaining buffer
      if (buffer.trim()) {
        yield this.parseLine(buffer) as T;
      }
    } else {
      // For other formats, read entire file
      const content = await fs.promises.readFile(this.filePath as string, 'utf8');
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        for (const item of data) {
          yield item as T;
        }
      } else {
        yield data as T;
      }
    }
  }

  public async getMetadata(): Promise<SourceMetadata> {
    const stats = await fs.promises.stat(this.filePath as string);
    
    return {
      id: generateUUID(),
      name: this.name,
      sourceType: this.type,
      format: this.format,
      size: stats.size,
      lastModified: stats.mtimeMs as any,
      createdAt: stats.birthtimeMs as any,
      updatedAt: stats.mtimeMs as any,
      version: '1.0.0',
      encoding: 'utf8'
    };
  }

  private parseLine(line: string): DataRecord {
    if (this.format === DataFormat.CSV) {
      // Simple CSV parsing (production would use proper parser)
      const values = line.split(',').map(v => v.trim());
      return values.reduce((acc, val, idx) => {
        acc[`field_${idx}`] = val;
        return acc;
      }, {} as DataRecord);
    }
    
    return { line };
  }

  private matchesFilter(record: DataRecord, filter: any): boolean {
    // Simple filter implementation
    return true;
  }

  private static detectFormat(filePath: FilePath): DataFormat {
    const ext = path.extname(filePath as string).toLowerCase();
    const formatMap: Record<string, DataFormat> = {
      '.json': DataFormat.JSON,
      '.csv': DataFormat.CSV,
      '.xml': DataFormat.XML,
      '.txt': DataFormat.TEXT,
      '.parquet': DataFormat.PARQUET,
      '.xlsx': DataFormat.EXCEL,
      '.xls': DataFormat.EXCEL
    };
    
    return formatMap[ext] || DataFormat.TEXT;
  }
}

/**
 * Database data source
 */
export class DatabaseSource extends BaseDataSource {
  private connection: any = null;
  private readonly connectionString: string;
  private readonly query?: string;
  private readonly table?: string;

  constructor(
    connectionString: string,
    query?: string,
    table?: string,
    config?: Partial<SourceConfig>
  ) {
    super(
      `db:${table || 'query'}`,
      SourceType.DATABASE,
      {
        type: SourceType.DATABASE,
        name: table || 'query',
        ...config
      }
    );
    this.connectionString = connectionString;
    this.query = query;
    this.table = table;
  }

  public async connect(): Promise<void> {
    try {
      this.setConnectionState(ConnectionState.CONNECTING);
      
      // Mock database connection
      this.connection = {
        connected: true,
        connectionString: this.connectionString
      };
      
      this.setConnectionState(ConnectionState.CONNECTED);
      this.logger.info('Connected to database');
    } catch (error) {
      this.setConnectionState(ConnectionState.ERROR);
      throw new ConnectionException('Failed to connect to database');
    }
  }

  public async disconnect(): Promise<void> {
    try {
      this.setConnectionState(ConnectionState.DISCONNECTING);
      
      if (this.connection) {
        this.connection.connected = false;
        this.connection = null;
      }
      
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.logger.info('Disconnected from database');
    } catch (error) {
      this.setConnectionState(ConnectionState.ERROR);
      throw new ConnectionException('Failed to disconnect from database');
    }
  }

  public async *read<T = DataRecord>(options?: ReadOptions): AsyncGenerator<T, void, unknown> {
    if (this.connectionState !== ConnectionState.CONNECTED) {
      await this.connect();
    }

    // Mock database query
    const mockData = [
      { id: 1, name: 'Record 1', value: 100 },
      { id: 2, name: 'Record 2', value: 200 },
      { id: 3, name: 'Record 3', value: 300 }
    ];

    for (const record of mockData) {
      yield record as T;
    }
  }

  public async getMetadata(): Promise<SourceMetadata> {
    return {
      id: generateUUID(),
      name: this.name,
      sourceType: this.type,
      recordCount: 3,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
      version: '1.0.0'
    };
  }
}

/**
 * API data source
 */
export class APISource extends BaseDataSource {
  private readonly endpoint: URL;
  private readonly method: string;
  private readonly headers: Record<string, string>;
  private session: any = null;

  constructor(
    endpoint: URL,
    method = 'GET',
    headers?: Record<string, string>,
    config?: Partial<SourceConfig>
  ) {
    super(
      `api:${endpoint}`,
      SourceType.API,
      {
        type: SourceType.API,
        name: endpoint as string,
        ...config
      }
    );
    this.endpoint = endpoint;
    this.method = method;
    this.headers = headers || {};
  }

  public async connect(): Promise<void> {
    try {
      this.setConnectionState(ConnectionState.CONNECTING);
      
      // Add authentication headers
      if (this.config.credentials) {
        if (this.config.credentials.apiKey) {
          this.headers['X-API-Key'] = this.config.credentials.apiKey;
        } else if (this.config.credentials.token) {
          this.headers['Authorization'] = `Bearer ${this.config.credentials.token}`;
        }
      }
      
      this.session = { headers: this.headers };
      this.setConnectionState(ConnectionState.CONNECTED);
      this.logger.info(`Connected to API: ${this.endpoint}`);
    } catch (error) {
      this.setConnectionState(ConnectionState.ERROR);
      throw new ConnectionException(`Failed to connect to API: ${this.endpoint}`);
    }
  }

  public async disconnect(): Promise<void> {
    this.setConnectionState(ConnectionState.DISCONNECTING);
    this.session = null;
    this.setConnectionState(ConnectionState.DISCONNECTED);
    this.logger.info(`Disconnected from API: ${this.endpoint}`);
  }

  public async *read<T = DataRecord>(options?: ReadOptions): AsyncGenerator<T, void, unknown> {
    if (this.connectionState !== ConnectionState.CONNECTED) {
      await this.connect();
    }

    // Mock API response
    const mockResponse = {
      data: [
        { id: 1, status: 'active', created: '2024-01-01' },
        { id: 2, status: 'pending', created: '2024-01-02' },
        { id: 3, status: 'active', created: '2024-01-03' }
      ]
    };

    for (const item of mockResponse.data) {
      yield item as T;
    }
  }

  public async getMetadata(): Promise<SourceMetadata> {
    return {
      id: generateUUID(),
      name: this.name,
      sourceType: this.type,
      format: DataFormat.JSON,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
      version: '1.0.0'
    };
  }
}

/**
 * Memory data source
 */
export class MemorySource extends BaseDataSource {
  private data: DataRecord[];

  constructor(data: DataRecord[], name = 'memory', config?: Partial<SourceConfig>) {
    super(
      name,
      SourceType.MEMORY,
      {
        type: SourceType.MEMORY,
        name,
        ...config
      }
    );
    this.data = data;
  }

  public async connect(): Promise<void> {
    this.setConnectionState(ConnectionState.CONNECTED);
    this.logger.info('Connected to memory source');
  }

  public async disconnect(): Promise<void> {
    this.setConnectionState(ConnectionState.DISCONNECTED);
    this.logger.info('Disconnected from memory source');
  }

  public async *read<T = DataRecord>(options?: ReadOptions): AsyncGenerator<T, void, unknown> {
    let items = [...this.data];
    
    // Apply offset
    if (options?.offset) {
      items = items.slice(options.offset);
    }
    
    // Apply limit
    if (options?.limit) {
      items = items.slice(0, options.limit);
    }
    
    for (const item of items) {
      yield item as T;
    }
  }

  public async getMetadata(): Promise<SourceMetadata> {
    return {
      id: generateUUID(),
      name: this.name,
      sourceType: this.type,
      recordCount: this.data.length,
      size: JSON.stringify(this.data).length,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
      version: '1.0.0'
    };
  }
}