// src/ingestion/types.ts
/**
 * Type definitions for the ingestion module.
 */

import type {
  UUID,
  Timestamp,
  Nullable,
  DataRecord,
  AsyncResult,
  FilePath,
  URL,
  JSONValue,
  Metadata
} from '../types.js';
import type { DataFormat, Status } from '../core/types.js';

// Data source types
export enum SourceType {
  FILE = 'file',
  DATABASE = 'database',
  API = 'api',
  STREAM = 'stream',
  MEMORY = 'memory',
  S3 = 's3',
  KAFKA = 'kafka',
  WEBSOCKET = 'websocket'
}

// Connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  ERROR = 'error'
}

// Schema data types
export enum SchemaDataType {
  STRING = 'string',
  INTEGER = 'integer',
  FLOAT = 'float',
  BOOLEAN = 'boolean',
  DATETIME = 'datetime',
  DATE = 'date',
  TIME = 'time',
  ARRAY = 'array',
  OBJECT = 'object',
  NULL = 'null',
  UNKNOWN = 'unknown'
}

// Source configuration
export interface SourceConfig {
  type: SourceType;
  name: string;
  format?: DataFormat;
  credentials?: SourceCredentials;
  options?: Record<string, unknown>;
  retryConfig?: RetryConfig;
  validateSchema?: boolean;
  batchSize?: number;
}

// Source credentials
export interface SourceCredentials {
  username?: string;
  password?: string;
  apiKey?: string;
  token?: string;
  certificate?: string;
  privateKey?: string;
  [key: string]: unknown;
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

// Connection configuration
export interface ConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  protocol?: 'http' | 'https' | 'tcp' | 'udp' | 'ws' | 'wss';
  timeout?: number;
  keepAlive?: boolean;
  poolSize?: number;
  ssl?: SSLConfig;
}

// SSL configuration
export interface SSLConfig {
  enabled: boolean;
  rejectUnauthorized?: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

// Data source interface
export interface IDataSource {
  readonly id: UUID;
  readonly name: string;
  readonly type: SourceType;
  readonly status: Status;
  readonly connectionState: ConnectionState;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  read<T = DataRecord>(options?: ReadOptions): AsyncGenerator<T, void, unknown>;
  readBatch<T = DataRecord>(size: number, options?: ReadOptions): Promise<T[]>;
  getMetadata(): Promise<SourceMetadata>;
  validate(): Promise<boolean>;
}

// Read options
export interface ReadOptions {
  limit?: number;
  offset?: number;
  filter?: FilterExpression;
  sort?: SortExpression;
  fields?: string[];
  batchSize?: number;
  stream?: boolean;
}

// Filter expression
export interface FilterExpression {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'regex';
  value: unknown;
  and?: FilterExpression[];
  or?: FilterExpression[];
}

// Sort expression
export interface SortExpression {
  field: string;
  direction: 'asc' | 'desc';
}

// Source metadata
export interface SourceMetadata extends Metadata {
  sourceType: SourceType;
  format?: DataFormat;
  size?: number;
  recordCount?: number;
  schema?: DataSchema;
  lastModified?: Timestamp;
  encoding?: string;
}

// Data schema
export interface DataSchema {
  name: string;
  fields: SchemaField[];
  primaryKey?: string | string[];
  foreignKeys?: ForeignKey[];
  indexes?: Index[];
  constraints?: Constraint[];
}

// Schema field
export interface SchemaField {
  name: string;
  type: SchemaDataType;
  nullable?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: unknown[];
  description?: string;
}

// Foreign key
export interface ForeignKey {
  field: string;
  referenceTable: string;
  referenceField: string;
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

// Index
export interface Index {
  name: string;
  fields: string[];
  unique?: boolean;
  type?: 'BTREE' | 'HASH' | 'FULLTEXT';
}

// Constraint
export interface Constraint {
  name: string;
  type: 'CHECK' | 'UNIQUE' | 'NOT NULL';
  expression: string;
}

// Connector interface
export interface IConnector {
  readonly name: string;
  readonly type: string;
  readonly connectionState: ConnectionState;
  
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  execute<T = unknown>(command: unknown): Promise<T>;
  executeMany<T = unknown>(commands: unknown[]): Promise<T[]>;
  isConnected(): boolean;
  getConnectionInfo(): ConnectionInfo;
}

// Connection info
export interface ConnectionInfo {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  version?: string;
  uptime?: number;
  activeConnections?: number;
}

// Parser interface
export interface IParser<T = DataRecord> {
  readonly format: DataFormat;
  
