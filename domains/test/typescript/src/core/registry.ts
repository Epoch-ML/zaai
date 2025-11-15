// src/core/registry.ts
/**
 * Component registry for the analytics platform.
 */

import { AlreadyExistsException, NotFoundException } from './exceptions.js';
import { Logger } from './base.js';
import type { 
  IRegistry, 
  IComponent, 
  ComponentMetadata, 
  ComponentType,
  ComponentConstructor,
  DecoratorMetadata
} from './types.js';
import type { Nullable } from '../types.js';

/**
 * Component registry entry
 */
interface RegistryEntry {
  metadata: ComponentMetadata;
  constructor: ComponentConstructor;
  instance?: IComponent;
  factory?: () => IComponent;
}

/**
 * Component registry implementation
 */
export class ComponentRegistry implements IRegistry<RegistryEntry> {
  private static instance: ComponentRegistry | null = null;
  private readonly components: Map<string, RegistryEntry> = new Map();
  private readonly typeIndex: Map<ComponentType, Set<string>> = new Map();
  private readonly tagIndex: Map<string, Set<string>> = new Map();
  private readonly logger: Logger;

  private constructor() {
    this.logger = new Logger('ComponentRegistry');
    this.initializeIndexes();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      ComponentRegistry.instance = new ComponentRegistry();
    }
    return ComponentRegistry.instance;
  }

  /**
   * Reset singleton instance (mainly for testing)
   */
  public static reset(): void {
    ComponentRegistry.instance = null;
  }

  /**
   * Initialize type indexes
   */
  private initializeIndexes(): void {
    for (const type of Object.values(ComponentType)) {
      this.typeIndex.set(type as ComponentType, new Set());
    }
  }

  /**
   * Register a component
   */
  public register(
    name: string,
    component: RegistryEntry | ComponentConstructor,
    metadata?: Partial<ComponentMetadata>
  ): void {
    if (this.components.has(name)) {
      throw new AlreadyExistsException(
        `Component '${name}' is already registered`,
        'Component',
        name
      );
    }

    let entry: RegistryEntry;
    
    if ('constructor' in component && 'metadata' in component) {
      entry = component as RegistryEntry;
    } else {
      const constructor = component as ComponentConstructor;
      entry = {
        constructor,
        metadata: {
          ...metadata,
          name,
          componentType: metadata?.componentType || ComponentType.PROCESSOR,
        } as ComponentMetadata,
      };
    }

    // Register component
    this.components.set(name, entry);

    // Update type index
    const typeSet = this.typeIndex.get(entry.metadata.componentType);
    typeSet?.add(name);

    // Update tag index
    if (entry.metadata.tags) {
      for (const tag of entry.metadata.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)?.add(name);
      }
    }

    this.logger.info(`Registered ${entry.metadata.componentType} component: ${name}`);
  }

  /**
   * Unregister a component
   */
  public unregister(name: string): void {
    const entry = this.components.get(name);
    if (!entry) {
      throw new NotFoundException(
        `Component '${name}' not found`,
        'Component',
        name
      );
    }

    // Remove from type index
    const typeSet = this.typeIndex.get(entry.metadata.componentType);
    typeSet?.delete(name);

    // Remove from tag index
    if (entry.metadata.tags) {
      for (const tag of entry.metadata.tags) {
        this.tagIndex.get(tag)?.delete(name);
      }
    }

    // Cleanup instance if exists
    if (entry.instance) {
      entry.instance.cleanup().catch(error => {
        this.logger.error(`Failed to cleanup component '${name}':`, error);
      });
    }

    // Remove component
    this.components.delete(name);
    this.logger.info(`Unregistered component: ${name}`);
  }

  /**
   * Get a component entry
   */
  public get(name: string): Nullable<RegistryEntry> {
    return this.components.get(name) || null;
  }

  /**
   * Get or create component instance
   */
  public getInstance(name: string, ...args: unknown[]): IComponent {
    const entry = this.get(name);
    if (!entry) {
      throw new NotFoundException(
        `Component '${name}' not found`,
        'Component',
        name
      );
    }

    if (!entry.instance) {
      if (entry.factory) {
        entry.instance = entry.factory();
      } else {
        entry.instance = new entry.constructor(...args);
      }
    }

    return entry.instance;
  }

  /**
   * Create new component instance
   */
  public create(name: string, ...args: unknown[]): IComponent {
    const entry = this.get(name);
    if (!entry) {
      throw new NotFoundException(
        `Component '${name}' not found`,
        'Component',
        name
      );
    }

    if (entry.factory) {
      return entry.factory();
    }

    return new entry.constructor(...args);
  }

  /**
   * Check if component exists
   */
  public has(name: string): boolean {
    return this.components.has(name);
  }

  /**
   * List all component names
   */
  public list(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * List components by type
   */
  public listByType(type: ComponentType): string[] {
    return Array.from(this.typeIndex.get(type) || []);
  }

  /**
   * List components by tag
   */
  public listByTag(tag: string): string[] {
    return Array.from(this.tagIndex.get(tag) || []);
  }

  /**
   * Get components by capability
   */
  public getByCapability(capability: string): ComponentMetadata[] {
    const results: ComponentMetadata[] = [];
    
    for (const entry of this.components.values()) {
      if (entry.metadata.capabilities?.includes(capability)) {
        results.push(entry.metadata);
      }
    }
    
    return results;
  }

  /**
   * Search components
   */
  public search(query: string): ComponentMetadata[] {
    const lowerQuery = query.toLowerCase();
    const results: ComponentMetadata[] = [];
    
    for (const entry of this.components.values()) {
      const metadata = entry.metadata;
      
      if (
        metadata.name.toLowerCase().includes(lowerQuery) ||
        metadata.description?.toLowerCase().includes(lowerQuery) ||
        metadata.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
      ) {
        results.push(metadata);
      }
    }
    
    return results;
  }

  /**
   * Get dependencies for a component
   */
  public getDependencies(name: string, recursive = true): string[] {
    const entry = this.get(name);
    if (!entry) {
      throw new NotFoundException(
        `Component '${name}' not found`,
        'Component',
        name
      );
    }

    const dependencies = new Set<string>(entry.metadata.dependencies || []);
    
    if (recursive) {
      for (const dep of Array.from(dependencies)) {
        if (this.has(dep)) {
          const subDeps = this.getDependencies(dep, true);
          subDeps.forEach(d => dependencies.add(d));
        }
      }
    }
    
    return Array.from(dependencies);
  }

  /**
   * Validate dependencies
   */
  public validateDependencies(name: string): boolean {
    const dependencies = this.getDependencies(name, false);
    
    for (const dep of dependencies) {
      if (!this.has(dep)) {
        this.logger.warn(`Missing dependency '${dep}' for component '${name}'`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Clear all components
   */
  public clear(): void {
    // Cleanup all instances
    for (const entry of this.components.values()) {
      if (entry.instance) {
        entry.instance.cleanup().catch(error => {
          this.logger.error('Failed to cleanup component:', error);
        });
      }
    }
    
    // Clear all data
    this.components.clear();
    this.typeIndex.forEach(set => set.clear());
    this.tagIndex.clear();
    
    this.logger.info('Registry cleared');
  }

  /**
   * Get registry statistics
   */
  public getStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {
      totalComponents: this.components.size,
      componentsByType: {},
      componentsByTag: {},
      instantiatedComponents: 0,
    };
    
    // Count by type
    for (const [type, names] of this.typeIndex.entries()) {
      stats.componentsByType[type] = names.size;
    }
    
    // Count by tag
    for (const [tag, names] of this.tagIndex.entries()) {
      stats.componentsByTag[tag] = names.size;
    }
    
    // Count instantiated
    let instantiated = 0;
    for (const entry of this.components.values()) {
      if (entry.instance) {
        instantiated++;
      }
    }
    stats.instantiatedComponents = instantiated;
    
    return stats;
  }

  /**
   * Get registry size
   */
  public size(): number {
    return this.components.size;
  }

  /**
   * Export registry as JSON
   */
  public toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      components: {},
      types: {},
      tags: {},
    };
    
    // Export components
    for (const [name, entry] of this.components.entries()) {
      result.components[name] = {
        type: entry.metadata.componentType,
        tags: entry.metadata.tags || [],
        version: entry.metadata.version,
        description: entry.metadata.description || '',
        capabilities: entry.metadata.capabilities || [],
        dependencies: entry.metadata.dependencies || [],
      };
    }
    
    // Export type index
    for (const [type, names] of this.typeIndex.entries()) {
      result.types[type] = Array.from(names);
    }
    
    // Export tag index
    for (const [tag, names] of this.tagIndex.entries()) {
      result.tags[tag] = Array.from(names);
    }
    
    return result;
  }
}

/**
 * Component decorator
 */
export function Component(
  type: ComponentType,
  metadata?: Partial<ComponentMetadata>
): ClassDecorator {
  return function <T extends ComponentConstructor>(target: T): T {
    const registry = ComponentRegistry.getInstance();
    const name = metadata?.name || target.name;
    
    const fullMetadata: ComponentMetadata = {
      name,
      componentType: type,
      ...metadata,
    } as ComponentMetadata;
    
    // Store metadata on class
    (target as any).__metadata = fullMetadata;
    
    // Auto-register if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      registry.register(name, target, fullMetadata);
    }
    
    return target;
  };
}

