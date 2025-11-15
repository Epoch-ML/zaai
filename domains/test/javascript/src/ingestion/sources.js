// ingestion/sources.js
/**
 * Data source definitions for the ingestion module.
 * 
 * This module defines various data sources that can be ingested
 * by the platform, including files, databases, and APIs.
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { BaseComponent, Metadata, DataFormat } from '../core/base.js';
import { DataIngestionError, ConnectionError } from '../core/exceptions.js';
import { IngestionConfig } from '../core/config.js';

// Types of data sources
export const SourceType = Object.freeze({
    FILE: 'file',
    DATABASE: 'database',
    API: 'api',
    STREAM: 'stream',
    MEMORY: 'memory'
});

/**
 * Credentials for data source access
 */
export class SourceCredentials {
    constructor(options = {}) {
        this.username = options.username || null;
        this.password = options.password || null;
        this.apiKey = options.apiKey || null;
        this.token = options.token || null;
        this.host = options.host || null;
        this.port = options.port || null;
        this.database = options.database || null;
        this.extra = options.extra || {};
    }

    maskSensitive() {
        const masked = {};
        
        if (this.username) masked.username = this.username;
        if (this.password) masked.password = '***';
        if (this.apiKey) {
            masked.apiKey = this.apiKey.length > 8 
                ? `${this.apiKey.slice(0, 4)}...${this.apiKey.slice(-4)}`
                : '***';
        }
        if (this.token) masked.token = '***';
        if (this.host) masked.host = this.host;
        if (this.port) masked.port = this.port;
        if (this.database) masked.database = this.database;
        
        return masked;
    }
}

/**
 * Abstract base class for data sources
 */
export class DataSource extends BaseComponent {
    constructor(name, sourceType, config = null, credentials = null) {
        const metadata = new Metadata(name, `${sourceType} data source`);
        super(metadata);
        
        this.sourceType = sourceType;
        this.config = config || new IngestionConfig();
        this.credentials = credentials;
        this._connected = false;
    }

    async connect() {
        throw new Error('Method connect() must be implemented');
    }

    async disconnect() {
        throw new Error('Method disconnect() must be implemented');
    }

    async *read(options = {}) {
        throw new Error('Method read() must be implemented');
    }

    async getSchema() {
        throw new Error('Method getSchema() must be implemented');
    }

    async initialize() {
        await this.connect();
    }

    async cleanup() {
        if (this._connected) {
            await this.disconnect();
        }
    }

    validate() {
        return this.config.validate();
    }

    isConnected() {
        return this._connected;
    }
}

/**
 * Data source for file-based data
 */
export class FileSource extends DataSource {
    constructor(filePath, format = null, config = null) {
        const resolvedPath = path.resolve(filePath);
        
        // Auto-detect format from extension if not provided
        if (!format) {
            const ext = path.extname(resolvedPath).toLowerCase().slice(1);
            format = DataFormat[ext.toUpperCase()] || DataFormat.TEXT;
        }
        
        super(
            `file:${path.basename(resolvedPath)}`,
            SourceType.FILE,
            config
        );
        
        this.filePath = resolvedPath;
        this.format = format;
    }

    async connect() {
        if (!fs.existsSync(this.filePath)) {
            throw new ConnectionError(`File not found: ${this.filePath}`);
        }

        const stats = fs.statSync(this.filePath);
        
        if (!stats.isFile()) {
            throw new ConnectionError(`Path is not a file: ${this.filePath}`);
        }

        // Check file size
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB > this.config.maxFileSizeMB) {
            throw new ConnectionError(
                `File size ${sizeMB.toFixed(2)}MB exceeds maximum ${this.config.maxFileSizeMB}MB`
            );
        }

        this._connected = true;
        this.logger.info(`Connected to file source: ${this.filePath}`);
    }

    async disconnect() {
        this._connected = false;
        this.logger.debug(`Disconnected from file source: ${this.filePath}`);
    }

    async *read(options = {}) {
        if (!this._connected) {
            throw new DataIngestionError('Source not connected', this.filePath);
        }

        // Import parser for the file format
        const { getParser } = await import('./parsers.js');
        const parser = getParser(this.format);
        
        const fileStream = fs.createReadStream(this.filePath, {
            encoding: this.config.encoding
        });
        
        for await (const record of parser.parse(fileStream, this.config)) {
            yield record;
        }
    }

    async getSchema() {
        // Import schema detector
        const { detectSchema } = await import('./schema.js');
        
        // Read sample of data to detect schema
        const sample = [];
        let count = 0;
        
        for await (const record of this.read()) {
            sample.push(record);
            if (++count >= 100) break; // Sample first 100 records
        }
        
        return detectSchema(sample);
    }
}

/**
 * Data source for database connections
 */
export class DatabaseSource extends DataSource {
    constructor(connectionString, query = null, table = null, config = null, credentials = null) {
        super(
            `db:${table || 'query'}`,
            SourceType.DATABASE,
            config,
            credentials
        );
        
        this.connectionString = connectionString;
        this.query = query;
        this.table = table;
        this.connection = null;
    }

    async connect() {
        try {
            this.logger.info(`Connecting to database: ${this.connectionString}`);
            
            // Mock connection (in production, would use actual database driver)
            this.connection = {
                string: this.connectionString,
                credentials: this.credentials?.maskSensitive() || {}
            };
            
            this._connected = true;
            this.logger.info('Database connection established');
            
        } catch (error) {
            throw new ConnectionError(
                `Failed to connect to database: ${error.message}`,
                this.credentials?.host
            );
        }
    }

