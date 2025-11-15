// src/processing/types.ts
/**
 * Type definitions for the processing module.
 */

import type {
  UUID,
  Timestamp,
  DataRecord,
  Result,
  AsyncResult,
  Nullable,
  Predicate,
  Mapper,
  AsyncMapper,
  Reducer
} from '../types.js';
import type { Status } from '../core/types.js';

// Processor types
export enum ProcessorType {
  BATCH = 'batch',
  STREAM = 'stream',
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential',
  STATEFUL = 'stateful',
  STATELESS = 'stateless'
}

// Transformer types
export enum TransformerType {
  MAP = 'map',
  FILTER = 'filter',
  REDUCE = 'reduce',
  FLATMAP = 'flatmap',
  GROUP = 'group',
  JOIN = 'join',
  WINDOW = 'window',
  PIVOT = 'pivot',
  UNPIVOT = 'unpivot',
  NORMALIZE = 'normalize'
}

// Aggregation types
export enum AggregationType {
  SUM = 'sum',
  COUNT = 'count',
  AVERAGE = 'average',
  MIN = 'min',
  MAX = 'max',
  MEDIAN = 'median',
  MODE = 'mode',
  PERCENTILE = 'percentile',
  STDDEV = 'stddev',
  VARIANCE = 'variance',
  DISTINCT = 'distinct',
  GROUP = 'group',
  FIRST = 'first',
  LAST = 'last',
  TOP_N = 'topN',
  BOTTOM_N = 'bottomN'
}

// Cache types
export enum CacheType {
  MEMORY = 'memory',
  REDIS = 'redis',
  DISK = 'disk',
  HYBRID = 'hybrid',
  LRU = 'lru',
  LFU = 'lfu',
  TTL = 'ttl'
}

// Cache eviction policies
export enum EvictionPolicy {
  LRU = 'lru',    // Least Recently Used
  LFU = 'lfu',    // Least Frequently Used
  FIFO = 'fifo',  // First In First Out
  LIFO = 'lifo',  // Last In First Out
  RANDOM = 'random',
  TTL = 'ttl'     // Time To Live
}

// Processing configuration
export interface ProcessingConfig {
  batchSize?: number;
  maxWorkers?: number;
  timeout?: number;
  memoryLimit?: number;
  cacheEnabled?: boolean;
  cacheType?: CacheType;
  stopOnError?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  checkpointInterval?: number;
}

// Processor interface
export interface IProcessor<T = unknown, R = unknown> {
  readonly id: UUID;
  readonly name: string;
  readonly type: ProcessorType;
  readonly status: Status;
  
  process(data: T): Promise<R>;
  processBatch(data: T[]): Promise<R[]>;
  canProcess(data: unknown): boolean;
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}

// Transformer interface
export interface ITransformer<T = unknown, R = unknown> {
  readonly name: string;
  readonly type: TransformerType;
  
  transform(data: T): R | Promise<R>;
  transformBatch?(data: T[]): R[] | Promise<R[]>;
  canTransform(data: unknown): boolean;
}

// Aggregator interface
export interface IAggregator<T = unknown, R = unknown> {
  readonly name: string;
  readonly type: AggregationType;
  
  add(value: T): void;
  addBatch(values: T[]): void;
  getResult(): R;
  reset(): void;
  merge(other: IAggregator<T, R>): void;
  clone(): IAggregator<T, R>;
}

// Pipeline interface
export interface IPipeline {
  readonly id: UUID;
  readonly name: string;
  readonly status: Status;
  
  addStep(step: PipelineStep): IPipeline;
  removeStep(stepId: UUID): IPipeline;
  insertStep(index: number, step: PipelineStep): IPipeline;
  execute<T, R>(input: T): Promise<R>;
  validate(): boolean;
  toJSON(): PipelineConfig;
}

// Pipeline step
export interface PipelineStep {
  id: UUID;
  name: string;
  processor?: IProcessor;
  transformer?: ITransformer;
  aggregator?: IAggregator;
  condition?: Predicate<unknown>;
  errorHandler?: (error: Error) => void;
  retryConfig?: RetryConfig;
  timeout?: number;
  parallel?: boolean;
  continueOnError?: boolean;
}

// Pipeline configuration
export interface PipelineConfig {
  name: string;
  steps: PipelineStep[];
  parallel?: boolean;
  stopOnError?: boolean;
  maxConcurrency?: number;
  checkpoints?: boolean;
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  delay: number;
  backoff?: 'linear' | 'exponential' | 'fibonacci';
  maxDelay?: number;
  jitter?: boolean;
}

// Cache interface
export interface ICache<K = string, V = unknown> {
  get(key: K): Promise<Nullable<V>>;
  set(key: K, value: V, ttl?: number): Promise<void>;
  delete(key: K): Promise<boolean>;
  has(key: K): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
  keys(): Promise<K[]>;
  values?(): Promise<V[]>;
  entries?(): Promise<[K, V][]>;
  getStats(): CacheStats;
}

// Cache configuration
export interface CacheConfig {
  type?: CacheType;
  maxSize?: number;
  ttl?: number;
  evictionPolicy?: EvictionPolicy;
  persistence?: boolean;
  compressionEnabled?: boolean;
  encryptionEnabled?: boolean;
}

// Cache entry
export interface CacheEntry<V = unknown> {
  value: V;
  expiry?: Timestamp;
  hits: number;
  misses: number;
  lastAccess: Timestamp;
  createdAt: Timestamp;
  size?: number;
}

// Cache statistics
export interface CacheStats {
  size: number;
  maxSize?: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  memoryUsage?: number;
  avgAccessTime?: number;
}

