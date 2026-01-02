// core/base.js
/**
 * Base classes and interfaces for the analytics platform.
 * 
 * This module provides abstract base classes and common interfaces
 * that are used throughout the platform to ensure consistency.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

// Status enumeration for operations
export const Status = Object.freeze({
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
});

// Supported data formats
export const DataFormat = Object.freeze({
    JSON: 'json',
    CSV: 'csv',
    PARQUET: 'parquet',
    XML: 'xml',
    EXCEL: 'excel',
    TEXT: 'text',
    BINARY: 'binary'
});

/**
 * Common metadata for all platform objects
 */
export class Metadata {
    constructor(name = '', description = '') {
        this.id = crypto.randomUUID();
        this.name = name;
        this.description = description;
        this.createdAt = new Date();
        this.updatedAt = new Date();
        this.tags = [];
        this.properties = {};
    }

    updateTimestamp() {
        this.updatedAt = new Date();
    }

    addTag(tag) {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
            this.updateTimestamp();
        }
    }

    setProperty(key, value) {
        this.properties[key] = value;
        this.updateTimestamp();
    }
}

/**
 * Abstract base class for all platform components
 */
export class BaseComponent extends EventEmitter {
    constructor(metadata = null) {
        super();
        this.metadata = metadata || new Metadata();
        this.logger = console; // In production, use a proper logger
        this._initialized = false;
    }

    /**
     * Initialize the component
     * @abstract
     */
    async initialize() {
        throw new Error('Method initialize() must be implemented');
    }

    /**
     * Validate component configuration
     * @abstract
     * @returns {boolean} True if component is valid
     */
    validate() {
        throw new Error('Method validate() must be implemented');
    }

    /**
     * Cleanup resources used by the component
     * @abstract
     */
    async cleanup() {
        throw new Error('Method cleanup() must be implemented');
    }

    /**
     * Use component as async context manager
     */
    async withContext(callback) {
        try {
            if (!this._initialized) {
                await this.initialize();
                this._initialized = true;
            }
            return await callback(this);
        } finally {
            await this.cleanup();
            this._initialized = false;
        }
    }
}

/**
 * Abstract container for data
 */
export class DataContainer {
    constructor(data = null) {
        this._data = data;
        this._metadata = new Metadata();
    }

    /**
     * Apply a transformation to the data
     * @abstract
     */
    async transform(transformer) {
        throw new Error('Method transform() must be implemented');
    }

    /**
     * Validate data against expected schema
     * @abstract
     */
    validateSchema() {
        throw new Error('Method validateSchema() must be implemented');
    }

    get data() {
        return this._data;
    }

    set data(value) {
        this._data = value;
        this._metadata.updateTimestamp();
    }

    get metadata() {
        return this._metadata;
    }

    isEmpty() {
        return this._data === null || this._data === undefined;
    }
}

/**
 * Abstract base class for data transformers
 */
export class BaseTransformer {
    constructor(name = '') {
        this.name = name || this.constructor.name;
        this.logger = console;
    }

    /**
     * Transform input data
     * @abstract
     */
    async transform(data) {
        throw new Error('Method transform() must be implemented');
    }

    /**
     * Check if transformer can handle the data
     * @abstract
     */
    canTransform(data) {
        throw new Error('Method canTransform() must be implemented');
    }

    /**
     * Make transformer callable as a function
     */
    async apply(data) {
        if (!this.canTransform(data)) {
            throw new Error(`${this.name} cannot transform data of type ${typeof data}`);
        }
        return await this.transform(data);
    }
}

/**
 * Abstract base class for data processors
 */
export class BaseProcessor {
    constructor(config = {}) {
        this.config = config;
        this.logger = console;
        this._status = Status.PENDING;
        this._metrics = {};
    }

    /**
     * Process input data
     * @abstract
     */
    async process(inputData) {
        throw new Error('Method process() must be implemented');
    }

    /**
     * Get list of processor capabilities
     * @abstract
     */
    getCapabilities() {
        throw new Error('Method getCapabilities() must be implemented');
    }

    get status() {
        return this._status;
    }

    setStatus(status) {
        this._status = status;
        this.logger.debug(`Status changed to ${status}`);
    }

    getMetrics() {
        return { ...this._metrics };
    }

    recordMetric(key, value) {
        this._metrics[key] = value;
    }
}

/**
 * Mixin for observable objects with event support
 */
export class Observable {
    constructor() {
        this._observers = new Map();
    }

    subscribe(event, callback) {
        if (!this._observers.has(event)) {
            this._observers.set(event, []);
        }
        this._observers.get(event).push(callback);
    }

    unsubscribe(event, callback) {
        if (this._observers.has(event)) {
            const callbacks = this._observers.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    notify(event, ...args) {
        if (this._observers.has(event)) {
            const callbacks = this._observers.get(event);
            callbacks.forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in observer callback: ${error}`);
                }
            });
        }
    }
}

/**
 * Utility function to create a class with multiple mixins
 */
export function withMixins(BaseClass, ...mixins) {
    class Mixed extends BaseClass {}
    
    for (const mixin of mixins) {
        for (const prop of Object.getOwnPropertyNames(mixin.prototype)) {
            if (prop !== 'constructor') {
                Mixed.prototype[prop] = mixin.prototype[prop];
            }
        }
    }
    
    return Mixed;
}