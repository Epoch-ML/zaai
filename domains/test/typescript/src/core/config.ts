// src/core/config.ts
/**
 * Configuration management for the analytics platform.
 */

import { ConfigurationException } from './exceptions.js';
import type { IConfig, Config, DeepPartial, Nullable } from '../types.js';
import type { LogLevel } from './types.js';

/**
 * Configuration manager implementation
 */
export class ConfigManager implements IConfig {
  private static instance: ConfigManager | null = null;
  private config: Map<string, unknown> = new Map();
  private readonly defaults: Map<string, unknown> = new Map();

  private constructor(initialConfig?: Partial<Config>) {
    this.setDefaults();
    if (initialConfig) {
      this.loadConfig(initialConfig);
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<Config>): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(config);
    }
    return ConfigManager.instance;
  }

  /**
   * Reset singleton instance (mainly for testing)
   */
  public static reset(): void {
    ConfigManager.instance = null;
  }

  /**
   * Set default configuration values
   */
  private setDefaults(): void {
    this.defaults.set('env', 'development');
    this.defaults.set('debug', false);
    this.defaults.set('logLevel', 'info');
    
    // Ingestion defaults
    this.defaults.set('ingestion.batchSize', 1000);
    this.defaults.set('ingestion.validateSchema', true);
    this.defaults.set('ingestion.detectSchema', true);
    this.defaults.set('ingestion.maxRetries', 3);
    this.defaults.set('ingestion.retryDelay', 1000);
    
    // Processing defaults
    this.defaults.set('processing.maxWorkers', 4);
    this.defaults.set('processing.cacheEnabled', true);
    this.defaults.set('processing.batchSize', 100);
    this.defaults.set('processing.timeout', 30000);
    this.defaults.set('processing.memoryLimit', 512); // MB
    
    // Visualization defaults
    this.defaults.set('visualization.theme', 'default');
    this.defaults.set('visualization.chartLibrary', 'chartjs');
    this.defaults.set('visualization.defaultWidth', 800);
    this.defaults.set('visualization.defaultHeight', 600);
    
    // Dashboard defaults
    this.defaults.set('dashboard.refreshInterval', 30000);
    this.defaults.set('dashboard.maxWidgets', 20);
    this.defaults.set('dashboard.enableAnimations', true);
  }

  /**
   * Load configuration from object
   */
  private loadConfig(config: unknown): void {
    if (typeof config === 'object' && config !== null) {
      this.flattenObject(config as Record<string, unknown>, '');
    }
  }

  /**
   * Flatten nested object into dot notation
   */
  private flattenObject(obj: Record<string, unknown>, prefix: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.flattenObject(value as Record<string, unknown>, fullKey);
      } else {
        this.config.set(fullKey, value);
      }
    }
  }

  /**
   * Get configuration value
   */
  public get<T>(key: string, defaultValue?: T): T {
    const value = this.config.get(key) ?? this.defaults.get(key) ?? defaultValue;
    
    if (value === undefined) {
      throw new ConfigurationException(
        `Configuration key '${key}' not found and no default provided`,
        key
      );
    }
    
    return value as T;
  }

  /**
   * Set configuration value
   */
  public set(key: string, value: unknown): void {
    this.config.set(key, value);
  }

  /**
   * Check if configuration key exists
   */
  public has(key: string): boolean {
    return this.config.has(key) || this.defaults.has(key);
  }

  /**
   * Delete configuration value
   */
  public delete(key: string): void {
    this.config.delete(key);
  }

  /**
   * Clear all configuration
   */
  public clear(): void {
    this.config.clear();
  }

  /**
   * Get all configuration as object
   */
  public toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    // Add defaults
    for (const [key, value] of this.defaults) {
      this.setNestedValue(result, key, value);
    }
    
    // Override with config
    for (const [key, value] of this.config) {
      this.setNestedValue(result, key, value);
    }
    
    return result;
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
    const keys = key.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k] as Record<string, unknown>;
    }
    
    current[keys[keys.length - 1]!] = value;
  }

  /**
   * Load configuration from environment variables
   */
  public loadFromEnv(prefix = 'APP_'): void {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const configKey = key
          .substring(prefix.length)
          .toLowerCase()
          .replace(/_/g, '.');
        
        // Parse value
        let parsedValue: unknown = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (value && !isNaN(Number(value))) parsedValue = Number(value);
        
        this.set(configKey, parsedValue);
      }
    }
  }

  /**
   * Validate configuration against schema
   */
  public validate(schema: ConfigSchema): boolean {
    const config = this.toJSON();
    return this.validateObject(config, schema);
  }

  private validateObject(obj: unknown, schema: ConfigSchema): boolean {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const objRecord = obj as Record<string, unknown>;

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in objRecord)) {
          throw new ConfigurationException(
            `Required configuration field '${field}' is missing`,
            field
          );
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in objRecord) {
          const value = objRecord[key];
          if (!this.validateValue(value, propSchema)) {
            throw new ConfigurationException(
              `Configuration field '${key}' is invalid`,
              key,
              propSchema.type,
              typeof value
            );
          }
        }
      }
    }

    return true;
  }

  private validateValue(value: unknown, schema: PropertySchema): boolean {
    // Type check
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') return false;
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
        break;
      
      case 'number':
        if (typeof value !== 'number') return false;
        if (schema.minimum !== undefined && value < schema.minimum) return false;
        if (schema.maximum !== undefined && value > schema.maximum) return false;
        break;
      
      case 'boolean':
        if (typeof value !== 'boolean') return false;
        break;
      
      case 'array':
        if (!Array.isArray(value)) return false;
        if (schema.items) {
          for (const item of value) {
            if (!this.validateValue(item, schema.items)) return false;
          }
        }
        break;
      
      case 'object':
        if (typeof value !== 'object' || value === null) return false;
        if (schema.properties) {
          const objValue = value as Record<string, unknown>;
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (key in objValue && !this.validateValue(objValue[key], propSchema)) {
              return false;
            }
          }
        }
        break;
      
      default:
        return false;
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(value)) {
      return false;
    }

    return true;
  }

  /**
   * Create a scoped configuration
   */
  public scope(prefix: string): ScopedConfig {
    return new ScopedConfig(this, prefix);
  }
}

