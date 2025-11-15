// src/core/exceptions.ts
/**
 * Custom exception classes for the analytics platform.
 */

import type { ErrorDetails, Timestamp } from '../types.js';
import { getTimestamp } from './base.js';

/**
 * Base exception class for the platform
 */
export abstract class PlatformException extends Error {
  public readonly code: string;
  public readonly timestamp: Timestamp;
  public readonly details?: unknown;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    details?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = getTimestamp();
    this.details = details;
    this.context = context;

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
      timestamp: this.timestamp,
    };
  }

  public toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

/**
 * Validation exception
 */
export class ValidationException extends PlatformException {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    public readonly constraints?: Record<string, unknown>
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      { field, value, constraints },
      { validationType: 'field' }
    );
  }
}

/**
 * Configuration exception
 */
export class ConfigurationException extends PlatformException {
  constructor(
    message: string,
    public readonly configKey?: string,
    public readonly expectedType?: string,
    public readonly actualType?: string
  ) {
    super(
      message,
      'CONFIGURATION_ERROR',
      { configKey, expectedType, actualType },
      { configurationType: 'system' }
    );
  }
}

/**
 * Data ingestion exception
 */
export class DataIngestionException extends PlatformException {
  constructor(
    message: string,
    public readonly source?: string,
    public readonly format?: string,
    public readonly recordIndex?: number
  ) {
    super(
      message,
      'DATA_INGESTION_ERROR',
      { source, format, recordIndex },
      { phase: 'ingestion' }
    );
  }
}

/**
 * Processing exception
 */
export class ProcessingException extends PlatformException {
  constructor(
    message: string,
    public readonly processorName?: string,
    public readonly stage?: string,
    public readonly recordId?: string
  ) {
    super(
      message,
      'PROCESSING_ERROR',
      { processorName, stage, recordId },
      { phase: 'processing' }
    );
  }
}

/**
 * Connection exception
 */
export class ConnectionException extends PlatformException {
  constructor(
    message: string,
    public readonly host?: string,
    public readonly port?: number,
    public readonly protocol?: string,
    public readonly retryCount?: number
  ) {
    super(
      message,
      'CONNECTION_ERROR',
      { host, port, protocol, retryCount },
      { type: 'network' }
    );
  }
}

/**
 * Resource exception
 */
export class ResourceException extends PlatformException {
  constructor(
    message: string,
    public readonly resourceType: string,
    public readonly resourceId?: string,
    public readonly limit?: number,
    public readonly current?: number
  ) {
    super(
      message,
      'RESOURCE_ERROR',
      { resourceType, resourceId, limit, current },
      { type: 'resource' }
    );
  }
}

/**
 * Schema exception
 */
export class SchemaException extends PlatformException {
  constructor(
    message: string,
    public readonly schemaName?: string,
    public readonly fieldErrors?: Record<string, string[]>,
    public readonly missingFields?: string[],
    public readonly extraFields?: string[]
  ) {
    super(
      message,
      'SCHEMA_ERROR',
      { schemaName, fieldErrors, missingFields, extraFields },
      { type: 'schema' }
    );
  }
}

/**
 * Pipeline exception
 */
export class PipelineException extends PlatformException {
  constructor(
    message: string,
    public readonly pipelineName?: string,
    public readonly stageName?: string,
    public readonly stageIndex?: number,
    public readonly failedStep?: string
  ) {
    super(
      message,
      'PIPELINE_ERROR',
      { pipelineName, stageName, stageIndex, failedStep },
      { phase: 'pipeline' }
    );
  }
}

/**
 * Cache exception
 */
export class CacheException extends PlatformException {
  constructor(
    message: string,
    public readonly cacheKey?: string,
    public readonly operation?: 'get' | 'set' | 'delete' | 'clear',
    public readonly cacheSize?: number
  ) {
    super(
      message,
      'CACHE_ERROR',
      { cacheKey, operation, cacheSize },
      { type: 'cache' }
    );
  }
}

/**
 * Visualization exception
 */
export class VisualizationException extends PlatformException {
  constructor(
    message: string,
    public readonly chartType?: string,
    public readonly dataPoints?: number,
    public readonly renderTarget?: string
  ) {
    super(
      message,
      'VISUALIZATION_ERROR',
      { chartType, dataPoints, renderTarget },
      { phase: 'visualization' }
    );
  }
}

/**
 * Authentication exception
 */
export class AuthenticationException extends PlatformException {
  constructor(
    message: string,
    public readonly authMethod?: string,
    public readonly username?: string,
    public readonly realm?: string
  ) {
    super(
      message,
      'AUTHENTICATION_ERROR',
      { authMethod, username, realm },
      { type: 'security' }
    );
  }
}

