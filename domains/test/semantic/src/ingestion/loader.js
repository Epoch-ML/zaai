// ingestion/loader.js
/**
 * Data loader orchestration for the ingestion module.
 * 
 * This module provides the main data loading functionality,
 * coordinating sources, connectors, parsers, and schema validation.
 */

import { EventEmitter } from 'events';
import path from 'path';
import { Status } from '../core/base.js';
import { DataIngestionError, ValidationError } from '../core/exceptions.js';
import { FileSource, DatabaseSource, APISource, MemorySource } from './sources.js';
import { getParser, detectFormat } from './parsers.js';
import { detectSchema, validateSchema } from './schema.js';

/**
 * Result of a data loading operation
 */
export class LoadResult {
    constructor() {
        this.status = Status.PENDING;
        this.recordsLoaded = 0;
        this.recordsFailed = 0;
        this.errors = [];
        this.warnings = [];
        this.startTime = null;
        this.endTime = null;
        this.elapsedTime = 0;
        this.metadata = {};
    }

    start() {
        this.status = Status.RUNNING;
        this.startTime = new Date();
    }

    complete() {
        this.status = Status.COMPLETED;
        this.endTime = new Date();
        this.elapsedTime = (this.endTime - this.startTime) / 1000;
    }

    fail(error) {
        this.status = Status.FAILED;
        this.endTime = new Date();
        this.elapsedTime = (this.endTime - this.startTime) / 1000;
        this.errors.push(error.message || error);
    }

    addRecord(success = true) {
        if (success) {
            this.recordsLoaded++;
        } else {
            this.recordsFailed++;
        }
    }

    addError(error) {
        this.errors.push(error.message || error);
    }

    addWarning(warning) {
        this.warnings.push(warning);
    }

    get successRate() {
        const total = this.recordsLoaded + this.recordsFailed;
        return total > 0 ? (this.recordsLoaded / total) * 100 : 0;
    }

    toJSON() {
        return {
            status: this.status,
            recordsLoaded: this.recordsLoaded,
            recordsFailed: this.recordsFailed,
            successRate: this.successRate.toFixed(2) + '%',
            errors: this.errors.slice(0, 10), // Limit errors in output
            warnings: this.warnings.slice(0, 10),
            elapsedTime: this.elapsedTime,
            startTime: this.startTime,
            endTime: this.endTime,
            metadata: this.metadata
        };
    }
}

/**
 * Main data loader class
 */
export class DataLoader extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.connectors = new Map();
        this.sources = new Map();
        this.transformers = [];
        this.validators = [];
        this.batchSize = config.batchSize || 1000;
        this.validateData = config.validateSchema ?? true;
        this.detectSchemaAuto = config.detectSchema ?? true;
        this.logger = console;
    }

    /**
     * Register a connector
     */
    registerConnector(name, connector) {
        this.connectors.set(name, connector);
        this.logger.info(`Registered connector: ${name}`);
    }

    /**
     * Register a data source
     */
    registerSource(name, source) {
        this.sources.set(name, source);
        this.logger.info(`Registered source: ${name}`);
    }

    /**
     * Add a data transformer
     */
    addTransformer(transformer) {
        this.transformers.push(transformer);
    }

    /**
     * Add a data validator
     */
    addValidator(validator) {
        this.validators.push(validator);
    }

    /**
     * Load data from a file
     */
    async loadFile(filePath, format = null) {
        const result = new LoadResult();
        result.start();

        try {
            // Detect format if not provided
            if (!format) {
                format = detectFormat(filePath);
            }

            // Create file source
            const source = new FileSource(filePath, format, this.config);
            await source.connect();

            // Load data
            const data = await this._loadFromSource(source, result);

            // Detect schema if enabled
            if (this.detectSchemaAuto && data.length > 0) {
                const schema = detectSchema(data);
                result.metadata.detectedSchema = schema.toJSON();
                this.emit('schemaDetected', schema);
            }

            await source.disconnect();
            result.complete();

            this.emit('loadComplete', result);
            return result;

        } catch (error) {
            result.fail(error);
            this.emit('loadError', error);
            throw error;
        }
    }

    /**
     * Load data from a database
     */
    async loadDatabase(connectorName, query = null, table = null) {
        const result = new LoadResult();
        result.start();

        try {
            // Get connector
            const connector = this.connectors.get(connectorName);
            if (!connector) {
                throw new DataIngestionError(`Connector not found: ${connectorName}`);
            }

            // Initialize connector
            await connector.initialize();

            // Create database source
            const source = new DatabaseSource(
                connector.connectionString,
                query,
                table,
                this.config,
                connector.credentials
            );
            
            source.connection = connector._connection;
            source._connected = true;

            // Load data
            const data = await this._loadFromSource(source, result);

            // Get schema from database if available
            if (table) {
                const schema = await connector.getTableSchema(table);
                result.metadata.tableSchema = schema;
            }

            result.complete();
            this.emit('loadComplete', result);
            return result;

        } catch (error) {
            result.fail(error);
            this.emit('loadError', error);
            throw error;
        }
    }

    /**
     * Load data from an API
     */
    async loadAPI(endpoint, method = 'GET', options = {}) {
        const result = new LoadResult();
        result.start();

        try {
            // Create API source
            const source = new APISource(
                endpoint,
                method,
                options.headers,
                options.params,
                this.config,
                options.credentials
            );

            await source.connect();

            // Load data
            const data = await this._loadFromSource(source, result);

            await source.disconnect();
            result.complete();

            this.emit('loadComplete', result);
            return result;

        } catch (error) {
            result.fail(error);
            this.emit('loadError', error);
            throw error;
        }
    }

    /**
     * Load data from memory
     */
    async loadMemory(data, name = 'memory') {
        const result = new LoadResult();
        result.start();

        try {
            // Create memory source
            const source = new MemorySource(data, name, this.config);
            await source.connect();

            // Process data
            const processedData = await this._loadFromSource(source, result);

            await source.disconnect();
            result.complete();

            this.emit('loadComplete', result);
            return result;

        } catch (error) {
            result.fail(error);
            this.emit('loadError', error);
            throw error;
        }
    }

    /**
     * Internal method to load from a source
     */
    async _loadFromSource(source, result) {
        const data = [];
        const batch = [];

        try {
            for await (const record of source.read()) {
                // Apply transformers
                let transformedRecord = record;
                for (const transformer of this.transformers) {
                    transformedRecord = await transformer.transform(transformedRecord);
                }

                // Validate record
                if (this.validators.length > 0) {
                    let valid = true;
                    for (const validator of this.validators) {
                        if (!validator.validate(transformedRecord)) {
                            valid = false;
                            result.addError(`Validation failed: ${validator.getErrors().join(', ')}`);
                            break;
                        }
                    }
                    if (!valid) {
                        result.addRecord(false);
                        continue;
                    }
                }

                batch.push(transformedRecord);
                data.push(transformedRecord);
                
                // Process batch
                if (batch.length >= this.batchSize) {
                    await this._processBatch(batch, result);
                    batch.length = 0; // Clear batch
                }

                result.addRecord(true);
                this.emit('recordLoaded', transformedRecord);
            }

            // Process remaining batch
            if (batch.length > 0) {
                await this._processBatch(batch, result);
            }

        } catch (error) {
            result.addError(error);
            this.logger.error(`Error loading from source: ${error.message}`);
        }

        return data;
    }

    /**
     * Process a batch of records
     */
    async _processBatch(batch, result) {
        this.emit('batchReady', batch);
        
        // Here you would typically write to a database, file, or other destination
        this.logger.debug(`Processed batch of ${batch.length} records`);
        
        result.metadata.lastBatchSize = batch.length;
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        // Disconnect all sources
        for (const source of this.sources.values()) {
            try {
                await source.cleanup();
            } catch (error) {
                this.logger.error(`Error cleaning up source: ${error.message}`);
            }
        }

        // Cleanup all connectors
        for (const connector of this.connectors.values()) {
            try {
                await connector.cleanup();
            } catch (error) {
                this.logger.error(`Error cleaning up connector: ${error.message}`);
            }
        }
    }
}

