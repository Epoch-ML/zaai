// core/registry.js
/**
 * Component registry for the analytics platform.
 * 
 * This module provides a centralized registry for managing and discovering
 * platform components like processors, transformers, and visualizers.
 */

import { PlatformError } from './exceptions.js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Types of components that can be registered
export const ComponentType = Object.freeze({
    PROCESSOR: 'processor',
    TRANSFORMER: 'transformer',
    INGESTER: 'ingester',
    VISUALIZER: 'visualizer',
    CONNECTOR: 'connector',
    VALIDATOR: 'validator',
    AGGREGATOR: 'aggregator',
    EXPORTER: 'exporter'
});

/**
 * Metadata for registered components
 */
export class ComponentMetadata {
    constructor(options = {}) {
        this.name = options.name;
        this.componentType = options.componentType;
        this.classType = options.classType;
        this.module = options.module || 'unknown';
        this.version = options.version || '1.0.0';
        this.description = options.description || '';
        this.author = options.author || '';
        this.tags = options.tags || [];
        this.dependencies = options.dependencies || [];
        this.registeredAt = new Date();
        this.capabilities = options.capabilities || [];
        this.configSchema = options.configSchema || null;
    }

    matchesTags(tags) {
        return tags.some(tag => this.tags.includes(tag));
    }

    hasCapability(capability) {
        return this.capabilities.includes(capability);
    }
}

/**
 * Registry for managing platform components
 */
export class ComponentRegistry {
    constructor() {
        this._components = new Map();
        this._typeIndex = new Map();
        this._tagIndex = new Map();
        this._factories = new Map();
        this.logger = console;
        
        // Initialize type index
        for (const type of Object.values(ComponentType)) {
            this._typeIndex.set(type, new Set());
        }
    }

    register(name, componentType, classType, factory = null, metadata = {}) {
        if (this._components.has(name)) {
            throw new PlatformError(`Component '${name}' is already registered`);
        }

        // Create component metadata
        const componentMeta = new ComponentMetadata({
            name,
            componentType,
            classType,
            module: classType.constructor?.name || 'unknown',
            description: metadata.description || classType.description || '',
            ...metadata
        });

        // Extract capabilities if component has them
        if (classType.prototype?.getCapabilities) {
            try {
                const instance = new classType();
                componentMeta.capabilities = instance.getCapabilities();
            } catch {
                // Ignore if instantiation fails
            }
        }

        // Register component
        this._components.set(name, componentMeta);
        this._typeIndex.get(componentType).add(name);

        // Update tag index
        for (const tag of componentMeta.tags) {
            if (!this._tagIndex.has(tag)) {
                this._tagIndex.set(tag, new Set());
            }
            this._tagIndex.get(tag).add(name);
        }

        // Register factory if provided
        if (factory) {
            this._factories.set(name, factory);
        }

        this.logger.info(`Registered ${componentType} component: ${name}`);
    }

    unregister(name) {
        if (!this._components.has(name)) {
            throw new PlatformError(`Component '${name}' is not registered`);
        }

        const component = this._components.get(name);

        // Remove from type index
        this._typeIndex.get(component.componentType).delete(name);

        // Remove from tag index
        for (const tag of component.tags) {
            this._tagIndex.get(tag)?.delete(name);
        }

        // Remove factory if exists
        this._factories.delete(name);

        // Remove component
        this._components.delete(name);

        this.logger.info(`Unregistered component: ${name}`);
    }

    get(name) {
        const component = this._components.get(name);
        if (!component) {
            throw new PlatformError(`Component '${name}' not found`);
        }
        return component;
    }

    create(name, ...args) {
        if (!this._components.has(name)) {
            throw new PlatformError(`Component '${name}' not found`);
        }

        const component = this._components.get(name);

        // Use factory if available
        if (this._factories.has(name)) {
            try {
                return this._factories.get(name)(...args);
            } catch (error) {
                throw new PlatformError(`Failed to create '${name}' using factory: ${error.message}`);
            }
        }

        // Otherwise instantiate class directly
        try {
            return new component.classType(...args);
        } catch (error) {
            throw new PlatformError(`Failed to create '${name}': ${error.message}`);
        }
    }

    listComponents(componentType = null, tags = null) {
        let components;
        
        if (componentType) {
            components = Array.from(this._typeIndex.get(componentType) || []);
        } else {
            components = Array.from(this._components.keys());
        }

        if (tags && tags.length > 0) {
            components = components.filter(name => 
                this._components.get(name).matchesTags(tags)
            );
        }

        return components;
    }

    getByType(componentType) {
        const names = this._typeIndex.get(componentType) || new Set();
        return Array.from(names).map(name => this._components.get(name));
    }

    getByCapability(capability) {
        const results = [];
        for (const component of this._components.values()) {
            if (component.hasCapability(capability)) {
                results.push(component);
            }
        }
        return results;
    }

    search(query) {
        const lowerQuery = query.toLowerCase();
        const results = [];

        for (const [name, component] of this._components.entries()) {
            if (name.toLowerCase().includes(lowerQuery) ||
                component.description.toLowerCase().includes(lowerQuery) ||
                component.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                results.push(component);
            }
        }

        return results;
    }

