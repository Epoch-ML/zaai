/**
 * Main entry point for the Analytics Platform.
 * 
 * This module demonstrates the integration of all platform components
 * with cross-module imports and usage patterns.
 */

import { Command } from 'commander';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Core module imports
import { Status, DataFormat } from './core/base.js';
import { ConfigManager, PlatformConfig, getGlobalConfig } from './core/config.js';
import { PlatformError, handlePlatformError } from './core/exceptions.js';
import { SchemaValidator } from './core/validators.js';
import { ComponentRegistry, getRegistry, PluginLoader } from './core/registry.js';

// Ingestion module imports
import { FileSource, DatabaseSource, APISource } from './ingestion/sources.js';
import { SQLConnector, HTTPConnector } from './ingestion/connectors.js';
import { DataLoader, BatchLoader } from './ingestion/loader.js';
import { detectSchema, TableSchema } from './ingestion/schema.js';

// Processing module imports
import { DataProcessor } from './processing/processor.js';
import { Pipeline } from './processing/pipeline.js';

// Visualization module imports
import { ChartGenerator } from './visualization/charts.js';
import { ReportBuilder } from './visualization/reports.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main platform class that orchestrates all components
 */
export class AnalyticsPlatform {
    constructor(configPath = null) {
        this.logger = console;
        
        // Initialize configuration
        this.configManager = new ConfigManager();
        if (configPath) {
            this.configManager.loadFromFile(configPath);
        }
        this.configManager.loadFromEnvironment();
        
        this.config = this.configManager.config;
        
        // Initialize component registry
        this.registry = getRegistry();
        
        // Initialize plugin loader
        this.pluginLoader = new PluginLoader(this.registry);
        
        // Initialize main components
        this.dataLoader = new DataLoader(this.config.ingestion);
        this.connectors = new Map();
        this.sources = new Map();
        
        // Setup logging
        this._setupLogging();
        
        this.logger.info(`Analytics Platform ${this.config.version} initialized`);
    }

    _setupLogging() {
        // In production, would configure Winston or similar logger
        const logLevel = this.config.logLevel;
        // Configure console logging based on level
    }

    async loadPlugins(pluginDir) {
        this.logger.info(`Loading plugins from ${pluginDir}`);
        const loaded = await this.pluginLoader.loadDirectory(pluginDir);
        this.logger.info(`Loaded ${loaded} plugins`);
        return loaded;
    }

    registerConnector(name, connectorType, options = {}) {
        let connector;
        
        switch (connectorType) {
            case 'sql':
                connector = new SQLConnector(options);
                break;
            case 'http':
                connector = new HTTPConnector(options);
                break;
            default:
                // Try to create from registry
                connector = this.registry.create(connectorType, options);
        }
        
        this.connectors.set(name, connector);
        this.dataLoader.registerConnector(name, connector);
        this.logger.info(`Registered ${connectorType} connector: ${name}`);
    }

    async ingestFile(filePath, format = null) {
        this.logger.info(`Ingesting file: ${filePath}`);
        
        // Convert format string to enum if provided
        let dataFormat = null;
        if (format) {
            dataFormat = DataFormat[format.toUpperCase()];
        }
        
        // Load the file
        const result = await this.dataLoader.loadFile(filePath, dataFormat);
        
        // Log results
        this.logger.info(
            `Ingestion complete: ${result.recordsLoaded} records loaded, ` +
            `${result.recordsFailed} failed`
        );
        
        if (result.errors.length > 0) {
            this.logger.warn(`Ingestion errors: ${result.errors.slice(0, 5).join(', ')}`);
        }
        
        return {
            status: result.successRate > 90 ? 'success' : 'partial',
            recordsLoaded: result.recordsLoaded,
            recordsFailed: result.recordsFailed,
            successRate: result.successRate,
            elapsedTime: result.elapsedTime,
            schema: result.metadata?.detectedSchema
        };
    }

    async ingestDatabase(connectorName, query = null, table = null) {
        this.logger.info(`Ingesting from database using ${connectorName}`);
        
        if (!this.connectors.has(connectorName)) {
            throw new PlatformError(`Connector not found: ${connectorName}`);
        }
        
        const result = await this.dataLoader.loadDatabase(connectorName, query, table);
        
        return {
            status: result.successRate > 90 ? 'success' : 'partial',
            recordsLoaded: result.recordsLoaded,
            recordsFailed: result.recordsFailed,
            successRate: result.successRate,
            elapsedTime: result.elapsedTime
        };
    }

    async processData(sourceName, processorName, processorOptions = {}) {
        this.logger.info(`Processing data from ${sourceName} using ${processorName}`);
        
        // Get processor from registry
        const processor = this.registry.create(processorName, processorOptions);
        
        // This would use the actual processing module
        // For now, return mock results
        return {
            status: 'success',
            processor: processorName,
            source: sourceName,
            recordsProcessed: 1000,
            transformationsApplied: ['clean', 'normalize', 'aggregate']
        };
    }

    async generateReport(dataSource, reportType, outputPath) {
        this.logger.info(`Generating ${reportType} report for ${dataSource}`);
        
        // This would use the actual visualization module
        // For now, return mock results
        return {
            status: 'success',
            reportType: reportType,
            outputPath: outputPath,
            pages: 5,
            charts: 10,
            tables: 3
        };
    }

