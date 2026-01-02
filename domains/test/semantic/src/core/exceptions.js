// core/exceptions.js
/**
 * Custom exceptions for the analytics platform.
 * 
 * This module defines all custom exceptions used throughout the platform
 * to provide clear error handling and debugging information.
 */

/**
 * Base exception for all platform-specific errors
 */
export class PlatformError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = this.constructor.name;
        this.details = details;
        this.timestamp = new Date();
        
        // Maintains proper stack trace for where error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    toString() {
        if (Object.keys(this.details).length > 0) {
            return `${this.message} - Details: ${JSON.stringify(this.details)}`;
        }
        return this.message;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            details: this.details,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}

/**
 * Raised when configuration is invalid or missing
 */
export class ConfigurationError extends PlatformError {
    constructor(message, configKey = null) {
        const details = configKey ? { configKey } : {};
        super(message, details);
    }
}

/**
 * Raised when data validation fails
 */
export class ValidationError extends PlatformError {
    constructor(message, field = null, value = null) {
        const details = {};
        if (field) details.field = field;
        if (value !== null && value !== undefined) details.value = value;
        super(message, details);
    }
}

/**
 * Raised when data ingestion fails
 */
export class DataIngestionError extends PlatformError {
    constructor(message, source = null, format = null) {
        const details = {};
        if (source) details.source = source;
        if (format) details.format = format;
        super(message, details);
    }
}

/**
 * Raised when data processing fails
 */
export class ProcessingError extends PlatformError {
    constructor(message, processor = null, stage = null) {
        const details = {};
        if (processor) details.processor = processor;
        if (stage) details.stage = stage;
        super(message, details);
    }
}

/**
 * Raised when data transformation fails
 */
export class TransformationError extends ProcessingError {
    constructor(message, transformer = null, inputType = null, outputType = null) {
        super(message, transformer);
        if (inputType) this.details.inputType = inputType;
        if (outputType) this.details.outputType = outputType;
    }
}

/**
 * Raised when pipeline execution fails
 */
export class PipelineError extends PlatformError {
    constructor(message, pipelineName = null, step = null, stepName = null) {
        const details = {};
        if (pipelineName) details.pipeline = pipelineName;
        if (step !== null && step !== undefined) details.stepNumber = step;
        if (stepName) details.stepName = stepName;
        super(message, details);
    }
}

/**
 * Raised when cache operations fail
 */
export class CacheError extends PlatformError {
    constructor(message, key = null, operation = null) {
        const details = {};
        if (key) details.key = key;
        if (operation) details.operation = operation;
        super(message, details);
    }
}

/**
 * Raised when visualization generation fails
 */
export class VisualizationError extends PlatformError {
    constructor(message, chartType = null, exportFormat = null) {
        const details = {};
        if (chartType) details.chartType = chartType;
        if (exportFormat) details.exportFormat = exportFormat;
        super(message, details);
    }
}

/**
 * Raised when schema validation or operations fail
 */
export class SchemaError extends ValidationError {
    constructor(message, schemaName = null, expectedType = null, actualType = null) {
        super(message);
        if (schemaName) this.details.schema = schemaName;
        if (expectedType) this.details.expectedType = expectedType;
        if (actualType) this.details.actualType = actualType;
    }
}

/**
 * Raised when connection to data source fails
 */
export class ConnectionError extends DataIngestionError {
    constructor(message, host = null, port = null, protocol = null) {
        super(message);
        if (host) this.details.host = host;
        if (port) this.details.port = port;
        if (protocol) this.details.protocol = protocol;
    }
}

/**
 * Raised when an operation times out
 */
export class TimeoutError extends PlatformError {
    constructor(message, operation = null, timeoutSeconds = null) {
        const details = {};
        if (operation) details.operation = operation;
        if (timeoutSeconds) details.timeoutSeconds = timeoutSeconds;
        super(message, details);
    }
}

/**
 * Raised when resource limits are exceeded
 */
export class ResourceError extends PlatformError {
    constructor(message, resourceType = null, limit = null, current = null) {
        const details = {};
        if (resourceType) details.resourceType = resourceType;
        if (limit !== null && limit !== undefined) details.limit = limit;
        if (current !== null && current !== undefined) details.current = current;
        super(message, details);
    }
}

/**
 * Decorator/wrapper to handle platform errors gracefully
 * Note: This is a function wrapper since JavaScript doesn't have native decorators
 */
export function handlePlatformError(fn) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            if (error instanceof PlatformError) {
                // Log the platform error with details
                console.error(`Platform error in ${fn.name}: ${error}`);
                throw error;
            } else {
                // Wrap unexpected errors in PlatformError
                console.error(`Unexpected error in ${fn.name}: ${error}`);
                throw new PlatformError(
                    `Unexpected error in ${fn.name}: ${error.message}`
                );
            }
        }
    };
}

/**
 * Error handler middleware for Express routes
 */
export function errorMiddleware(err, req, res, next) {
    if (err instanceof PlatformError) {
        res.status(400).json({
            error: err.name,
            message: err.message,
            details: err.details,
            timestamp: err.timestamp
        });
    } else {
        console.error('Unhandled error:', err);
        res.status(500).json({
            error: 'InternalServerError',
            message: 'An unexpected error occurred',
            timestamp: new Date()
        });
    }
}

/**
 * Utility function to wrap async functions with error handling
 */
export function withErrorHandling(fn, errorHandler = null) {
    return async function(...args) {
        try {
            return await fn(...args);
        } catch (error) {
            if (errorHandler) {
                return errorHandler(error);
            }
            throw error;
        }
    };
}

/**
 * Create a custom error class
 */
export function createErrorClass(name, ParentClass = PlatformError) {
    const CustomError = class extends ParentClass {
        constructor(...args) {
            super(...args);
            this.name = name;
        }
    };
    
    Object.defineProperty(CustomError, 'name', { value: name });
    return CustomError;
}