/**
 * Scoped configuration wrapper
 */
export class ScopedConfig implements IConfig {
  constructor(
    private readonly parent: ConfigManager,
    private readonly prefix: string
  ) {}

  private prefixKey(key: string): string {
    return `${this.prefix}.${key}`;
  }

  public get<T>(key: string, defaultValue?: T): T {
    return this.parent.get(this.prefixKey(key), defaultValue);
  }

  public set(key: string, value: unknown): void {
    this.parent.set(this.prefixKey(key), value);
  }

  public has(key: string): boolean {
    return this.parent.has(this.prefixKey(key));
  }

  public delete(key: string): void {
    this.parent.delete(this.prefixKey(key));
  }

  public clear(): void {
    // Clear all keys with prefix
    const allConfig = this.parent.toJSON();
    const prefixDot = `${this.prefix}.`;
    
    const flatKeys = this.getFlatKeys(allConfig);
    for (const key of flatKeys) {
      if (key.startsWith(prefixDot)) {
        this.parent.delete(key);
      }
    }
  }

  private getFlatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        keys.push(...this.getFlatKeys(value as Record<string, unknown>, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    
    return keys;
  }

  public toJSON(): Record<string, unknown> {
    const allConfig = this.parent.toJSON();
    const result: Record<string, unknown> = {};
    const prefixDot = `${this.prefix}.`;
    
    const flatKeys = this.getFlatKeys(allConfig);
    for (const key of flatKeys) {
      if (key.startsWith(prefixDot)) {
        const shortKey = key.substring(prefixDot.length);
        this.setNestedValue(result, shortKey, this.parent.get(key));
      }
    }
    
    return result;
  }

  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
    const keys = key.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k] as Record<string, unknown>;
    }
    
    current[keys[keys.length - 1]!] = value;
  }
}

// Re-export types for configuration schema
export type { ConfigSchema, PropertySchema } from './types.js';