/**
 * Batch loader for processing large datasets
 */
export class BatchLoader extends DataLoader {
    constructor(config = {}) {
        super(config);
        this.parallelBatches = config.parallelBatches || 1;
        this.retryAttempts = config.retryAttempts || 3;
        this.retryDelay = config.retryDelay || 1000;
    }

    /**
     * Process multiple batches in parallel
     */
    async _processBatch(batch, result) {
        const chunks = this._splitIntoChunks(batch, this.parallelBatches);
        const promises = chunks.map(chunk => this._processChunk(chunk, result));
        
        await Promise.all(promises);
    }

    /**
     * Process a single chunk with retry logic
     */
    async _processChunk(chunk, result) {
        let attempts = 0;
        
        while (attempts < this.retryAttempts) {
            try {
                // Process the chunk
                await this._doProcessChunk(chunk);
                return;
            } catch (error) {
                attempts++;
                
                if (attempts >= this.retryAttempts) {
                    result.addError(`Failed to process chunk after ${attempts} attempts: ${error.message}`);
                    throw error;
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                this.logger.warn(`Retrying chunk processing, attempt ${attempts + 1}`);
            }
        }
    }

    /**
     * Actually process the chunk (override in subclasses)
     */
    async _doProcessChunk(chunk) {
        this.emit('chunkProcessed', chunk);
        // Implement actual processing logic
    }

    /**
     * Split batch into chunks
     */
    _splitIntoChunks(batch, numChunks) {
        const chunks = [];
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
    constructor(config = {}) {
        super(config);
        this.windowSize = config.windowSize || 1000;
        this.windowDuration = config.windowDuration || 60000; // 1 minute
        this.windows = new Map();
    }

    /**
     * Process streaming data with windowing
     */
    async _processBatch(batch, result) {
        const now = Date.now();
        const windowKey = Math.floor(now / this.windowDuration);
        
        if (!this.windows.has(windowKey)) {
            this.windows.set(windowKey, []);
        }
        
        const window = this.windows.get(windowKey);
        window.push(...batch);
        
        // Process window if it's full
        if (window.length >= this.windowSize) {
            await this._processWindow(windowKey, window, result);
            this.windows.delete(windowKey);
        }
        
        // Clean up old windows
        this._cleanupWindows(now);
    }

    /**
     * Process a complete window
     */
    async _processWindow(windowKey, window, result) {
        this.emit('windowReady', { key: windowKey, data: window });
        this.logger.info(`Processing window ${windowKey} with ${window.length} records`);
    }

    /**
     * Clean up expired windows
     */
    _cleanupWindows(currentTime) {
        const expiredKey = Math.floor((currentTime - this.windowDuration * 2) / this.windowDuration);
        
        for (const [key, window] of this.windows) {
            if (key < expiredKey) {
                this.logger.warn(`Cleaning up expired window ${key} with ${window.length} unprocessed records`);
                this.windows.delete(key);
            }
        }
    }
}