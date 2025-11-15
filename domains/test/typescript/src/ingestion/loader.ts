// src/ingestion/loader.ts
/**
 * Data loader orchestration for the ingestion module.
 */

import { EventEmitter } from 'events';
import { BaseComponent, generateUUID, getTimestamp } from '../core/base.js';
import { ComponentType, Status } from '../core/types.js';
import { DataIngestionException, ValidationException } from '../core/exceptions.js';
import { FileSource, DatabaseSource, APISource, MemorySource } from './sources.js';
import { ParserFactory } from './parsers.js';
import { SchemaDetector, DataSchemaImpl } from './schema.js';
import type {
  ILoader,
  IDataSource,
  ITransformer,
  LoadOptions,
  LoadResult,
  LoadProgress,
  LoadError,
  DataSchema,
  DataRecord,
  SourceType
} from './types.js';
import type { UUID, Timestamp, AsyncResult, FilePath, URL } from '../types.js';

/**
 * Load result implementation
 */
export class LoadResultImpl<T = DataRecord> implements LoadResult<T> {
  public status: Status = Status.PENDING;
  public data: T[] = [];
  public recordsLoaded = 0;
  public recordsFailed = 0;
  public errors: LoadError[] = [];
  public warnings: string[] = [];
  public schema?: DataSchema;
  public startTime: Timestamp;
  public endTime?: Timestamp;
  public elapsedTime?: number;

  constructor() {
    this.startTime = getTimestamp();
  }

  public start(): void {
    this.status = Status.RUNNING;
    this.startTime = getTimestamp();
  }

  public complete(): void {
    this.status = Status.COMPLETED;
    this.endTime = getTimestamp();
    this.elapsedTime = Number(this.endTime) - Number(this.startTime);
  }

  public fail(error: string | Error): void {
    this.status = Status.FAILED;
    this.endTime = getTimestamp();
    this.elapsedTime = this.endTime ? Number(this.endTime) - Number(this.startTime) : 0;
    this.addError(error);
  }

  public addRecord(record: T, success = true): void {
    if (success) {
      this.data.push(record);
      this.recordsLoaded++;
    } else {
      this.recordsFailed++;
    }
  }

  public addError(error: string | Error, recordIndex?: number, field?: string): void {
    this.errors.push({
      error: typeof error === 'string' ? error : error.message,
      recordIndex,
      field,
      timestamp: getTimestamp()
    });
  }

  public addWarning(warning: string): void {
    this.warnings.push(warning);
  }

  public get successRate(): number {
    const total = this.recordsLoaded + this.recordsFailed;
    return total > 0 ? (this.recordsLoaded / total) * 100 : 0;
  }

  public toJSON(): Record<string, unknown> {
    return {
      status: this.status,
      recordsLoaded: this.recordsLoaded,
      recordsFailed: this.recordsFailed,
      successRate: this.successRate.toFixed(2) + '%',
      errors: this.errors.slice(0, 10),
      warnings: this.warnings.slice(0, 10),
      elapsedTime: this.elapsedTime,
      startTime: this.startTime,
      endTime: this.endTime,
      schema: this.schema
    };
  }
}

/**
 * Data loader implementation
 */
export class DataLoader extends BaseComponent implements ILoader {
  private readonly options: LoadOptions;
  private readonly schemaDetector: SchemaDetector;
  private sources: Map<string, IDataSource> = new Map();
  private transformers: ITransformer[] = [];

  constructor(options: LoadOptions = {}) {
    super('DataLoader', ComponentType.INGESTER);
    this.options = {
      batchSize: 1000,
      parallel: false,
      maxWorkers: 4,
      validateSchema: true,
      detectSchema: true,
      ...options
    };
    this.schemaDetector = new SchemaDetector();
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing data loader');
  }

  public async cleanup(): Promise<void> {
    for (const source of this.sources.values()) {
      await source.disconnect();
    }
    this.sources.clear();
  }

  /**
   * Load data from a source
   */
  public async load<T = DataRecord>(
    source: IDataSource,
    options?: LoadOptions
  ): AsyncResult<LoadResult<T>> {
    const result = new LoadResultImpl<T>();
    const loadOptions = { ...this.options, ...options };
    
    try {
      result.start();
      this.setStatus(Status.RUNNING);

      // Connect to source
      await source.connect();

      // Detect schema if enabled
      if (loadOptions.detectSchema) {
        result.schema = await this.schemaDetector.detectFromSource(source);
        this.logger.info(`Detected schema with ${result.schema.fields.length} fields`);
      }

      // Load data
      await this.loadFromSource(source, result, loadOptions);

      // Disconnect from source
      await source.disconnect();

      result.complete();
      this.setStatus(Status.COMPLETED);

      return { success: true, value: result };

    } catch (error: any) {
      result.fail(error);
      this.setStatus(Status.FAILED);
      return { success: false, error };
    }
  }

