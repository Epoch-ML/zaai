// processing/processor.js
/**
 * Main data processor for the processing module.
 * 
 * This module provides the core data processing functionality,
 * including batch processing, streaming, and parallel processing.
 */

import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { BaseProcessor, Status } from '../core/base.js';
import { ProcessingError, ResourceError } from '../core/exceptions.js';
import { ProcessingConfig } from '../core/config.js';

/**
 * Processing result
 */
export class ProcessingResult {
    constructor() {
        this.status = Status.PENDING;
        this.inputRecords = 0;
        this.outputRecords = 0;
        this.skippedRecords = 0;
        this.errorRecords = 0;
        this.transformations = [];
        this.aggregations = {};
        this.startTime = null;
        this.endTime = null;
        this.elapsedTime = 0;
        this.memoryUsed = 0;
        this.cpuTime = 0;
    }

    start() {
        this.status = Status.RUNNING;
        this.startTime = new Date();
        this.initialMemory = process.memoryUsage().heapUsed;
    }

    complete() {
        this.status = Status.COMPLETED;
        this.endTime = new Date();
        this.elapsedTime = (this.endTime - this.startTime) / 1000;
        this.memoryUsed = process.memoryUsage().heapUsed - this.initialMemory;
    }

    fail(error) {
        this.status = Status.FAILED;
        this.endTime = new Date();
        this.elapsedTime = this.endTime ? (this.endTime - this.startTime) / 1000 : 0;
        this.error = error.message || error;
    }

    addTransformation(name, recordsAffected) {
        this.transformations.push({
            name,
            recordsAffected,
            timestamp: new Date()
        });
    }

    addAggregation(name, value) {
        this.aggregations[name] = value;
    }

    get processingRate() {
        return this.elapsedTime > 0 ? this.inputRecords / this.elapsedTime : 0;
    }

    toJSON() {
        return {
            status: this.status,
            inputRecords: this.inputRecords,
            outputRecords: this.outputRecords,
            skippedRecords: this.skippedRecords,
            errorRecords: this.errorRecords,
            processingRate: this.processingRate.toFixed(2) + ' records/sec',
            transformations: this.transformations,
            aggregations: this.aggregations,
            elapsedTime: this.elapsedTime,
            memoryUsedMB: (this.memoryUsed / 1024 / 1024).toFixed(2),
            error: this.error
        };
    }
}

/**
 * Main data processor
 */
export class DataProcessor extends BaseProcessor {
    constructor(config = {}) {
        super(config);
        this.config = new ProcessingConfig(config);
        this.transformers = [];
        this.aggregators = [];
        this.filters = [];
        this.cache = null;
        this.workers = [];
        this.eventEmitter = new EventEmitter();
    }

    /**
     * Add a transformer to the processing pipeline
     */
    addTransformer(transformer) {
        this.transformers.push(transformer);
        return this;
    }

    /**
     * Add an aggregator to the processing pipeline
     */
    addAggregator(aggregator) {
        this.aggregators.push(aggregator);
        return this;
    }

    /**
     * Add a filter to the processing pipeline
     */
    addFilter(filter) {
        this.filters.push(filter);
        return this;
    }

    /**
     * Set cache for processing
     */
    setCache(cache) {
        this.cache = cache;
        return this;
    }

    /**
     * Process data
     */
    async process(inputData) {
        const result = new ProcessingResult();
        result.start();
        this.setStatus(Status.RUNNING);

        try {
            // Validate input
            if (!inputData || (Array.isArray(inputData) && inputData.length === 0)) {
                throw new ProcessingError('No input data provided');
            }

            // Convert to array if needed
            const data = Array.isArray(inputData) ? inputData : [inputData];
            result.inputRecords = data.length;

            // Check memory limit
            this._checkMemoryLimit();

            // Process in batches
            const batchSize = this.config.batchSize;
            const processedData = [];

            for (let i = 0; i < data.length; i += batchSize) {
                const batch = data.slice(i, i + batchSize);
                const processed = await this._processBatch(batch, result);
                processedData.push(...processed);

                // Emit progress
                const progress = ((i + batch.length) / data.length) * 100;
                this.eventEmitter.emit('progress', { progress, processed: i + batch.length, total: data.length });
            }

            result.outputRecords = processedData.length;
            result.complete();
            this.setStatus(Status.COMPLETED);

            return processedData;

        } catch (error) {
            result.fail(error);
            this.setStatus(Status.FAILED);
            throw error;
        }
    }

    /**
     * Process a batch of records
     */
    async _processBatch(batch, result) {
        const processed = [];

        for (const record of batch) {
            try {
                // Apply filters
                let filtered = false;
                for (const filter of this.filters) {
                    if (!await filter.evaluate(record)) {
                        filtered = true;
                        break;
                    }
                }

                if (filtered) {
                    result.skippedRecords++;
                    continue;
                }

                // Apply transformations
                let transformedRecord = record;
                for (const transformer of this.transformers) {
                    transformedRecord = await transformer.transform(transformedRecord);
                }

                // Apply aggregations
                for (const aggregator of this.aggregators) {
                    await aggregator.add(transformedRecord);
                }

                processed.push(transformedRecord);

            } catch (error) {
                result.errorRecords++;
                this.logger.error(`Error processing record: ${error.message}`);
                
                if (this.config.stopOnError) {
                    throw error;
                }
            }
        }

        return processed;
    }