    async disconnect() {
        if (this.connection) {
            this.logger.info('Closing database connection');
            this.connection = null;
            this._connected = false;
        }
    }

    async *read(options = {}) {
        if (!this._connected) {
            throw new DataIngestionError('Database not connected');
        }

        // Simplified read logic (in production, would execute actual SQL query)
        if (this.query) {
            this.logger.info(`Executing query: ${this.query.substring(0, 100)}...`);
        } else if (this.table) {
            this.logger.info(`Reading from table: ${this.table}`);
        }

        // Mock data generation
        for (let i = 0; i < 10; i++) {
            yield {
                id: i,
                value: `data_${i}`,
                source: 'database'
            };
        }
    }

    async getSchema() {
        if (!this._connected) {
            throw new DataIngestionError('Database not connected');
        }

        // Mock schema
        return {
            fields: [
                { name: 'id', type: 'integer', nullable: false },
                { name: 'value', type: 'string', nullable: true },
                { name: 'source', type: 'string', nullable: true }
            ],
            primaryKey: ['id']
        };
    }
}

/**
 * Data source for API endpoints
 */
export class APISource extends DataSource {
    constructor(endpoint, method = 'GET', headers = null, params = null, config = null, credentials = null) {
        super(
            `api:${endpoint}`,
            SourceType.API,
            config,
            credentials
        );
        
        this.endpoint = endpoint;
        this.method = method.toUpperCase();
        this.headers = headers || {};
        this.params = params || {};
    }

    async connect() {
        // Add authentication headers if credentials provided
        if (this.credentials) {
            if (this.credentials.apiKey) {
                this.headers['X-API-Key'] = this.credentials.apiKey;
            } else if (this.credentials.token) {
                this.headers['Authorization'] = `Bearer ${this.credentials.token}`;
            }
        }

        // Test connection with a simple request
        try {
            this.logger.info(`Testing API connection to ${this.endpoint}`);
            // In production, would make actual HTTP request
            this._connected = true;
            this.logger.info('API connection established');
        } catch (error) {
            throw new ConnectionError(`Failed to connect to API: ${error.message}`, this.endpoint);
        }
    }

    async disconnect() {
        this._connected = false;
        this.logger.debug(`Disconnected from API: ${this.endpoint}`);
    }

    async *read(options = {}) {
        if (!this._connected) {
            throw new DataIngestionError('API not connected', this.endpoint);
        }

        // Mock API response (in production, would make actual HTTP requests with pagination)
        let page = 1;
        while (page <= 3) { // Mock 3 pages of data
            this.logger.debug(`Fetching page ${page} from API`);
            
            // Mock response data
            for (let i = 0; i < 5; i++) { // 5 records per page
                yield {
                    id: `api_${page}_${i}`,
                    data: `value_${page}_${i}`,
                    timestamp: new Date().toISOString()
                };
            }
            
            page++;
        }
    }

    async getSchema() {
        // Mock schema based on expected API response
        return {
            fields: [
                { name: 'id', type: 'string' },
                { name: 'data', type: 'string' },
                { name: 'timestamp', type: 'datetime' }
            ]
        };
    }
}

/**
 * Data source for streaming data
 */
export class StreamSource extends DataSource {
    constructor(streamUrl, protocol = 'websocket', config = null, credentials = null) {
        super(
            `stream:${streamUrl}`,
            SourceType.STREAM,
            config,
            credentials
        );
        
        this.streamUrl = streamUrl;
        this.protocol = protocol;
        this.stream = null;
    }

    async connect() {
        try {
            this.logger.info(`Connecting to stream: ${this.streamUrl}`);
            // In production, would establish actual stream connection
            this.stream = { url: this.streamUrl, protocol: this.protocol };
            this._connected = true;
            this.logger.info('Stream connection established');
        } catch (error) {
            throw new ConnectionError(`Failed to connect to stream: ${error.message}`, this.streamUrl);
        }
    }

    async disconnect() {
        if (this.stream) {
            this.logger.info('Closing stream connection');
            this.stream = null;
            this._connected = false;
        }
    }

    async *read(maxMessages = 100) {
        if (!this._connected) {
            throw new DataIngestionError('Stream not connected', this.streamUrl);
        }

        // Mock streaming data
        for (let i = 0; i < maxMessages; i++) {
            yield {
                messageId: i,
                content: `stream_message_${i}`,
                timestamp: new Date().toISOString()
            };
            
            // Simulate real-time streaming with small delay
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async getSchema() {
        return {
            fields: [
                { name: 'messageId', type: 'integer' },
                { name: 'content', type: 'string' },
                { name: 'timestamp', type: 'datetime' }
            ]
        };
    }
}

/**
 * Data source for in-memory data
 */
export class MemorySource extends DataSource {
    constructor(data, name = 'memory', config = null) {
        super(name, SourceType.MEMORY, config);
        this.data = data;
    }

    async connect() {
        if (!this.data) {
            throw new ConnectionError('No data provided for memory source');
        }
        this._connected = true;
        this.logger.info('Memory source connected');
    }

    async disconnect() {
        this._connected = false;
        this.logger.info('Memory source disconnected');
    }

    async *read() {
        if (!this._connected) {
            throw new DataIngestionError('Memory source not connected');
        }

        if (Array.isArray(this.data)) {
            for (const record of this.data) {
                yield record;
            }
        } else if (typeof this.data === 'object') {
            yield this.data;
        } else {
            yield { value: this.data };
        }
    }

    async getSchema() {
        const { detectSchema } = await import('./schema.js');
        const sample = Array.isArray(this.data) ? this.data.slice(0, 100) : [this.data];
        return detectSchema(sample);
    }
}