/**
 * Authorization exception
 */
export class AuthorizationException extends PlatformException {
  constructor(
    message: string,
    public readonly resource?: string,
    public readonly action?: string,
    public readonly requiredPermissions?: string[],
    public readonly actualPermissions?: string[]
  ) {
    super(
      message,
      'AUTHORIZATION_ERROR',
      { resource, action, requiredPermissions, actualPermissions },
      { type: 'security' }
    );
  }
}

/**
 * Timeout exception
 */
export class TimeoutException extends PlatformException {
  constructor(
    message: string,
    public readonly operation?: string,
    public readonly timeoutMs?: number,
    public readonly elapsedMs?: number
  ) {
    super(
      message,
      'TIMEOUT_ERROR',
      { operation, timeoutMs, elapsedMs },
      { type: 'timeout' }
    );
  }
}

/**
 * Not found exception
 */
export class NotFoundException extends PlatformException {
  constructor(
    message: string,
    public readonly resourceType?: string,
    public readonly resourceId?: string,
    public readonly searchCriteria?: Record<string, unknown>
  ) {
    super(
      message,
      'NOT_FOUND_ERROR',
      { resourceType, resourceId, searchCriteria },
      { type: 'notfound' }
    );
  }
}

/**
 * Already exists exception
 */
export class AlreadyExistsException extends PlatformException {
  constructor(
    message: string,
    public readonly resourceType?: string,
    public readonly resourceId?: string,
    public readonly existingResource?: unknown
  ) {
    super(
      message,
      'ALREADY_EXISTS_ERROR',
      { resourceType, resourceId, existingResource },
      { type: 'conflict' }
    );
  }
}

/**
 * Invalid operation exception
 */
export class InvalidOperationException extends PlatformException {
  constructor(
    message: string,
    public readonly operation?: string,
    public readonly currentState?: string,
    public readonly allowedStates?: string[]
  ) {
    super(
      message,
      'INVALID_OPERATION_ERROR',
      { operation, currentState, allowedStates },
      { type: 'operation' }
    );
  }
}

/**
 * Exception handler utility
 */
export class ExceptionHandler {
  private static handlers: Map<string, (error: PlatformException) => void> = new Map();

  public static register(code: string, handler: (error: PlatformException) => void): void {
    this.handlers.set(code, handler);
  }

  public static handle(error: PlatformException): void {
    const handler = this.handlers.get(error.code);
    if (handler) {
      handler(error);
    } else {
      console.error('Unhandled exception:', error.toJSON());
    }
  }

  public static async handleAsync(
    fn: () => Promise<unknown>,
    fallback?: unknown
  ): Promise<unknown> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PlatformException) {
        this.handle(error);
      } else {
        console.error('Unexpected error:', error);
      }
      return fallback;
    }
  }

  public static wrap<T extends (...args: any[]) => any>(
    fn: T,
    errorTransform?: (error: unknown) => PlatformException
  ): T {
    return ((...args: Parameters<T>) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result.catch((error) => {
            const platformError = errorTransform
              ? errorTransform(error)
              : error instanceof PlatformException
              ? error
              : new PlatformException(
                  error?.message || 'Unknown error',
                  'UNKNOWN_ERROR',
                  error
                );
            this.handle(platformError);
            throw platformError;
          });
        }
        return result;
      } catch (error) {
        const platformError = errorTransform
          ? errorTransform(error)
          : error instanceof PlatformException
          ? error
          : new PlatformException(
              error?.message || 'Unknown error',
              'UNKNOWN_ERROR',
              error
            );
        this.handle(platformError);
        throw platformError;
      }
    }) as T;
  }
}

/**
 * Type guard for platform exceptions
 */
export function isPlatformException(error: unknown): error is PlatformException {
  return error instanceof PlatformException;
}

/**
 * Type guard for specific exception types
 */
export function isValidationException(error: unknown): error is ValidationException {
  return error instanceof ValidationException;
}

export function isConfigurationException(error: unknown): error is ConfigurationException {
  return error instanceof ConfigurationException;
}

export function isDataIngestionException(error: unknown): error is DataIngestionException {
  return error instanceof DataIngestionException;
}

export function isProcessingException(error: unknown): error is ProcessingException {
  return error instanceof ProcessingException;
}

export function isConnectionException(error: unknown): error is ConnectionException {
  return error instanceof ConnectionException;
}

/**
 * Create typed exception factory
 */
export function createExceptionFactory<T extends PlatformException>(
  ExceptionClass: new (...args: any[]) => T
) {
  return (...args: ConstructorParameters<typeof ExceptionClass>): T => {
    return new ExceptionClass(...args);
  };
}