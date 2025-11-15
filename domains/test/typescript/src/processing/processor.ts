// src/processing/processor.ts
/**
 * Main data processor implementation for the processing module.
 */

import { BaseComponent, generateUUID, getTimestamp } from '../core/base.js';
import { ComponentType, Status } from '../core/types.js';
import { ProcessingException, ResourceException, TimeoutException } from '../core/exceptions.js';
import { Processor } from '../core/registry.js';
import type {
  IProcessor,
  ProcessorType,
  ProcessingConfig,
  ProcessingResult,
  ProcessingError,
  ProcessingMetrics,
  WorkerTask,
  WorkerResult,
  WorkerPool,
  StreamConfig,
  BatchConfig,
  ProcessorState,
  StateCheckpoint
} from './types.js';
import type { UUID, Timestamp, AsyncResult, Nullable } from '../types.js';
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { Transform } from 'stream';

/**
 * Processing result implementation
 */
export class ProcessingResultImpl<T = unknown> implements ProcessingResult<T> {
  public status: Status = Status.PENDING;
  public data: T[] = [];
  public inputCount = 0;
  public outputCount = 0;
  public errorCount = 0;
  public skippedCount = 0;
  public startTime: Timestamp;
  public endTime?: Timestamp;
  public elapsedTime?: number;
  public errors: ProcessingError[] = [];
  public metrics?: ProcessingMetrics;

  private initialMemory: number = 0;

  constructor() {
    this.startTime = getTimestamp();
  }

  public start(): void {
    this.status = Status.RUNNING;
    this.startTime = getTimestamp();
    this.initialMemory = process.memoryUsage().heapUsed;
  }

  public complete(): void {
    this.status = Status.COMPLETED;
    this.endTime = getTimestamp();
    this.elapsedTime = Number(this.endTime) - Number(this.startTime);
    
    const finalMemory = process.memoryUsage().heapUsed;
    this.metrics = {
      throughput: this.outputCount / (this.elapsedTime / 1000),
      latency: this.elapsedTime / this.outputCount,
      cpuUsage: process.cpuUsage().user / 1000000,
      memoryUsage: (finalMemory - this.initialMemory) / 1024 / 1024
    };
  }

  public fail(error: Error | string): void {
    this.status = Status.FAILED;
    this.endTime = getTimestamp();
    this.elapsedTime = this.endTime ? Number(this.endTime) - Number(this.startTime) : 0;
    this.errors.push({
      error: typeof error === 'string' ? error : error.message,
      timestamp: getTimestamp()
    });
  }

  public addError(error: string, recordIndex?: number, context?: Record<string, unknown>): void {
    this.errors.push({
      recordIndex,
      error,
      timestamp: getTimestamp(),
      context
    });
    this.errorCount++;
  }

  public get processingRate(): number {
    return this.elapsedTime && this.elapsedTime > 0 
      ? this.inputCount / (this.elapsedTime / 1000) 
      : 0;
  }

  public toJSON(): Record<string, unknown> {
    return {
      status: this.status,
      inputCount: this.inputCount,
      outputCount: this.outputCount,
      errorCount: this.errorCount,
      skippedCount: this.skippedCount,
      processingRate: `${this.processingRate.toFixed(2)} records/sec`,
      errors: this.errors.slice(0, 10),
      elapsedTime: this.elapsedTime,
      metrics: this.metrics
    };
  }
}

/**
 * Base data processor
 */
