// src/index.ts
/**
 * Analytics Platform - Main Entry Point
 * A comprehensive data analytics platform built with TypeScript
 */

// Core exports
export * from './core/base.js';
export * from './core/exceptions.js';
export * from './core/validators.js';
export * from './core/config.js';
export * from './core/registry.js';
export * from './core/types.js';

// Ingestion exports
export * from './ingestion/sources.js';
export * from './ingestion/connectors.js';
export * from './ingestion/parsers.js';
export * from './ingestion/schema.js';
export * from './ingestion/loader.js';
export * from './ingestion/types.js';

// Processing exports
export * from './processing/processor.js';
export * from './processing/transformers.js';
export * from './processing/aggregators.js';
export * from './processing/pipeline.js';
export * from './processing/cache.js';
export * from './processing/types.js';

// Visualization exports
export * from './visualization/charts.js';
export * from './visualization/reports.js';
export * from './visualization/exporters.js';
export * from './visualization/templates.js';
export * from './visualization/types.js';

// Global types
export * from './types.js';

import { ConfigManager } from './core/config.js';
import { ComponentRegistry } from './core/registry.js';
import { DataLoader } from './ingestion/loader.js';
import { DataProcessor } from './processing/processor.js';
import { Pipeline } from './processing/pipeline.js';
import { ReportBuilder, DashboardBuilder } from './visualization/reports.js';
import { ChartGenerator } from './visualization/charts.js';
import { Logger } from './core/base.js';
import type { Config } from './types.js';

/**
 * Main Analytics Platform class
 */
export class AnalyticsPlatform {
  private static instance: AnalyticsPlatform | null = null;
  private readonly config: ConfigManager;
  private readonly registry: ComponentRegistry;
  private readonly logger: Logger;
  private loader: DataLoader | null = null;
  private processor: DataProcessor | null = null;

  private constructor(config?: Partial<Config>) {
    this.config = ConfigManager.getInstance(config);
    this.registry = ComponentRegistry.getInstance();
    this.logger = new Logger('AnalyticsPlatform');
    this.initialize();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<Config>): AnalyticsPlatform {
    if (!AnalyticsPlatform.instance) {
      AnalyticsPlatform.instance = new AnalyticsPlatform(config);
    }
    return AnalyticsPlatform.instance;
  }

  /**
   * Initialize the platform
   */
  private initialize(): void {
    this.logger.info('Initializing Analytics Platform...');
    
    // Register default components
    this.registerDefaultComponents();
    
    // Initialize subsystems
    this.initializeIngestion();
    this.initializeProcessing();
    this.initializeVisualization();
    
    this.logger.info('Analytics Platform initialized successfully');
  }

  /**
   * Register default components
   */
  private registerDefaultComponents(): void {
    // Components are auto-registered via decorators
    this.logger.debug(`Registered ${this.registry.size()} components`);
  }

  /**
   * Initialize ingestion subsystem
   */
  private initializeIngestion(): void {
    this.loader = new DataLoader({
      batchSize: this.config.get('ingestion.batchSize', 1000),
      validateSchema: this.config.get('ingestion.validateSchema', true),
    });
  }

  /**
   * Initialize processing subsystem
   */
  private initializeProcessing(): void {
    this.processor = new DataProcessor({
      maxWorkers: this.config.get('processing.maxWorkers', 4),
      cacheEnabled: this.config.get('processing.cacheEnabled', true),
    });
  }

  /**
   * Initialize visualization subsystem
   */
  private initializeVisualization(): void {
    // Visualization components are created on demand
    this.logger.debug('Visualization subsystem ready');
  }

  /**
   * Create a new data pipeline
   */
  public createPipeline(name: string): Pipeline {
    return new Pipeline(name, {
      registry: this.registry,
      config: this.config,
    });
  }

  /**
   * Create a report builder
   */
  public createReport(title: string): ReportBuilder {
    return new ReportBuilder(title, {
      theme: this.config.get('visualization.theme', 'default'),
    });
  }

  /**
   * Create a dashboard
   */
  public createDashboard(title: string): DashboardBuilder {
    return new DashboardBuilder(title, {
      refreshInterval: this.config.get('dashboard.refreshInterval', 30000),
    });
  }

  /**
   * Create a chart generator
   */
  public createChartGenerator(): ChartGenerator {
    return new ChartGenerator({
      theme: this.config.get('visualization.theme', 'default'),
    });
  }

  /**
   * Get the data loader
   */
  public getLoader(): DataLoader {
    if (!this.loader) {
      throw new Error('Data loader not initialized');
    }
    return this.loader;
  }

  /**
   * Get the data processor
   */
  public getProcessor(): DataProcessor {
    if (!this.processor) {
      throw new Error('Data processor not initialized');
    }
    return this.processor;
  }

  /**
   * Get the component registry
   */
  public getRegistry(): ComponentRegistry {
    return this.registry;
  }

  /**
   * Get the configuration manager
   */
  public getConfig(): ConfigManager {
    return this.config;
  }

  /**
   * Shutdown the platform
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Analytics Platform...');
    
    // Cleanup resources
    if (this.loader) {
      await this.loader.cleanup();
    }
    
    if (this.processor) {
      await this.processor.cleanup();
    }
    
    // Clear registry
    this.registry.clear();
    
    // Reset singleton
    AnalyticsPlatform.instance = null;
    
    this.logger.info('Analytics Platform shutdown complete');
  }
}

// CLI Support (if run directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  const platform = AnalyticsPlatform.getInstance({
    env: 'development',
    debug: true,
    logLevel: 'debug',
  });

  console.log('Analytics Platform CLI');
  console.log('======================');
  console.log('Platform initialized and ready for use');
  console.log(`Components registered: ${platform.getRegistry().size()}`);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await platform.shutdown();
    process.exit(0);
  });
}

// Default export
export default AnalyticsPlatform;