  /**
   * Load data from multiple sources
   */
  public async loadBatch<T = DataRecord>(
    sources: IDataSource[],
    options?: LoadOptions
  ): AsyncResult<LoadResult<T>[]> {
    const loadOptions = { ...this.options, ...options };
    
    if (loadOptions.parallel) {
      return this.loadParallel(sources, loadOptions);
    } else {
      return this.loadSequential(sources, loadOptions);
    }
  }

  /**
   * Transform data
   */
  public async transform<T, R>(
    data: T,
    transformers: ITransformer<T, R>[]
  ): Promise<R> {
    let result = data as any;
    
    for (const transformer of transformers) {
      result = await transformer.transform(result);
    }
    
    return result as R;
  }

  /**
   * Validate data against schema
   */
  public validate<T>(data: T, schema: DataSchema): boolean {
    if (!(schema instanceof DataSchemaImpl)) {
      schema = DataSchemaImpl.fromJSON(schema);
    }
    
    return schema.validate(data as any);
  }

  /**
   * Load data from a file
   */
  public async loadFile<T = DataRecord>(
    filePath: FilePath,
    format?: any,
    options?: LoadOptions
  ): AsyncResult<LoadResult<T>> {
    const source = new FileSource(filePath, format);
    return this.load<T>(source, options);
  }

  /**
   * Load data from a database
   */
  public async loadDatabase<T = DataRecord>(
    connectionString: string,
    query?: string,
    options?: LoadOptions
  ): AsyncResult<LoadResult<T>> {
    const source = new DatabaseSource(connectionString, query);
    return this.load<T>(source, options);
  }

  /**
   * Load data from an API
   */
  public async loadAPI<T = DataRecord>(
    endpoint: URL,
    method?: string,
    options?: LoadOptions
  ): AsyncResult<LoadResult<T>> {
    const source = new APISource(endpoint, method);
    return this.load<T>(source, options);
  }

  /**
   * Load data from memory
   */
  public async loadMemory<T = DataRecord>(
    data: DataRecord[],
    options?: LoadOptions
  ): AsyncResult<LoadResult<T>> {
    const source = new MemorySource(data);
    return this.load<T>(source, options);
  }

  /**
   * Internal method to load from source
   */
  private async loadFromSource<T>(
    source: IDataSource,
    result: LoadResultImpl<T>,
    options: LoadOptions
  ): Promise<void> {
    const batch: T[] = [];
    let recordIndex = 0;

    try {
      for await (const record of source.read<T>({})) {
        try {
          // Apply transformers
          let transformedRecord = record;
          if (options.transformers) {
            for (const transformer of options.transformers) {
              transformedRecord = await transformer.transform(transformedRecord);
            }
          }

          // Validate schema
          if (options.validateSchema && result.schema) {
            if (!this.validate(transformedRecord, result.schema)) {
              result.addError('Schema validation failed', recordIndex);
              result.recordsFailed++;
              continue;
            }
          }

          batch.push(transformedRecord);

          // Process batch
          if (batch.length >= (options.batchSize || 1000)) {
            await this.processBatch(batch, result);
            batch.length = 0;
          }

          // Update progress
          if (options.progressCallback) {
            const progress: LoadProgress = {
              current: recordIndex + 1,
              total: 0, // Unknown for streaming
              percentage: 0,
              recordsLoaded: result.recordsLoaded,
              recordsFailed: result.recordsFailed
            };
            options.progressCallback(progress);
          }

          recordIndex++;

        } catch (error: any) {
          result.addError(error, recordIndex);
          result.recordsFailed++;
          
          if (options.errorHandler) {
            options.errorHandler(error);
          }
        }
      }

      // Process remaining batch
      if (batch.length > 0) {
        await this.processBatch(batch, result);
      }

    } catch (error: any) {
      throw new DataIngestionException(
        `Error loading from source: ${error.message}`,
        source.name,
        undefined,
        recordIndex
      );
    }
  }