/**
 * Processor decorator
 */
export function Processor(metadata?: Partial<ComponentMetadata>): ClassDecorator {
  return Component(ComponentType.PROCESSOR, metadata);
}

/**
 * Transformer decorator
 */
export function Transformer(metadata?: Partial<ComponentMetadata>): ClassDecorator {
  return Component(ComponentType.TRANSFORMER, metadata);
}

/**
 * Validator decorator
 */
export function Validator(metadata?: Partial<ComponentMetadata>): ClassDecorator {
  return Component(ComponentType.VALIDATOR, metadata);
}

/**
 * Connector decorator
 */
export function Connector(metadata?: Partial<ComponentMetadata>): ClassDecorator {
  return Component(ComponentType.CONNECTOR, metadata);
}

/**
 * Injectable decorator for dependency injection
 */
export function Injectable(): ClassDecorator {
  return function <T extends ComponentConstructor>(target: T): T {
    // Mark as injectable
    (target as any).__injectable = true;
    return target;
  };
}

/**
 * Singleton decorator
 */
export function Singleton(): ClassDecorator {
  return function <T extends ComponentConstructor>(target: T): T {
    let instance: InstanceType<T> | null = null;
    
    // Create wrapper class
    const SingletonClass = class extends (target as any) {
      constructor(...args: any[]) {
        if (instance) {
          return instance;
        }
        super(...args);
        instance = this as InstanceType<T>;
      }
    } as T;
    
    // Copy static properties
    Object.setPrototypeOf(SingletonClass, target);
    Object.setPrototypeOf(SingletonClass.prototype, target.prototype);
    
    return SingletonClass;
  };
}

/**
 * Capability decorator
 */
export function Capability(capability: string): ClassDecorator {
  return function <T extends ComponentConstructor>(target: T): T {
    const metadata = (target as any).__metadata || {};
    
    if (!metadata.capabilities) {
      metadata.capabilities = [];
    }
    
    metadata.capabilities.push(capability);
    (target as any).__metadata = metadata;
    
    return target;
  };
}

/**
 * Tag decorator
 */
export function Tag(tag: string): ClassDecorator {
  return function <T extends ComponentConstructor>(target: T): T {
    const metadata = (target as any).__metadata || {};
    
    if (!metadata.tags) {
      metadata.tags = [];
    }
    
    metadata.tags.push(tag);
    (target as any).__metadata = metadata;
    
    return target;
  };
}

/**
 * Dependency decorator
 */
export function DependsOn(...dependencies: string[]): ClassDecorator {
  return function <T extends ComponentConstructor>(target: T): T {
    const metadata = (target as any).__metadata || {};
    
    if (!metadata.dependencies) {
      metadata.dependencies = [];
    }
    
    metadata.dependencies.push(...dependencies);
    (target as any).__metadata = metadata;
    
    return target;
  };
}