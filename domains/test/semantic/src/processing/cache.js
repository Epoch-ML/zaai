// processing/cache.js
/**
 * Cache implementation for the processing module.
 * 
 * This module provides caching mechanisms for processed data
 * to improve performance and reduce redundant computations.
 */

import crypto from 'crypto';
import { CacheError } from '../core/exceptions.js';

/**
 * Base cache class
 */
export class BaseCache {
    constructor(options = {}) {
        this.ttl = options.ttl || 3600000; // 1 hour default
        this.maxSize = options.maxSize || 1000;
        this.logger = console;
    }

    /**
     * Get item from cache
     */
    async get(key) {
        throw new Error('Method get() must be implemented');
    }

    /**
     * Set item in cache
     */
    async set(key, value, ttl = null) {
        throw new Error('Method set() must be implemented');
    }

    /**
     * Delete item from cache
     */
    async delete(key) {
        throw new Error('Method delete() must be implemented');
    }

    /**
     * Clear all items
     */
    async clear() {
        throw new Error('Method clear() must be implemented');
    }

    /**
     * Check if key exists
     */
    async has(key) {
        throw new Error('Method has() must be implemented');
    }

    /**
     * Get cache statistics
     */
    getStats() {
        throw new Error('Method getStats() must be implemented');
    }
}

/**
 * In-memory cache implementation
 */
export class MemoryCache extends BaseCache {
    constructor(options = {}) {
        super(options);
        this.cache = new Map();
        this.accessCount = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    async get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            this.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.accessCount.delete(key);
            this.misses++;
            return null;
        }

        // Update access count
        this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
        this.hits++;
        
        return item.value;
    }

    async set(key, value, ttl = null) {
        // Check size limit
        if (this.cache.size >= this.maxSize) {
            await this._evict();
        }

        const expiry = Date.now() + (ttl || this.ttl);
        
        this.cache.set(key, {
            value,
            expiry,
            created: Date.now()
        });
        
        this.accessCount.set(key, 0);
    }

    async delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.accessCount.delete(key);
        }
        return deleted;
    }

    async clear() {
        this.cache.clear();
        this.accessCount.clear();
        this.hits = 0;
        this.misses = 0;
    }

    async has(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            return false;
        }

        // Check if expired
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.accessCount.delete(key);
            return false;
        }

        return true;
    }

    getStats() {
        const totalRequests = this.hits + this.misses;
        const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
        
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: hitRate.toFixed(2) + '%',
            totalRequests
        };
    }

    /**
     * Evict least recently used items
     */
    async _evict() {
        // LRU eviction
        const sorted = Array.from(this.accessCount.entries())
            .sort((a, b) => a[1] - b[1]);
        
        // Remove 10% of cache
        const toRemove = Math.max(1, Math.floor(this.maxSize * 0.1));
        
        for (let i = 0; i < toRemove && i < sorted.length; i++) {
            const key = sorted[i][0];
            this.cache.delete(key);
            this.accessCount.delete(key);
        }
        
        this.logger.debug(`Evicted ${toRemove} items from cache`);
    }
}

/**
 * Distributed cache (mock implementation)
 */
export class DistributedCache extends BaseCache {
    constructor(options = {}) {
        super(options);
        this.nodes = options.nodes || ['localhost:6379'];
        this.connected = false;
        // In production, would use Redis or similar
        this.store = new Map();
    }

    async connect() {
        // Mock connection
        this.connected = true;
        this.logger.info(`Connected to cache nodes: ${this.nodes.join(', ')}`);
    }

    async disconnect() {
        this.connected = false;
        this.logger.info('Disconnected from cache');
    }

    async get(key) {
        if (!this.connected) {
            throw new CacheError('Cache not connected');
        }
        
        const item = this.store.get(key);
        
        if (!item || Date.now() > item.expiry) {
            return null;
        }
        
        return item.value;
    }

    async set(key, value, ttl = null) {
        if (!this.connected) {
            throw new CacheError('Cache not connected');
        }
        
        const expiry = Date.now() + (ttl || this.ttl);
        
        this.store.set(key, {
            value,
            expiry
        });
    }

    async delete(key) {
        if (!this.connected) {
            throw new CacheError('Cache not connected');
        }
        
        return this.store.delete(key);
    }

    async clear() {
        if (!this.connected) {
            throw new CacheError('Cache not connected');
        }
        
        this.store.clear();
    }

    async has(key) {
        if (!this.connected) {
            throw new CacheError('Cache not connected');
        }
        
        const item = this.store.get(key);
        return item && Date.now() <= item.expiry;
    }

    getStats() {
        return {
            size: this.store.size,
            connected: this.connected,
            nodes: this.nodes
        };
    }
}

/**
 * Cache with computation function
 */
export class ComputeCache extends MemoryCache {
    constructor(computeFn, options = {}) {
        super(options);
        this.computeFn = computeFn;
    }

    async getOrCompute(key, ...args) {
        // Check cache first
        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }

        // Compute value
        const value = await this.computeFn(...args);
        
        // Store in cache
        await this.set(key, value);
        
        return value;
    }
}

/**
 * Multi-level cache
 */
export class MultiLevelCache extends BaseCache {
    constructor(caches, options = {}) {
        super(options);
        this.caches = caches; // Array of caches, ordered by priority
    }

    async get(key) {
        for (let i = 0; i < this.caches.length; i++) {
            const value = await this.caches[i].get(key);
            
            if (value !== null) {
                // Populate higher priority caches
                for (let j = 0; j < i; j++) {
                    await this.caches[j].set(key, value);
                }
                
                return value;
            }
        }
        
        return null;
    }

    async set(key, value, ttl = null) {
        // Set in all caches
        const promises = this.caches.map(cache => 
            cache.set(key, value, ttl)
        );
        
        await Promise.all(promises);
    }

    async delete(key) {
        // Delete from all caches
        const promises = this.caches.map(cache => 
            cache.delete(key)
        );
        
        const results = await Promise.all(promises);
        return results.some(r => r);
    }

    async clear() {
        // Clear all caches
        const promises = this.caches.map(cache => 
            cache.clear()
        );
        
        await Promise.all(promises);
    }

    async has(key) {
        for (const cache of this.caches) {
            if (await cache.has(key)) {
                return true;
            }
        }
        
        return false;
    }

    getStats() {
        return {
            levels: this.caches.length,
            stats: this.caches.map((cache, i) => ({
                level: i,
                ...cache.getStats()
            }))
        };
    }
}

/**
 * Create cache key from object
 */
export function createCacheKey(obj) {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Cache decorator for functions
 */
export function cacheable(options = {}) {
    const cache = new MemoryCache(options);
    
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args) {
            const key = createCacheKey({ method: propertyKey, args });
            
            const cached = await cache.get(key);
            if (cached !== null) {
                return cached;
            }
            
            const result = await originalMethod.apply(this, args);
            await cache.set(key, result);
            
            return result;
        };
        
        return descriptor;
    };
}