    async runPipeline(pipelineConfig) {
        this.logger.info('Running data processing pipeline');
        
        const results = {
            status: 'running',
            steps: []
        };
        
        // Step 1: Ingestion
        if (pipelineConfig.ingestion) {
            const ingConfig = pipelineConfig.ingestion;
            let ingResult;
            
            if (ingConfig.type === 'file') {
                ingResult = await this.ingestFile(
                    ingConfig.path,
                    ingConfig.format
                );
            }
            
            results.steps.push({ name: 'ingestion', result: ingResult });
        }
        
        // Step 2: Processing
        if (pipelineConfig.processing) {
            const procConfig = pipelineConfig.processing;
            const procResult = await this.processData(
                procConfig.source,
                procConfig.processor,
                procConfig.options
            );
            
            results.steps.push({ name: 'processing', result: procResult });
        }
        
        // Step 3: Visualization
        if (pipelineConfig.visualization) {
            const vizConfig = pipelineConfig.visualization;
            const vizResult = await this.generateReport(
                vizConfig.source,
                vizConfig.type,
                vizConfig.output
            );
            
            results.steps.push({ name: 'visualization', result: vizResult });
        }
        
        results.status = 'complete';
        return results;
    }

    async shutdown() {
        this.logger.info('Shutting down Analytics Platform');
        
        // Cleanup data loader
        await this.dataLoader.cleanup();
        
        // Cleanup connectors
        for (const connector of this.connectors.values()) {
            try {
                await connector.cleanup();
            } catch (error) {
                this.logger.error(`Error cleaning up connector: ${error.message}`);
            }
        }
        
        this.logger.info('Shutdown complete');
    }
}

/**
 * CLI interface
 */
async function main() {
    const program = new Command();
    
    program
        .name('analytics-platform')
        .description('Analytics Platform - Comprehensive data analysis system')
        .version('1.0.0');
    
    program
        .option('-c, --config <path>', 'Path to configuration file')
        .option('-v, --verbose', 'Enable verbose logging');
    
    // Ingest command
    program
        .command('ingest')
        .description('Ingest data from various sources')
        .option('-i, --input <path>', 'Input file or source')
        .option('-f, --format <format>', 'Data format', 'json')
        .action(async (options) => {
            const platform = new AnalyticsPlatform(program.opts().config);
            
            try {
                const result = await platform.ingestFile(options.input, options.format);
                console.log('Ingestion complete:', result);
            } catch (error) {
                console.error('Ingestion failed:', error.message);
                process.exit(1);
            } finally {
                await platform.shutdown();
            }
        });
    
    // Process command
    program
        .command('process')
        .description('Process ingested data')
        .option('-s, --source <name>', 'Data source name')
        .option('-p, --processor <name>', 'Processor to use', 'default')
        .action(async (options) => {
            const platform = new AnalyticsPlatform(program.opts().config);
            
            try {
                const result = await platform.processData(
                    options.source,
                    options.processor
                );
                console.log('Processing complete:', result);
            } catch (error) {
                console.error('Processing failed:', error.message);
                process.exit(1);
            } finally {
                await platform.shutdown();
            }
        });
    
    // Report command
    program
        .command('report')
        .description('Generate reports from data')
        .option('-s, --source <name>', 'Data source')
        .option('-t, --type <type>', 'Report type', 'summary')
        .option('-o, --output <path>', 'Output path')
        .action(async (options) => {
            const platform = new AnalyticsPlatform(program.opts().config);
            
            try {
                const result = await platform.generateReport(
                    options.source,
                    options.type,
                    options.output
                );
                console.log('Report generated:', result);
            } catch (error) {
                console.error('Report generation failed:', error.message);
                process.exit(1);
            } finally {
                await platform.shutdown();
            }
        });
    
    // Pipeline command
    program
        .command('pipeline')
        .description('Run a complete data pipeline')
        .option('-c, --config <path>', 'Pipeline configuration file')
        .action(async (options) => {
            const platform = new AnalyticsPlatform(program.opts().config);
            
            try {
                // Load pipeline config from file
                const pipelineConfig = {
                    ingestion: {
                        type: 'file',
                        path: './data/input.json',
                        format: 'json'
                    },
                    processing: {
                        source: 'ingested_data',
                        processor: 'default_processor'
                    },
                    visualization: {
                        source: 'processed_data',
                        type: 'summary',
                        output: './output/report.html'
                    }
                };
                
                const result = await platform.runPipeline(pipelineConfig);
                console.log('Pipeline complete:', result);
            } catch (error) {
                console.error('Pipeline failed:', error.message);
                process.exit(1);
            } finally {
                await platform.shutdown();
            }
        });
    
    // Server command
    program
        .command('serve')
        .description('Start the platform API server')
        .option('-p, --port <port>', 'Server port', '3000')
        .action(async (options) => {
            const platform = new AnalyticsPlatform(program.opts().config);
            
            // Import express for API server
            const express = await import('express');
            const app = express.default();
            
            app.use(express.json());
            
            // API routes
            app.post('/api/ingest', async (req, res) => {
                try {
                    const result = await platform.ingestFile(
                        req.body.path,
                        req.body.format
                    );
                    res.json(result);
                } catch (error) {
                    res.status(400).json({ error: error.message });
                }
            });
            
            app.post('/api/process', async (req, res) => {
                try {
                    const result = await platform.processData(
                        req.body.source,
                        req.body.processor
                    );
                    res.json(result);
                } catch (error) {
                    res.status(400).json({ error: error.message });
                }
            });
            
            const server = app.listen(options.port, () => {
                console.log(`Analytics Platform API running on port ${options.port}`);
            });
            
            // Graceful shutdown
            process.on('SIGTERM', async () => {
                console.log('SIGTERM received, shutting down gracefully');
                server.close(() => {
                    platform.shutdown();
                });
            });
        });
    
    await program.parseAsync(process.argv);
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export default AnalyticsPlatform;