  parse(input: string | Buffer | NodeJS.ReadableStream): AsyncGenerator<T, void, unknown>;
  parseBatch(input: string | Buffer): T[];
  validate(data: unknown): boolean;
  detectSchema(sample: T[]): DataSchema;
}

// Parser options
export interface ParserOptions {
  encoding?: BufferEncoding;
  delimiter?: string;
  quote?: string;
  escape?: string;
  headers?: boolean | string[];
  skipRows?: number;
  maxRows?: number;
  strictMode?: boolean;
  dateFormat?: string;
  nullValues?: string[];
}

// Loader interface
export interface ILoader {
  load<T = DataRecord>(source: IDataSource, options?: LoadOptions): AsyncResult<LoadResult<T>>;
  loadBatch<T = DataRecord>(sources: IDataSource[], options?: LoadOptions): AsyncResult<LoadResult<T>[]>;
  transform<T, R>(data: T, transformers: ITransformer<T, R>[]): Promise<R>;
  validate<T>(data: T, schema: DataSchema): boolean;
}

// Load options
export interface LoadOptions {
  batchSize?: number;
  parallel?: boolean;
  maxWorkers?: number;
  validateSchema?: boolean;
  detectSchema?: boolean;
  transformers?: unknown[];
  errorHandler?: (error: Error) => void;
  progressCallback?: (progress: LoadProgress) => void;
}

// Load result
export interface LoadResult<T = DataRecord> {
  status: Status;
  data: T[];
  recordsLoaded: number;
  recordsFailed: number;
  errors: LoadError[];
  warnings: string[];
  schema?: DataSchema;
  startTime: Timestamp;
  endTime?: Timestamp;
  elapsedTime?: number;
}

// Load error
export interface LoadError {
  recordIndex?: number;
  field?: string;
  value?: unknown;
  error: string;
  timestamp: Timestamp;
}

// Load progress
export interface LoadProgress {
  current: number;
  total: number;
  percentage: number;
  recordsLoaded: number;
  recordsFailed: number;
  estimatedTimeRemaining?: number;
}

// Transformer interface
export interface ITransformer<T = unknown, R = unknown> {
  transform(data: T): R | Promise<R>;
  canTransform(data: unknown): boolean;
}

// Schema detector interface
export interface ISchemaDetector {
  detect(sample: DataRecord[]): DataSchema;
  detectFromSource(source: IDataSource, sampleSize?: number): Promise<DataSchema>;
  merge(schemas: DataSchema[]): DataSchema;
  compare(schema1: DataSchema, schema2: DataSchema): SchemaDifference[];
}

// Schema difference
export interface SchemaDifference {
  type: 'added' | 'removed' | 'modified';
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  description?: string;
}

// Stream options
export interface StreamOptions {
  highWaterMark?: number;
  encoding?: BufferEncoding;
  objectMode?: boolean;
  autoClose?: boolean;
  emitClose?: boolean;
}

// Batch processor interface
export interface IBatchProcessor<T = DataRecord> {
  processBatch(batch: T[]): Promise<T[]>;
  getBatchSize(): number;
  setBatchSize(size: number): void;
}

// Type guards
export function isDataSource(value: unknown): value is IDataSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'connect' in value &&
    'disconnect' in value &&
    'read' in value
  );
}

export function isConnector(value: unknown): value is IConnector {
  return (
    typeof value === 'object' &&
    value !== null &&
    'connect' in value &&
    'disconnect' in value &&
    'execute' in value
  );
}

export function isParser(value: unknown): value is IParser {
  return (
    typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    'parse' in value
  );
}

export function isSchemaField(value: unknown): value is SchemaField {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'type' in value
  );
}

export function isDataSchema(value: unknown): value is DataSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'fields' in value &&
    Array.isArray((value as any).fields)
  );
}