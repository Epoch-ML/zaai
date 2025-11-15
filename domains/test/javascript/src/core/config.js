// core/config.js
/**
 * Configuration management for the analytics platform.
 * 
 * This module handles loading, validation, and management of platform
 * configuration from various sources.
 */

import fs from 'fs';
import path from 'path';
import { ConfigurationError } from './exceptions.js';

// Configuration source types
export const ConfigSource = Object.freeze({
    FILE: 'file',
    ENVIRONMENT: 'environment',
    DEFAULT: 'default',
    RUNTIME: 'runtime'
});

/**
 * Configuration for data processing operations
 */
export class ProcessingConfig {
    constructor(options = {}) {
        this.maxWorkers = options.maxWorkers || 4;
        this.batchSize = options.batchSize || 1000;
        this.timeoutSeconds = options.timeoutSeconds || 300;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.enableCaching = options.enableCaching ?? true;
        this.cacheTTLSeconds = options.cacheTTLSeconds || 3600;
        this.memoryLimitMB = options.memoryLimitMB || 1024;
        this.tempDirectory = options.tempDirectory || '/tmp/analytics';
    }

    validate() {
        if (this.maxWorkers <= 0) {
            throw new ConfigurationError('maxWorkers must be positive', 'maxWorkers');
        }
        if (this.batchSize <= 0) {
            throw new ConfigurationError('batchSize must be positive', 'batchSize');
        }
        if (this.timeoutSeconds <= 0) {
            throw new ConfigurationError('timeoutSeconds must be positive', 'timeoutSeconds');
        }
        if (this.memoryLimitMB <= 0) {
            throw new ConfigurationError('memoryLimitMB must be positive', 'memoryLimitMB');
        }
        return true;
    }

    toJSON() {
        return {
            maxWorkers: this.maxWorkers,
            batchSize: this.batchSize,
            timeoutSeconds: this.timeoutSeconds,
            retryAttempts: this.retryAttempts,
            retryDelay: this.retryDelay,
            enableCaching: this.enableCaching,
            cacheTTLSeconds: this.cacheTTLSeconds,
            memoryLimitMB: this.memoryLimitMB,
            tempDirectory: this.tempDirectory
        };
    }
}

/**
 * Configuration for data ingestion
 */
export class IngestionConfig {
    constructor(options = {}) {
        this.supportedFormats = options.supportedFormats || ['json', 'csv', 'parquet'];
        this.maxFileSizeMB = options.maxFileSizeMB || 100;
        this.encoding = options.encoding || 'utf-8';
        this.delimiter = options.delimiter || ',';
        this.compression = options.compression || null;
        this.validateSchema = options.validateSchema ?? true;
        this.parseDates = options.parseDates ?? true;
        this.chunkSize = options.chunkSize || 10000;
        this.connectionTimeout = options.connectionTimeout || 30000;
        this.readTimeout = options.readTimeout || 60000;
    }

    validate() {
        if (this.maxFileSizeMB <= 0) {
            throw new ConfigurationError('maxFileSizeMB must be positive', 'maxFileSizeMB');
        }
        if (this.chunkSize <= 0) {
            throw new ConfigurationError('chunkSize must be positive', 'chunkSize');
        }
        return true;
    }

    toJSON() {
        return {
            supportedFormats: this.supportedFormats,
            maxFileSizeMB: this.maxFileSizeMB,
            encoding: this.encoding,
            delimiter: this.delimiter,
            compression: this.compression,
            validateSchema: this.validateSchema,
            parseDates: this.parseDates,
            chunkSize: this.chunkSize,
            connectionTimeout: this.connectionTimeout,
            readTimeout: this.readTimeout
        };
    }
}

/**
 * Configuration for data visualization
 */
export class VisualizationConfig {
    constructor(options = {}) {
        this.defaultTheme = options.defaultTheme || 'modern';
        this.availableThemes = options.availableThemes || ['modern', 'classic', 'dark'];
        this.exportFormats = options.exportFormats || ['pdf', 'html', 'png', 'svg'];
        this.defaultWidth = options.defaultWidth || 800;
        this.defaultHeight = options.defaultHeight || 600;
        this.dpi = options.dpi || 96;
        this.fontFamily = options.fontFamily || 'Arial';
        this.fontSize = options.fontSize || 12;
        this.colorPalette = options.colorPalette || [
            '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
            '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
        ];
    }

    validate() {
        if (!this.availableThemes.includes(this.defaultTheme)) {
            throw new ConfigurationError(
                `defaultTheme must be one of ${this.availableThemes.join(', ')}`,
                'defaultTheme'
            );
        }
        if (this.defaultWidth <= 0 || this.defaultHeight <= 0) {
            throw new ConfigurationError('Dimensions must be positive', 'dimensions');
        }
        return true;
    }

    toJSON() {
        return {
            defaultTheme: this.defaultTheme,
            availableThemes: this.availableThemes,
            exportFormats: this.exportFormats,
            defaultWidth: this.defaultWidth,
            defaultHeight: this.defaultHeight,
            dpi: this.dpi,
            fontFamily: this.fontFamily,
            fontSize: this.fontSize,
            colorPalette: this.colorPalette
        };
    }
}

/**
 * Main platform configuration
 */