    /**
     * Check memory usage against limit
     */
    _checkMemoryLimit() {
        const memoryUsage = process.memoryUsage();
        const usedMB = memoryUsage.heapUsed / 1024 / 1024;
        
        if (usedMB > this.config.memoryLimitMB) {
            throw new ResourceError(
                `Memory limit exceeded: ${usedMB.toFixed(2)}MB > ${this.config.memoryLimitMB}MB`,
                'memory',
                this.config.memoryLimitMB,
                usedMB
            );
        }
    }

    /**
     * Get processor capabilities
     */
    getCapabilities() {
        return [
            'batch-processing',
            'stream-processing',
            'parallel-processing',
            'filtering',
            'transformation',
            'aggregation',
            'caching'
        ];
    }
}

/**
 * Parallel processor using worker threads
 */
export class ParallelProcessor extends DataProcessor {
    constructor(config = {}) {
        super(config);
        this.numWorkers = config.maxWorkers || 4;
        this.workerPool = [];
        this.taskQueue = [];
        this.activeWorkers = 0;
    }

    /**
     * Initialize worker pool
     */
    async initializeWorkers() {
        for (let i = 0; i < this.numWorkers; i++) {
            const worker = await this._createWorker();
            this.workerPool.push(worker);
        }
    }

    /**
     * Create a worker thread
     */
    async _createWorker() {
        // In production, would create actual Worker thread
        // For now, return mock worker
        return {
            id: Math.random().toString(36).substr(2, 9),
            busy: false,
            process: async (data) => {
                // Simulate processing
                await new Promise(resolve => setTimeout(resolve, 10));
                return data;
            }
        };
    }

    /**
     * Process data in parallel
     */
    async process(inputData) {
        await this.initializeWorkers();
        
        const result = new ProcessingResult();
        result.start();
        this.setStatus(Status.RUNNING);

        try {
            const data = Array.isArray(inputData) ? inputData : [inputData];
            result.inputRecords = data.length;

            // Split data into chunks for workers
            const chunks = this._splitIntoChunks(data, this.numWorkers);
            const promises = chunks.map(chunk => this._processChunkWithWorker(chunk, result));
            
            const processedChunks = await Promise.all(promises);
            const processedData = processedChunks.flat();

            result.outputRecords = processedData.length;
            result.complete();
            this.setStatus(Status.COMPLETED);

            return processedData;

        } catch (error) {
            result.fail(error);
            this.setStatus(Status.FAILED);
            throw error;
        } finally {
            await this.cleanupWorkers();
        }
    }

    /**
     * Process a chunk with a worker
     */
    async _processChunkWithWorker(chunk, result) {
        const worker = await this._getAvailableWorker();
        worker.busy = true;
        this.activeWorkers++;

        try {
            const processed = await worker.process(chunk);
            return processed;
        } finally {
            worker.busy = false;
            this.activeWorkers--;
        }
    }

    /**
     * Get an available worker
     */
    async _getAvailableWorker() {
        while (true) {
            for (const worker of this.workerPool) {
                if (!worker.busy) {
                    return worker;
                }
            }
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    /**
     * Split data into chunks
     */
    _splitIntoChunks(data, numChunks) {
        const chunks = [];
        const chunkSize = Math.ceil(data.length / numChunks);
        
        for (let i = 0; i < data.length; i += chunkSize) {
            chunks.push(data.slice(i, i + chunkSize));
        }
        
        return chunks;
    }

    /**
     * Clean up worker threads
     */
    async cleanupWorkers() {
        // In production, would terminate actual worker threads
        this.workerPool = [];
    }
}

/**
 * Stream processor for continuous data processing
 */
export class StreamProcessor extends DataProcessor {
    constructor(config = {}) {
        super(config);
        this.bufferSize = config.bufferSize || 100;
        this.flushInterval = config.flushInterval || 5000;
        this.buffer = [];
        this.flushTimer = null;
    }

    /**
     * Process a single record in streaming fashion
     */
    async processRecord(record) {
        this.buffer.push(record);

        if (this.buffer.length >= this.bufferSize) {
            await this.flush();
        }

        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
        }
    }

    /**
     * Flush the buffer
     */
    async flush() {
        if (this.buffer.length === 0) {
            return;
        }

        const batch = [...this.buffer];
        this.buffer = [];

        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        const result = new ProcessingResult();
        result.start();
        
        try {
            const processed = await this._processBatch(batch, result);
            result.outputRecords = processed.length;
            result.complete();
            
            this.eventEmitter.emit('batchProcessed', processed);
            return processed;
        } catch (error) {
            result.fail(error);
            this.eventEmitter.emit('processingError', error);
            throw error;
        }
    }

    /**
     * Stop the stream processor
     */
    async stop() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        if (this.buffer.length > 0) {
            await this.flush();
        }

        this.setStatus(Status.COMPLETED);
    }
}