// Processing result
export interface ProcessingResult<T = unknown> {
  status: Status;
  data: T[];
  inputCount: number;
  outputCount: number;
  errorCount: number;
  skippedCount: number;
  startTime: Timestamp;
  endTime?: Timestamp;
  elapsedTime?: number;
  errors?: ProcessingError[];
  metrics?: ProcessingMetrics;
}

// Processing error
export interface ProcessingError {
  recordIndex?: number;
  field?: string;
  error: string;
  timestamp: Timestamp;
  context?: Record<string, unknown>;
  stackTrace?: string;
}

// Processing metrics
export interface ProcessingMetrics {
  throughput: number;      // records/second
  latency: number;         // ms/record
  cpuUsage: number;        // percentage
  memoryUsage: number;     // MB
  [key: string]: number;
}

// Transform function types
export type MapFunction<T, R> = Mapper<T, R>;
export type FilterFunction<T> = Predicate<T>;
export type ReduceFunction<T, R> = Reducer<T, R>;
export type FlatMapFunction<T, R> = (value: T) => R[];
export type GroupByFunction<T, K> = (value: T) => K;
export type JoinFunction<L, R, O> = (left: L, right: R) => O;

// Async transform function types
export type AsyncMapFunction<T, R> = AsyncMapper<T, R>;
export type AsyncFilterFunction<T> = (value: T) => Promise<boolean>;
export type AsyncReduceFunction<T, R> = (acc: R, value: T) => Promise<R>;

// Window types
export interface Window<T> {
  id: string;
  start: Timestamp;
  end: Timestamp;
  data: T[];
  count: number;
}

export interface WindowConfig {
  type: 'tumbling' | 'sliding' | 'session' | 'global';
  size?: number;        // number of records
  duration?: number;    // time in ms
  slide?: number;       // slide interval for sliding windows
  gap?: number;         // gap for session windows
  trigger?: WindowTrigger;
  allowedLateness?: number;
}

export interface WindowTrigger {
  type: 'count' | 'time' | 'watermark' | 'custom';
  threshold?: number;
  condition?: Predicate<Window<unknown>>;
}

// Join types
export interface JoinConfig {
  type: 'inner' | 'left' | 'right' | 'full' | 'cross';
  leftKey: string | ((item: unknown) => unknown);
  rightKey: string | ((item: unknown) => unknown);
  select?: string[] | ((left: unknown, right: unknown) => unknown);
  window?: WindowConfig;
}

// State management
export interface ProcessorState {
  id: UUID;
  data: Record<string, unknown>;
  version: number;
  lastModified: Timestamp;
  checkpoints?: StateCheckpoint[];
}

export interface StateCheckpoint {
  id: UUID;
  state: Record<string, unknown>;
  timestamp: Timestamp;
  recordsProcessed: number;
  metadata?: Record<string, unknown>;
}

// Worker types
export interface WorkerTask<T = unknown, R = unknown> {
  id: UUID;
  data: T;
  processor: string;
  priority?: number;
  timeout?: number;
  retries?: number;
  callback?: (result: R) => void;
  errorCallback?: (error: Error) => void;
}

export interface WorkerResult<R = unknown> {
  taskId: UUID;
  result?: R;
  error?: Error;
  duration: number;
  retries?: number;
}

export interface WorkerPool {
  size: number;
  active: number;
  pending: number;
  completed: number;
  failed: number;
}

// Stream processing
export interface StreamConfig {
  bufferSize?: number;
  highWaterMark?: number;
  backpressure?: boolean;
  encoding?: BufferEncoding;
  objectMode?: boolean;
}

export interface StreamProcessor<T = unknown, R = unknown> {
  processStream(stream: NodeJS.ReadableStream): NodeJS.WritableStream;
  processRecord(record: T): Promise<R>;
  flush(): Promise<void>;
}

// Batch processing
export interface BatchConfig {
  size: number;
  timeout?: number;
  parallel?: boolean;
  ordered?: boolean;
  maxRetries?: number;
}

export interface BatchProcessor<T = unknown, R = unknown> {
  processBatch(batch: T[]): Promise<R[]>;
  getBatchSize(): number;
  setBatchSize(size: number): void;
}

// Aggregation state
export interface AggregationState<T = unknown> {
  count: number;
  sum?: number;
  min?: T;
  max?: T;
  values?: T[];
  groups?: Map<string, T[]>;
  custom?: Record<string, unknown>;
}

// Transformation context
export interface TransformContext {
  index: number;
  total?: number;
  timestamp: Timestamp;
  metadata?: Record<string, unknown>;
  state?: Record<string, unknown>;
  updateState?: (key: string, value: unknown) => void;
}

// Type guards
export function isProcessor(value: unknown): value is IProcessor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'process' in value &&
    'processBatch' in value &&
    'canProcess' in value
  );
}

export function isTransformer(value: unknown): value is ITransformer {
  return (
    typeof value === 'object' &&
    value !== null &&
    'transform' in value &&
    'canTransform' in value
  );
}

export function isAggregator(value: unknown): value is IAggregator {
  return (
    typeof value === 'object' &&
    value !== null &&
    'add' in value &&
    'getResult' in value &&
    'reset' in value
  );
}

export function isPipeline(value: unknown): value is IPipeline {
  return (
    typeof value === 'object' &&
    value !== null &&
    'addStep' in value &&
    'execute' in value
  );
}

export function isCache(value: unknown): value is ICache {
  return (
    typeof value === 'object' &&
    value !== null &&
    'get' in value &&
    'set' in value &&
    'delete' in value
  );
}

export function isWindow<T>(value: unknown): value is Window<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'start' in value &&
    'end' in value &&
    'data' in value
  );
}