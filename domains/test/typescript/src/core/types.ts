// src/core/types.ts
/**
 * Core type definitions for the analytics platform.
 */

import type { 
  UUID, 
  Timestamp, 
  Nullable, 
  Optional, 
  DataRecord,
  Metadata,
  Result,
  AsyncResult 
} from '../types.js';

// Component types
export enum ComponentType {
  PROCESSOR = 'processor',
  TRANSFORMER = 'transformer',
  INGESTER = 'ingester',
  VISUALIZER = 'visualizer',
  CONNECTOR = 'connector',
  VALIDATOR = 'validator',
  AGGREGATOR = 'aggregator',
  EXPORTER = 'exporter',
  PARSER = 'parser',
  CACHE = 'cache',
}

// Status types
export enum Status {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

// Data formats
export enum DataFormat {
  JSON = 'json',
  CSV = 'csv',
  XML = 'xml',
  PARQUET = 'parquet',
  AVRO = 'avro',
  EXCEL = 'excel',
  TEXT = 'text',
  BINARY = 'binary',
}

// Component metadata interface
export interface ComponentMetadata extends Metadata {
  name: string;
  componentType: ComponentType;
  description?: string;
  author?: string;
  dependencies?: string[];
  capabilities?: string[];
  configSchema?: ConfigSchema;
}

// Configuration schema
export interface ConfigSchema {
  type: 'object';
  properties: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
}

// Base component interface
export interface IComponent {
  readonly id: UUID;
  readonly name: string;
  readonly status: Status;
  readonly metadata: ComponentMetadata;
  
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  validate(): boolean;
  getCapabilities(): string[];
}

// Lifecycle interface
export interface ILifecycle {
  onStart(): Promise<void>;
  onStop(): Promise<void>;
  onPause(): Promise<void>;
  onResume(): Promise<void>;
}

// Observable interface
export interface IObservable<T> {
  subscribe(observer: IObserver<T>): void;
  unsubscribe(observer: IObserver<T>): void;
  notify(event: T): void;
}

// Observer interface
export interface IObserver<T> {
  update(event: T): void;
}

// Logger interface
export interface ILogger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  setLevel(level: LogLevel): void;
}

// Configuration interface
export interface IConfig {
  get<T>(key: string, defaultValue?: T): T;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  toJSON(): Record<string, unknown>;
}

// Registry interface
export interface IRegistry<T> {
  register(name: string, component: T): void;
  unregister(name: string): void;
  get(name: string): Nullable<T>;
  has(name: string): boolean;
  list(): string[];
  clear(): void;
}

// Factory interface
export interface IFactory<T, P = unknown> {
  create(params: P): T;
  createAsync(params: P): Promise<T>;
}

// Builder interface
export interface IBuilder<T> {
  build(): T;
  buildAsync(): Promise<T>;
  reset(): this;
  validate(): boolean;
}

// Repository pattern interface
export interface IRepository<T, ID = UUID> {
  findById(id: ID): Promise<Nullable<T>>;
  findAll(): Promise<T[]>;
  findByQuery(query: Query): Promise<T[]>;
  create(entity: Omit<T, 'id'>): Promise<T>;
  update(id: ID, entity: Partial<T>): Promise<T>;
  delete(id: ID): Promise<boolean>;
  exists(id: ID): Promise<boolean>;
  count(): Promise<number>;
}

// Query interface
export interface Query {
  filters?: Filter[];
  sort?: Sort[];
  limit?: number;
  offset?: number;
  fields?: string[];
}

export interface Filter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'neq',
  GREATER_THAN = 'gt',
  GREATER_THAN_OR_EQUAL = 'gte',
  LESS_THAN = 'lt',
  LESS_THAN_OR_EQUAL = 'lte',
  IN = 'in',
  NOT_IN = 'nin',
  CONTAINS = 'contains',
  STARTS_WITH = 'startsWith',
  ENDS_WITH = 'endsWith',
  IS_NULL = 'isNull',
  IS_NOT_NULL = 'isNotNull',
}

export interface Sort {
  field: string;
  direction: 'asc' | 'desc';
}

// Event types
export interface ComponentEvent {
  componentId: UUID;
  componentName: string;
  eventType: string;
  timestamp: Timestamp;
  data?: unknown;
}

export interface ErrorEvent extends ComponentEvent {
  error: Error;
  context?: Record<string, unknown>;
}

export interface ProgressEvent extends ComponentEvent {
  progress: number;
  total: number;
  message?: string;
}

// Decorator metadata
export interface DecoratorMetadata {
  target: unknown;
  propertyKey?: string | symbol;
  descriptor?: PropertyDescriptor;
  metadata?: Record<string, unknown>;
}

// Type for component constructor
export type ComponentConstructor<T = IComponent> = new (...args: unknown[]) => T;

// Type for async initializer
export type AsyncInitializer<T> = () => Promise<T>;

// Type for cleanup handler
export type CleanupHandler = () => void | Promise<void>;

// Type for error handler
export type ErrorHandler = (error: Error) => void | Promise<void>;

// Type for progress callback
export type ProgressCallback = (progress: number, total: number) => void;

// Generic event map for typed events
export interface CoreEventMap {
  'component:registered': { component: ComponentMetadata };
  'component:unregistered': { componentName: string };
  'component:initialized': { componentId: UUID };
  'component:error': ErrorEvent;
  'progress': ProgressEvent;
  'status:changed': { oldStatus: Status; newStatus: Status };
}

// Utility type for extracting component options
export type ComponentOptions<T extends IComponent> = T extends { options: infer O } ? O : never;

// Utility type for component with specific capabilities
export type WithCapabilities<C extends string> = IComponent & {
  getCapabilities(): C[];
};

// Type guard for component type checking
export function isComponent(value: unknown): value is IComponent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'status' in value &&
    'metadata' in value
  );
}

// Type guard for error event
export function isErrorEvent(event: ComponentEvent): event is ErrorEvent {
  return 'error' in event && event.error instanceof Error;
}

// Type guard for progress event
export function isProgressEvent(event: ComponentEvent): event is ProgressEvent {
  return 'progress' in event && 'total' in event;
}