export abstract class BaseDataProcessor<T = unknown, R = unknown> 
  extends BaseComponent 
  implements IProcessor<T, R> {
  
  public readonly type: ProcessorType;
  protected readonly config: ProcessingConfig;
  protected state: ProcessorState | null = null;

  constructor(name: string, type: ProcessorType, config: ProcessingConfig = {}) {
    super(name, ComponentType.PROCESSOR);
    this.type = type;
    this.config = {
      batchSize: 100,
      maxWorkers: 4,
      timeout: 30000,
      memoryLimit: 512,
      cacheEnabled: false,
      stopOnError: false,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };
  }

  public abstract process(data: T): Promise<R>;

  public async processBatch(data: T[]): Promise<R[]> {
    const results: R[] = [];
    
    for (const item of data) {
      try {
        const result = await this.process(item);
        results.push(result);
      } catch (error) {
        if (this.config.stopOnError) {
          throw error;
        }
        this.logger.error(`Error processing item: ${error}`);
      }
    }
    
    return results;
  }

  public canProcess(data: unknown): boolean {
    return data !== null && data !== undefined;
  }

  public async initialize(): Promise<void> {
    this.logger.info(`Initializing processor: ${this.name}`);
    this.checkMemoryLimit();
  }

  public async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up processor: ${this.name}`);
    if (this.state) {
      await this.saveCheckpoint();
    }
  }

  protected checkMemoryLimit(): void {
    const memoryUsage = process.memoryUsage();
    const usedMB = memoryUsage.heapUsed / 1024 / 1024;
    
    if (this.config.memoryLimit && usedMB > this.config.memoryLimit) {
      throw new ResourceException(
        `Memory limit exceeded: ${usedMB.toFixed(2)}MB > ${this.config.memoryLimit}MB`,
        'memory',
        undefined,
        this.config.memoryLimit,
        usedMB
      );
    }
  }

  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = this.config.timeout!
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new TimeoutException(
            'Operation timed out',
            this.name,
            timeoutMs
          )),
          timeoutMs
        )
      )
    ]);
  }

  protected async withRetry<T>(
    fn: () => Promise<T>,
    attempts: number = this.config.retryAttempts!,
    delay: number = this.config.retryDelay!
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
      }
    }
    
    throw lastError;
  }

  protected async saveCheckpoint(): Promise<void> {
    if (!this.state) return;
    
    const checkpoint: StateCheckpoint = {
      id: generateUUID(),
      state: this.state.data,
      timestamp: getTimestamp(),
      recordsProcessed: 0
    };
    
    this.state.checkpoints = this.state.checkpoints || [];
    this.state.checkpoints.push(checkpoint);
    this.state.lastModified = getTimestamp();
  }

  protected async loadCheckpoint(checkpointId: UUID): Promise<void> {
    if (!this.state || !this.state.checkpoints) return;
    
    const checkpoint = this.state.checkpoints.find(c => c.id === checkpointId);
    if (checkpoint) {
      this.state.data = checkpoint.state;
      this.state.lastModified = getTimestamp();
    }
  }
}

/**
 * Standard data processor
 */
@Processor({ 
  tags: ['standard', 'sequential'],
  capabilities: ['transform', 'filter', 'aggregate']
})
export class DataProcessor<T = unknown, R = unknown> extends BaseDataProcessor<T, R> {
  private transformers: Array<(data: T) => Promise<R> | R> = [];
  private filters: Array<(data: T) => boolean> = [];
  private aggregators: Array<(data: R[]) => R> = [];

  constructor(config: ProcessingConfig = {}) {
    super('DataProcessor', ProcessorType.SEQUENTIAL, config);
  }

  public addTransformer(transformer: (data: T) => Promise<R> | R): this {
    this.transformers.push(transformer);
    return this;
  }

  public addFilter(filter: (data: T) => boolean): this {
    this.filters.push(filter);
    return this;
  }

  public addAggregator(aggregator: (data: R[]) => R): this {
    this.aggregators.push(aggregator);
    return this;
  }

  public async process(data: T): Promise<R> {
    // Apply filters
    for (const filter of this.filters) {
      if (!filter(data)) {
        throw new ProcessingException('Data filtered out', this.name);
      }
    }

    // Apply transformations
    let result: any = data;
    for (const transformer of this.transformers) {
      result = await transformer(result);
    }

    return result as R;
  }

  public async processWithResult(data: T[]): Promise<ProcessingResult<R>> {
    const result = new ProcessingResultImpl<R>();
    result.start();
    result.inputCount = data.length;

    try {
      const processed: R[] = [];
      
      for (let i = 0; i < data.length; i++) {
        try {
          // Check memory periodically
          if (i % 100 === 0) {
            this.checkMemoryLimit();
          }

          const item = data[i];
          
          // Apply filters
          let filtered = false;
          for (const filter of this.filters) {
            if (!filter(item!)) {
              filtered = true;
              break;
            }
          }

          if (filtered) {
            result.skippedCount++;
            continue;
          }

          // Process with timeout
          const processedItem = await this.withTimeout(
            this.process(item!)
          );
          
          processed.push(processedItem);
          result.outputCount++;

        } catch (error) {
          result.addError(
            error instanceof Error ? error.message : String(error),
            i,
            { item: data[i] }
          );
        }
      }

      // Apply aggregators if any
      if (this.aggregators.length > 0 && processed.length > 0) {
        let aggregated = processed;
        for (const aggregator of this.aggregators) {
          aggregated = [aggregator(aggregated)];
        }
        result.data = aggregated;
      } else {
        result.data = processed;
      }

      result.complete();
    } catch (error) {
      result.fail(error as Error);
      throw error;
    }

    return result;
  }
}

/**
 * Parallel processor
 */
@Processor({ 
  tags: ['parallel', 'concurrent'],
  capabilities: ['parallel-processing', 'worker-pool']
})
export class ParallelProcessor<T = unknown, R = unknown> extends BaseDataProcessor<T, R> {
  private workerPool: Worker[] = [];
  private taskQueue: WorkerTask<T, R>[] = [];
  private activeWorkers = 0;
  private completedTasks = 0;
  private failedTasks = 0;

  constructor(config: ProcessingConfig = {}) {
    super('ParallelProcessor', ProcessorType.PARALLEL, config);
  }

  public async initialize(): Promise<void> {
    await super.initialize();
    await this.initializeWorkers();
  }

  public async cleanup(): Promise<void> {
    await this.terminateWorkers();
    await super.cleanup();
  }

  private async initializeWorkers(): Promise<void> {
    const numWorkers = this.config.maxWorkers || 4;
    
    for (let i = 0; i < numWorkers; i++) {
      // In production, create actual Worker threads
      // For now, mock implementation
      const worker = {} as Worker;
      this.workerPool.push(worker);
    }
    
    this.logger.info(`Initialized ${numWorkers} worker threads`);
  }

  private async terminateWorkers(): Promise<void> {
    for (const worker of this.workerPool) {
      // Terminate worker
    }
    this.workerPool = [];
    this.logger.info('Terminated all worker threads');
  }

  public async process(data: T): Promise<R> {
    const task: WorkerTask<T, R> = {
      id: generateUUID(),
      data,
      processor: this.name,
      timeout: this.config.timeout
    };

    return this.executeTask(task);
  }

  private async executeTask(task: WorkerTask<T, R>): Promise<R> {
    return new Promise((resolve, reject) => {
      task.callback = (result: R) => resolve(result);
      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.activeWorkers < this.workerPool.length) {
      const task = this.taskQueue.shift();
      if (!task) break;
      
      this.activeWorkers++;
      
      // Mock processing
      setTimeout(() => {
        const result: WorkerResult<R> = {
          taskId: task.id,
          result: task.data as any,
          duration: 100
        };
        
        if (task.callback) {
          task.callback(result.result!);
        }
        
        this.activeWorkers--;
        this.completedTasks++;
        this.processQueue();
      }, 100);
    }
  }

  public async processBatch(data: T[]): Promise<R[]> {
    const chunks = this.splitIntoChunks(data, this.config.maxWorkers || 4);
    const promises = chunks.map(chunk => this.processChunk(chunk));
    const results = await Promise.all(promises);
    return results.flat();
  }

  private splitIntoChunks(data: T[], numChunks: number): T[][] {
    const chunks: T[][] = [];
    const chunkSize = Math.ceil(data.length / numChunks);
    
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }
    
    return chunks;
  }

  private async processChunk(chunk: T[]): Promise<R[]> {
    const results: R[] = [];
    
    for (const item of chunk) {
      const result = await this.process(item);
      results.push(result);
    }
    
    return results;
  }

  public getWorkerPoolStats(): WorkerPool {
    return {
      size: this.workerPool.length,
      active: this.activeWorkers,
      pending: this.taskQueue.length,
      completed: this.completedTasks,
      failed: this.failedTasks
    };
  }
}

/**
 * Stream processor
 */
@Processor({ 
  tags: ['stream', 'realtime'],
  capabilities: ['stream-processing', 'backpressure']
})
export class StreamProcessor<T = unknown, R = unknown> extends BaseDataProcessor<T, R> {
  private readonly bufferSize: number;
  private readonly highWaterMark: number;
  private buffer: T[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: ProcessingConfig & StreamConfig = {}) {
    super('StreamProcessor', ProcessorType.STREAM, config);
    this.bufferSize = config.bufferSize || 100;
    this.highWaterMark = config.highWaterMark || 1000;
  }

  public async process(data: T): Promise<R> {
    this.buffer.push(data);
    
    if (this.buffer.length >= this.bufferSize) {
      return this.flush() as any;
    }
    
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 5000);
    }
    
    return data as any;
  }

  private async flush(): Promise<R[]> {
    if (this.buffer.length === 0) {
      return [];
    }

    const batch = [...this.buffer];
    this.buffer = [];
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    return this.processBatch(batch);
  }

  public createTransformStream(): Transform {
    return new Transform({
      objectMode: true,
      highWaterMark: this.highWaterMark,
      transform: async (chunk: T, encoding: string, callback: Function) => {
        try {
          const result = await this.process(chunk);
          callback(null, result);
        } catch (error) {
          callback(error);
        }
      },
      flush: async (callback: Function) => {
        try {
          const results = await this.flush();
          for (const result of results) {
            this.push(result);
          }
          callback();
        } catch (error) {
          callback(error);
        }
      }
    });
  }

  public async cleanup(): Promise<void> {
    await this.flush();
    await super.cleanup();
  }
}