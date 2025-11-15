// src/types.ts
/**
 * Global type definitions for the analytics platform.
 */

// Branded types for type safety
export type Brand<K, T> = K & { __brand: T };

// Common branded types
export type UUID = Brand<string, 'UUID'>;
export type Timestamp = Brand<number, 'Timestamp'>;
export type JSONString = Brand<string, 'JSONString'>;
export type FilePath = Brand<string, 'FilePath'>;
export type URL = Brand<string, 'URL'>;
export type EmailAddress = Brand<string, 'EmailAddress'>;

// Utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;
export type NonEmptyArray<T> = [T, ...T[]];
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// Result type for error handling
export type Result<T, E = Error> = 
  | { success: true; value: T }
  | { success: false; error: E };

// Async result type
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// Event types
export interface EventMap {
  [key: string]: unknown;
}

export interface TypedEventEmitter<Events extends EventMap> {
  on<K extends keyof Events>(event: K, listener: (data: Events[K]) => void): this;
  off<K extends keyof Events>(event: K, listener: (data: Events[K]) => void): this;
  emit<K extends keyof Events>(event: K, data: Events[K]): boolean;
  once<K extends keyof Events>(event: K, listener: (data: Events[K]) => void): this;
}

// Data types
export type Primitive = string | number | boolean | null | undefined;
export type JSONValue = Primitive | JSONObject | JSONArray;
export interface JSONObject {
  [key: string]: JSONValue;
}
export interface JSONArray extends Array<JSONValue> {}

// Record types
export type DataRecord = Record<string, unknown>;
export type StringRecord = Record<string, string>;
export type NumberRecord = Record<string, number>;

// Function types
export type AsyncFunction<T = void> = () => Promise<T>;
export type Predicate<T> = (value: T) => boolean;
export type Comparator<T> = (a: T, b: T) => number;
export type Mapper<T, U> = (value: T) => U;
export type AsyncMapper<T, U> = (value: T) => Promise<U>;
export type Reducer<T, U> = (accumulator: U, current: T) => U;

// Pagination types
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Time range types
export interface TimeRange {
  start: Date;
  end: Date;
}

// Metadata types
export interface Metadata {
  id: UUID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version: string;
  tags?: string[];
  [key: string]: unknown;
}

// Configuration types
export interface Config {
  readonly env: 'development' | 'staging' | 'production';
  readonly debug: boolean;
  readonly logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  [key: string]: unknown;
}

// Error types
export interface ErrorDetails {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
  timestamp: Timestamp;
}

// Validation types
export interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Generic CRUD operations
export interface Repository<T, ID = UUID> {
  findById(id: ID): Promise<Nullable<T>>;
  findAll(): Promise<T[]>;
  create(entity: Omit<T, 'id'>): Promise<T>;
  update(id: ID, entity: Partial<T>): Promise<T>;
  delete(id: ID): Promise<boolean>;
}

// Observer pattern types
export interface Observer<T> {
  update(data: T): void;
}

export interface Observable<T> {
  subscribe(observer: Observer<T>): void;
  unsubscribe(observer: Observer<T>): void;
  notify(data: T): void;
}

// Builder pattern types
export interface Builder<T> {
  build(): T;
  reset(): this;
}

// Factory pattern types
export interface Factory<T, P = unknown> {
  create(params: P): T;
}

// Strategy pattern types
export interface Strategy<T, R> {
  execute(data: T): R;
}

// Type guards
export const isString = (value: unknown): value is string => typeof value === 'string';
export const isNumber = (value: unknown): value is number => typeof value === 'number';
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const isObject = (value: unknown): value is object => 
  value !== null && typeof value === 'object';
export const isArray = <T>(value: unknown): value is T[] => Array.isArray(value);
export const isFunction = (value: unknown): value is Function => typeof value === 'function';
export const isNull = (value: unknown): value is null => value === null;
export const isUndefined = (value: unknown): value is undefined => value === undefined;
export const isNullOrUndefined = (value: unknown): value is null | undefined => 
  value === null || value === undefined;

// Type assertions
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

export function assertType<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  message = 'Type assertion failed'
): asserts value is T {
  if (!guard(value)) {
    throw new Error(message);
  }
}

// Utility functions
export function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled value: ${value}`);
}

export function keys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

export function entries<T extends object>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][];
}

export function values<T extends object>(obj: T): T[keyof T][] {
  return Object.values(obj) as T[keyof T][];
}

// Type-safe omit
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Type-safe pick
export type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Extract promise type
export type PromiseType<T extends Promise<unknown>> = T extends Promise<infer U> ? U : never;

// Extract array element type
export type ArrayElement<T extends readonly unknown[]> = T extends readonly (infer U)[] ? U : never;

// Make specific properties required
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Make specific properties optional
export type PartialFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;