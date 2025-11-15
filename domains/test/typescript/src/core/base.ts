// src/core/base.ts
/**
 * Base classes and interfaces for the analytics platform.
 */

import { EventEmitter } from 'events';
import type { 
  UUID, 
  Timestamp, 
  Nullable, 
  Optional,
  Result,
  AsyncResult,
  TypedEventEmitter,
  EventMap
} from '../types.js';
import type { 
  IComponent, 
  ILifecycle, 
  IObservable, 
  IObserver,
  ILogger,
  ComponentMetadata,
  ComponentType,
  Status,
  LogLevel,
  ComponentEvent,
  CoreEventMap
} from './types.js';

/**
 * Generate a UUID v4
 */
export function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }) as UUID;
}

/**
 * Get current timestamp
 */
export function getTimestamp(): Timestamp {
  return Date.now() as Timestamp;
}

/**
 * Logger implementation
 */
export class Logger implements ILogger {
  private level: LogLevel = LogLevel.INFO;
  
  constructor(
    private readonly context: string,
    level?: LogLevel
  ) {
    if (level !== undefined) {
      this.level = level;
    }
  }

  public error(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.ERROR) {
      console.error(`[${this.context}] ERROR:`, message, ...args);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.WARN) {
      console.warn(`[${this.context}] WARN:`, message, ...args);
    }
  }

  public info(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.INFO) {
      console.info(`[${this.context}] INFO:`, message, ...args);
    }
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.DEBUG) {
      console.debug(`[${this.context}] DEBUG:`, message, ...args);
    }
  }

  public trace(message: string, ...args: unknown[]): void {
    if (this.level >= LogLevel.TRACE) {
      console.trace(`[${this.context}] TRACE:`, message, ...args);
    }
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }
}

/**
 * Base component class
 */
export abstract class BaseComponent implements IComponent, ILifecycle {
  public readonly id: UUID;
  public readonly name: string;
  private _status: Status = Status.PENDING;
  public readonly metadata: ComponentMetadata;
  protected readonly logger: Logger;
  protected readonly eventEmitter: EventEmitter;

  constructor(name: string, componentType: ComponentType, metadata?: Partial<ComponentMetadata>) {
    this.id = generateUUID();
    this.name = name;
    this.metadata = {
      id: this.id,
      name,
      componentType,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
      version: '1.0.0',
      ...metadata,
    };
    this.logger = new Logger(name);
    this.eventEmitter = new EventEmitter();
  }

  public get status(): Status {
    return this._status;
  }

  protected setStatus(status: Status): void {
    const oldStatus = this._status;
    this._status = status;
    this.emitEvent('status:changed', { oldStatus, newStatus: status });
  }

  public abstract initialize(): Promise<void>;
  
  public abstract cleanup(): Promise<void>;
  
  public validate(): boolean {
    return true;
  }

  public getCapabilities(): string[] {
    return this.metadata.capabilities || [];
  }

  public async onStart(): Promise<void> {
    this.setStatus(Status.RUNNING);
    await this.initialize();
  }

  public async onStop(): Promise<void> {
    this.setStatus(Status.COMPLETED);
    await this.cleanup();
  }

  public async onPause(): Promise<void> {
    this.setStatus(Status.PAUSED);
  }

  public async onResume(): Promise<void> {
    this.setStatus(Status.RUNNING);
  }

  protected emitEvent(eventType: string, data?: unknown): void {
    const event: ComponentEvent = {
      componentId: this.id,
      componentName: this.name,
      eventType,
      timestamp: getTimestamp(),
      data,
    };
    this.eventEmitter.emit(eventType, event);
  }

  public on(event: string, listener: (data: ComponentEvent) => void): void {
    this.eventEmitter.on(event, listener);
  }

  public off(event: string, listener: (data: ComponentEvent) => void): void {
    this.eventEmitter.off(event, listener);
  }
}

/**
 * Base processor class
 */
export abstract class BaseProcessor extends BaseComponent {
  constructor(name: string, metadata?: Partial<ComponentMetadata>) {
    super(name, ComponentType.PROCESSOR, metadata);
  }

  public abstract process<T, R>(data: T): Promise<R>;
  
  public async processBatch<T, R>(data: T[]): Promise<R[]> {
    const results: R[] = [];
    for (const item of data) {
      results.push(await this.process<T, R>(item));
    }
    return results;
  }
}

/**
 * Base transformer class
 */