  /**
   * Process a batch of records
   */
  private async processBatch<T>(batch: T[], result: LoadResultImpl<T>): Promise<void> {
    for (const record of batch) {
      result.addRecord(record);
    }
    
    this.emitEvent('batchProcessed', { 
      size: batch.length,
      total: result.recordsLoaded
    });
    
    this.logger.debug(`Processed batch of ${batch.length} records`);
  }

  /**
   * Load sources in parallel
   */
  private async loadParallel<T>(
    sources: IDataSource[],
    options: LoadOptions
  ): AsyncResult<LoadResult<T>[]> {
    try {
      const promises = sources.map(source => this.load<T>(source, options));
      const results = await Promise.all(promises);
      
      const values: LoadResult<T>[] = [];
      for (const result of results) {
        if (result.success) {
          values.push(result.value);
        } else {
          throw result.error;
        }
      }
      
      return { success: true, value: values };
    } catch (error: any) {
      return { success: false, error };
    }
  }

  /**
   * Load sources sequentially
   */
  private async loadSequential<T>(
    sources: IDataSource[],
    options: LoadOptions
  ): AsyncResult<LoadResult<T>[]> {
    const results: LoadResult<T>[] = [];
    
    try {
      for (const source of sources) {
        const result = await this.load<T>(source, options);
        if (result.success) {
          results.push(result.value);
        } else {
          throw result.error;
        }
      }
      
      return { success: true, value: results };
    } catch (error: any) {
      return { success: false, error };
    }
  }
}

/**
 * Batch loader for large datasets
 */
export class BatchLoader extends DataLoader {
  private readonly parallelBatches: number;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;

  constructor(options: LoadOptions & {
    parallelBatches?: number;
    retryAttempts?: number;
    retryDelay?: number;
  } = {}) {
    super(options);
    this.parallelBatches = options.parallelBatches || 1;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  protected async processBatch<T>(batch: T[], result: LoadResultImpl<T>): Promise<void> {
    const chunks = this.splitIntoChunks(batch, this.parallelBatches);
    const promises = chunks.map(chunk => this.processChunkWithRetry(chunk, result));
    await Promise.all(promises);
  }

  private async processChunkWithRetry<T>(
    chunk: T[],
    result: LoadResultImpl<T>
  ): Promise<void> {
    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      try {
        await super.processBatch(chunk, result);
        return;
      } catch (error: any) {
        attempts++;
        
        if (attempts >= this.retryAttempts) {
          result.addError(`Failed after ${attempts} attempts: ${error.message}`);
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        this.logger.warn(`Retrying chunk processing, attempt ${attempts + 1}`);
      }
    }
  }

  private splitIntoChunks<T>(batch: T[], numChunks: number): T[][] {
    const chunks: T[][] = [];
    const chunkSize = Math.ceil(batch.length / numChunks);
    
    for (let i = 0; i < batch.length; i += chunkSize) {
      chunks.push(batch.slice(i, i + chunkSize));
    }
    
    return chunks;
  }
}

/**
 * Stream loader for continuous data ingestion
 */
export class StreamLoader extends DataLoader {
  private readonly windowSize: number;
  private readonly windowDuration: number;
  private windows: Map<number, DataRecord[]> = new Map();

  constructor(options: LoadOptions & {
    windowSize?: number;
    windowDuration?: number;
  } = {}) {
    super(options);
    this.windowSize = options.windowSize || 1000;
    this.windowDuration = options.windowDuration || 60000; // 1 minute
  }

  protected async processBatch<T>(batch: T[], result: LoadResultImpl<T>): Promise<void> {
    const now = Date.now();
    const windowKey = Math.floor(now / this.windowDuration);
    
    if (!this.windows.has(windowKey)) {
      this.windows.set(windowKey, []);
    }
    
    const window = this.windows.get(windowKey)!;
    window.push(...(batch as any[]));
    
    if (window.length >= this.windowSize) {
      await this.processWindow(windowKey, window as T[], result);
      this.windows.delete(windowKey);
    }
    
    this.cleanupWindows(now);
  }

  private async processWindow<T>(
    windowKey: number,
    window: T[],
    result: LoadResultImpl<T>
  ): Promise<void> {
    this.emitEvent('windowReady', { key: windowKey, size: window.length });
    await super.processBatch(window, result);
  }

  private cleanupWindows(currentTime: number): void {
    const expiredKey = Math.floor((currentTime - this.windowDuration * 2) / this.windowDuration);
    
    for (const [key, window] of this.windows) {
      if (key < expiredKey) {
        this.logger.warn(`Cleaning up expired window ${key} with ${window.length} records`);
        this.windows.delete(key);
      }
    }
  }
}