    getDependencies(name, recursive = true) {
        if (!this._components.has(name)) {
            throw new PlatformError(`Component '${name}' not found`);
        }

        const component = this._components.get(name);
        const dependencies = new Set(component.dependencies);

        if (recursive) {
            for (const dep of Array.from(dependencies)) {
                if (this._components.has(dep)) {
                    const subDeps = this.getDependencies(dep, true);
                    subDeps.forEach(d => dependencies.add(d));
                }
            }
        }

        return Array.from(dependencies);
    }

    validateDependencies(name) {
        const dependencies = this.getDependencies(name, false);

        for (const dep of dependencies) {
            if (!this._components.has(dep)) {
                this.logger.warn(`Missing dependency '${dep}' for component '${name}'`);
                return false;
            }
        }

        return true;
    }

    clear() {
        this._components.clear();
        this._typeIndex.forEach(set => set.clear());
        this._tagIndex.clear();
        this._factories.clear();
        this.logger.info('Registry cleared');
    }

    toJSON() {
        const result = {
            components: {},
            types: {},
            tags: {}
        };

        for (const [name, component] of this._components.entries()) {
            result.components[name] = {
                type: component.componentType,
                tags: component.tags,
                version: component.version,
                description: component.description
            };
        }

        for (const [type, names] of this._typeIndex.entries()) {
            result.types[type] = Array.from(names);
        }

        for (const [tag, names] of this._tagIndex.entries()) {
            result.tags[tag] = Array.from(names);
        }

        return result;
    }
}

// Decorators for automatic registration (using wrapper functions in JavaScript)

/**
 * Register a component with the registry
 */
export function registerComponent(componentType, name = null, metadata = {}) {
    return function(ClassType) {
        const componentName = name || ClassType.name;
        getRegistry().register(
            componentName,
            componentType,
            ClassType,
            null,
            metadata
        );
        
        // Add registration info to class
        ClassType._registryName = componentName;
        ClassType._registryType = componentType;
        
        return ClassType;
    };
}

/**
 * Register a processor component
 */
export function registerProcessor(name = null, metadata = {}) {
    return registerComponent(ComponentType.PROCESSOR, name, metadata);
}

/**
 * Register a transformer component
 */
export function registerTransformer(name = null, metadata = {}) {
    return registerComponent(ComponentType.TRANSFORMER, name, metadata);
}

/**
 * Plugin loader for dynamically loading component plugins
 */
export class PluginLoader {
    constructor(registry = null) {
        this.registry = registry || getRegistry();
        this.logger = console;
    }

    async loadModule(modulePath) {
        try {
            const resolvedPath = path.resolve(modulePath);
            const moduleURL = pathToFileURL(resolvedPath).href;
            const module = await import(moduleURL);
            let loaded = 0;

            // Find all exported classes
            for (const [name, exported] of Object.entries(module)) {
                if (typeof exported === 'function' && exported.prototype) {
                    // Check if class has registry metadata
                    if (exported._registryName && exported._registryType) {
                        loaded++;
                    }
                    // Check if it's a known base class type
                    else if (this._isKnownComponentType(exported)) {
                        this.registry.register(
                            name,
                            this._getComponentType(exported),
                            exported
                        );
                        loaded++;
                    }
                }
            }

            this.logger.info(`Loaded ${loaded} components from ${modulePath}`);
            return loaded;
            
        } catch (error) {
            this.logger.error(`Failed to load module ${modulePath}: ${error.message}`);
            return 0;
        }
    }

    async loadDirectory(directory) {
        let total = 0;

        if (!fs.existsSync(directory)) {
            this.logger.error(`Invalid directory: ${directory}`);
            return 0;
        }

        const files = fs.readdirSync(directory);
        
        for (const file of files) {
            if (file.endsWith('.js') && !file.startsWith('_')) {
                const modulePath = path.join(directory, file);
                total += await this.loadModule(modulePath);
            }
        }

        return total;
    }

    _isKnownComponentType(cls) {
        // Check if class extends known base classes
        const baseClasses = ['BaseProcessor', 'BaseTransformer', 'BaseComponent'];
        let proto = cls.prototype;
        
        while (proto) {
            if (baseClasses.includes(proto.constructor.name)) {
                return true;
            }
            proto = Object.getPrototypeOf(proto);
        }
        
        return false;
    }

    _getComponentType(cls) {
        // Determine component type from class name or inheritance
        const className = cls.name.toLowerCase();
        
        if (className.includes('processor')) return ComponentType.PROCESSOR;
        if (className.includes('transformer')) return ComponentType.TRANSFORMER;
        if (className.includes('connector')) return ComponentType.CONNECTOR;
        if (className.includes('validator')) return ComponentType.VALIDATOR;
        if (className.includes('aggregator')) return ComponentType.AGGREGATOR;
        if (className.includes('exporter')) return ComponentType.EXPORTER;
        if (className.includes('visualizer')) return ComponentType.VISUALIZER;
        
        return ComponentType.PROCESSOR; // Default
    }
}

// Global registry instance
let _globalRegistry = null;

export function getRegistry() {
    if (!_globalRegistry) {
        _globalRegistry = new ComponentRegistry();
    }
    return _globalRegistry;
}

export function resetRegistry() {
    if (_globalRegistry) {
        _globalRegistry.clear();
    }
    _globalRegistry = null;
}