export abstract class BaseTransformer extends BaseComponent {
  constructor(name: string, metadata?: Partial<ComponentMetadata>) {
    super(name, ComponentType.TRANSFORMER, metadata);
  }

  public abstract transform<T, R>(data: T): Promise<R> | R;
  
  public abstract canTransform(data: unknown): boolean;
}

/**
 * Base validator class
 */
export abstract class BaseValidator<T = unknown> extends BaseComponent {
  protected errors: string[] = [];
  
  constructor(name: string, metadata?: Partial<ComponentMetadata>) {
    super(name, ComponentType.VALIDATOR, metadata);
  }

  public abstract validate(value: T): boolean | Promise<boolean>;
  
  public getErrors(): string[] {
    return [...this.errors];
  }

  public clearErrors(): void {
    this.errors = [];
  }

  public hasErrors(): boolean {
    return this.errors.length > 0;
  }

  protected addError(error: string): void {
    this.errors.push(error);
  }
}

/**
 * Observable implementation
 */
export class Observable<T> implements IObservable<T> {
  private observers: Set<IObserver<T>> = new Set();

  public subscribe(observer: IObserver<T>): void {
    this.observers.add(observer);
  }

  public unsubscribe(observer: IObserver<T>): void {
    this.observers.delete(observer);
  }

  public notify(event: T): void {
    this.observers.forEach(observer => observer.update(event));
  }
}

/**
 * Typed event emitter wrapper
 */
export class TypedEventEmitterImpl<T extends EventMap> implements TypedEventEmitter<T> {
  private emitter = new EventEmitter();

  public on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.on(event as string, listener);
    return this;
  }

  public off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.off(event as string, listener);
    return this;
  }

  public emit<K extends keyof T>(event: K, data: T[K]): boolean {
    return this.emitter.emit(event as string, data);
  }

  public once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.once(event as string, listener);
    return this;
  }
}

/**
 * Result builder for error handling
 */
export class ResultBuilder {
  public static success<T>(value: T): Result<T> {
    return { success: true, value };
  }

  public static failure<E = Error>(error: E): Result<never, E> {
    return { success: false, error };
  }

  public static async fromPromise<T>(promise: Promise<T>): AsyncResult<T> {
    try {
      const value = await promise;
      return ResultBuilder.success(value);
    } catch (error) {
      return ResultBuilder.failure(error as Error);
    }
  }

  public static map<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
    if (result.success) {
      return ResultBuilder.success(fn(result.value));
    }
    return result;
  }

  public static flatMap<T, U>(
    result: Result<T>,
    fn: (value: T) => Result<U>
  ): Result<U> {
    if (result.success) {
      return fn(result.value);
    }
    return result;
  }

  public static isSuccess<T>(result: Result<T>): result is { success: true; value: T } {
    return result.success;
  }

  public static isFailure<T, E>(result: Result<T, E>): result is { success: false; error: E } {
    return !result.success;
  }
}

/**
 * Base factory class
 */
export abstract class BaseFactory<T, P = unknown> {
  protected readonly logger: Logger;

  constructor(protected readonly name: string) {
    this.logger = new Logger(`${name}Factory`);
  }

  public abstract create(params: P): T;

  public async createAsync(params: P): Promise<T> {
    return this.create(params);
  }

  public createBatch(paramsList: P[]): T[] {
    return paramsList.map(params => this.create(params));
  }
}

/**
 * Base builder class
 */
export abstract class BaseBuilder<T> {
  protected result!: T;

  public abstract build(): T;
  
  public async buildAsync(): Promise<T> {
    return this.build();
  }

  public abstract reset(): this;
  
  public abstract validate(): boolean;
}

/**
 * Base repository class
 */
export abstract class BaseRepository<T, ID = UUID> {
  protected readonly logger: Logger;

  constructor(protected readonly name: string) {
    this.logger = new Logger(`${name}Repository`);
  }

  public abstract findById(id: ID): Promise<Nullable<T>>;
  public abstract findAll(): Promise<T[]>;
  public abstract create(entity: Omit<T, 'id'>): Promise<T>;
  public abstract update(id: ID, entity: Partial<T>): Promise<T>;
  public abstract delete(id: ID): Promise<boolean>;
  
  public async exists(id: ID): Promise<boolean> {
    const entity = await this.findById(id);
    return entity !== null;
  }

  public async count(): Promise<number> {
    const entities = await this.findAll();
    return entities.length;
  }
}