export class PlatformConfig {
    constructor(options = {}) {
        this.name = options.name || 'Analytics Platform';
        this.version = options.version || '1.0.0';
        this.environment = options.environment || 'development';
        this.debug = options.debug || false;
        this.logLevel = options.logLevel || 'INFO';
        this.dataDirectory = options.dataDirectory || './data';
        this.outputDirectory = options.outputDirectory || './output';
        
        // Sub-configurations
        this.processing = new ProcessingConfig(options.processing || {});
        this.ingestion = new IngestionConfig(options.ingestion || {});
        this.visualization = new VisualizationConfig(options.visualization || {});
        
        // Metadata
        this.configSources = [];
    }

    validate() {
        const validLogLevels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];
        if (!validLogLevels.includes(this.logLevel)) {
            throw new ConfigurationError(
                `logLevel must be one of ${validLogLevels.join(', ')}`,
                'logLevel'
            );
        }
        
        // Validate sub-configurations
        this.processing.validate();
        this.ingestion.validate();
        this.visualization.validate();
        
        return true;
    }

    toJSON() {
        return {
            name: this.name,
            version: this.version,
            environment: this.environment,
            debug: this.debug,
            logLevel: this.logLevel,
            dataDirectory: this.dataDirectory,
            outputDirectory: this.outputDirectory,
            processing: this.processing.toJSON(),
            ingestion: this.ingestion.toJSON(),
            visualization: this.visualization.toJSON()
        };
    }

    static fromJSON(data) {
        return new PlatformConfig({
            ...data,
            processing: data.processing,
            ingestion: data.ingestion,
            visualization: data.visualization
        });
    }
}

/**
 * Manager for loading and managing configuration
 */
export class ConfigManager {
    constructor(config = null) {
        this.config = config || new PlatformConfig();
        this.logger = console;
        this._overrides = {};
    }

    loadFromFile(filePath) {
        const resolvedPath = path.resolve(filePath);
        
        if (!fs.existsSync(resolvedPath)) {
            throw new ConfigurationError(`Configuration file not found: ${resolvedPath}`);
        }

        try {
            const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
            const data = JSON.parse(fileContent);
            
            this.config = PlatformConfig.fromJSON(data);
            this.config.configSources.push(ConfigSource.FILE);
            this.logger.info(`Configuration loaded from ${resolvedPath}`);
            
        } catch (error) {
            if (error instanceof ConfigurationError) {
                throw error;
            }
            throw new ConfigurationError(`Failed to load configuration from ${resolvedPath}: ${error.message}`);
        }
    }

    loadFromEnvironment(prefix = 'ANALYTICS_') {
        const envConfig = {};
        
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith(prefix)) {
                // Remove prefix and convert to camelCase
                const configKey = key
                    .substring(prefix.length)
                    .toLowerCase()
                    .replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                
                // Try to parse JSON values
                let parsedValue = value;
                try {
                    parsedValue = JSON.parse(value);
                } catch {
                    // Keep as string if not valid JSON
                }
                
                this._setNestedValue(envConfig, configKey, parsedValue);
            }
        }
        
        if (Object.keys(envConfig).length > 0) {
            this._mergeConfig(envConfig);
            this.config.configSources.push(ConfigSource.ENVIRONMENT);
            this.logger.info('Configuration loaded from environment variables');
        }
    }

    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in current)) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    _mergeConfig(updates) {
        const current = this.config.toJSON();
        
        // Deep merge function
        const deepMerge = (base, update) => {
            for (const [key, value] of Object.entries(update)) {
                if (key in base && typeof base[key] === 'object' && 
                    typeof value === 'object' && !Array.isArray(value)) {
                    deepMerge(base[key], value);
                } else {
                    base[key] = value;
                }
            }
            return base;
        };
        
        const merged = deepMerge(current, updates);
        this.config = PlatformConfig.fromJSON(merged);
    }

    override(key, value) {
        this._overrides[key] = value;
        const overrideObj = {};
        this._setNestedValue(overrideObj, key, value);
        this._mergeConfig(overrideObj);
        
        if (!this.config.configSources.includes(ConfigSource.RUNTIME)) {
            this.config.configSources.push(ConfigSource.RUNTIME);
        }
        
        this.logger.debug(`Configuration override: ${key} = ${value}`);
    }

    get(key, defaultValue = null) {
        const keys = key.split('.');
        let current = this.config;
        
        try {
            for (const k of keys) {
                current = current[k];
            }
            return current !== undefined ? current : defaultValue;
        } catch {
            return defaultValue;
        }
    }

    validate() {
        return this.config.validate();
    }

    saveToFile(filePath) {
        const resolvedPath = path.resolve(filePath);
        const data = this.config.toJSON();
        
        fs.writeFileSync(
            resolvedPath,
            JSON.stringify(data, null, 2),
            'utf-8'
        );
        
        this.logger.info(`Configuration saved to ${resolvedPath}`);
    }

    reset() {
        this.config = new PlatformConfig();
        this._overrides = {};
    }
}

// Global configuration instance
let _globalConfig = null;

export function getGlobalConfig() {
    if (!_globalConfig) {
        _globalConfig = new ConfigManager();
    }
    return _globalConfig.config;
}

export function configure(options = {}) {
    if (!_globalConfig) {
        _globalConfig = new ConfigManager();
    }
    
    for (const [key, value] of Object.entries(options)) {
        _globalConfig.override(key, value);
    }
}

export function resetGlobalConfig() {
    if (_globalConfig) {
        _globalConfig.reset();
    }
    _globalConfig = null;
}