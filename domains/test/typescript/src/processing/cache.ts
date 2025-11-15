// src/processing/cache.ts
/**
 * Cache implementation for the processing module.
 */

import * as crypto from 'crypto';
import { CacheException } from '../core/exceptions.js';
import { getTimestamp } from '../core/base.js';
import type {
  ICache,
  CacheType,
  CacheConfig,
  CacheEntry,
  CacheStats,
  EvictionPolicy
} from './types.js';
import type { Nullable, Timestamp } from '../types.js';

/**
 * Abstract base cache
 */
export abstract class BaseCache<K = string, V = unknown> implements ICache<K, V> {
  protected readonly config: CacheConfig;
  protected hits = 0;
  protected misses = 0;
  protected evictions = 0;
  protected lastCleanup: Timestamp;

  constructor(config: CacheConfig = {}) {
    this.config = {
      type: CacheType.MEMORY,
      maxSize: 1000,
      ttl: 3600000, // 1 hour default
      evictionPolicy: EvictionPolicy.LRU,
      persistence: false,
      compressionEnabled: false,
      encryptionEnabled: false,
      ...config
    };
    this.lastCleanup = getTimestamp();
  }

  public abstract get(key: K): Promise<Nullable<V>>;
  public abstract set(key: K, value: V, ttl?: number): Promise<void>;
  public abstract delete(key: K): Promise<boolean>;
  public abstract has(key: K): Promise<boolean>;
  public abstract clear(): Promise<void>;
  public abstract size(): Promise<number>;
  public abstract keys(): Promise<K[]>;

  public getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    return {
      size: 0, // To be overridden
      maxSize: this.config.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0,
      evictions: this.evictions
    };
  }

  protected isExpired(entry: CacheEntry<V>): boolean {
    if (!entry.expiry) return false;
    return Number(getTimestamp()) > Number(entry.expiry);
  }

  protected createEntry(value: V, ttl?: number): CacheEntry<V> {
    const now = getTimestamp();
    const expiry = ttl || this.config.ttl;
    
    return {
      value,
      expiry: expiry ? (Number(now) + expiry) as Timestamp : undefined,
      hits: 0,
      misses: 0,
      lastAccess: now,
      createdAt: now
    };
  }
}

/**
 * In-memory cache implementation
 */
export class MemoryCache<K = string, V = unknown> extends BaseCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private accessOrder: K[] = []; // For LRU
  private accessCount: Map<K, number> = new Map(); // For LFU

  public async get(key: K): Promise<Nullable<V>> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      await this.delete(key);
      this.misses++;
      return null;
    }

    // Update access tracking
    this.updateAccessTracking(key);
    entry.hits++;
    entry.lastAccess = getTimestamp();
    this.hits++;
    
    return entry.value;
  }

  public async set(key: K, value: V, ttl?: number): Promise<void> {
    // Check if we need to evict
    if (!this.cache.has(key) && this.cache.size >= (this.config.maxSize || Infinity)) {
      await this.evict();
    }

    const entry = this.createEntry(value, ttl);
    this.cache.set(key, entry);
    this.updateAccessTracking(key);
  }

  public async delete(key: K): Promise<boolean> {
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      // Remove from access tracking
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessCount.delete(key);
    }
    
    return deleted;
  }

  public async has(key: K): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  public async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
    this.accessCount.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  public async size(): Promise<number> {
    return this.cache.size;
  }

  public async keys(): Promise<K[]> {
    return Array.from(this.cache.keys());
  }

  public async values(): Promise<V[]> {
    const values: V[] = [];
    
    for (const entry of this.cache.values()) {
      if (!this.isExpired(entry)) {
        values.push(entry.value);
      }
    }
    
    return values;
  }

  public async entries(): Promise<[K, V][]> {
    const entries: [K, V][] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isExpired(entry)) {
        entries.push([key, entry.value]);
      }
    }
    
    return entries;
  }

  public getStats(): CacheStats {
    const stats = super.getStats();
    stats.size = this.cache.size;
    
    // Calculate memory usage (rough estimate)
    let memoryUsage = 0;
    for (const entry of this.cache.values()) {
      memoryUsage += JSON.stringify(entry).length;
    }
    stats.memoryUsage = memoryUsage / 1024 / 1024; // Convert to MB
    
    return stats;
  }

  private updateAccessTracking(key: K): void {
    switch (this.config.evictionPolicy) {
      case EvictionPolicy.LRU:
        // Move to end of access order
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
          this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
        break;
      
      case EvictionPolicy.LFU:
        // Increment access count
        const count = this.accessCount.get(key) || 0;
        this.accessCount.set(key, count + 1);
        break;
      
      case EvictionPolicy.FIFO:
      case EvictionPolicy.LIFO:
        // No special tracking needed
        break;
    }
  }

  private async evict(): Promise<void> {
    let keyToEvict: K | undefined;

    switch (this.config.evictionPolicy) {
      case EvictionPolicy.LRU:
        keyToEvict = this.accessOrder.shift();
        break;
      
      case EvictionPolicy.LFU:
        // Find least frequently used
        let minCount = Infinity;
        for (const [key, count] of this.accessCount) {
          if (count < minCount) {
            minCount = count;
            keyToEvict = key;
          }
        }
        break;
      
      case EvictionPolicy.FIFO:
        // Evict first (oldest) entry
        keyToEvict = this.cache.keys().next().value;
        break;
      
      case EvictionPolicy.LIFO:
        // Evict last (newest) entry
        const keys = Array.from(this.cache.keys());
        keyToEvict = keys[keys.length - 1];
        break;
      
      case EvictionPolicy.RANDOM:
        // Random eviction
        const randomKeys = Array.from(this.cache.keys());
        keyToEvict = randomKeys[Math.floor(Math.random() * randomKeys.length)];
        break;
      
      case EvictionPolicy.TTL:
        // Evict expired entries first
        for (const [key, entry] of this.cache) {
          if (this.isExpired(entry)) {
            keyToEvict = key;
            break;
          }
        }
        // If no expired entries, fall back to LRU
        if (!keyToEvict) {
          keyToEvict = this.accessOrder.shift();
        }
        break;
    }

    if (keyToEvict !== undefined) {
      await this.delete(keyToEvict);
      this.evictions++;
    }
  }

  public async cleanup(): Promise<void> {
    const now = Number(getTimestamp());
    const keysToDelete: K[] = [];

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }

    this.lastCleanup = now as Timestamp;
  }
}

/**
 * LRU Cache implementation
 */
export class LRUCache<K = string, V = unknown> extends MemoryCache<K, V> {
  constructor(config: CacheConfig = {}) {
    super({
      ...config,
      evictionPolicy: EvictionPolicy.LRU
    });
  }
}

/**
 * LFU Cache implementation
 */
export class LFUCache<K = string, V = unknown> extends MemoryCache<K, V> {
  constructor(config: CacheConfig = {}) {
    super({
      ...config,
      evictionPolicy: EvictionPolicy.LFU
    });
  }
}

/**
 * TTL Cache implementation
 */
export class TTLCache<K = string, V = unknown> extends MemoryCache<K, V> {
  private cleanupInterval: NodeJS.Timer | null = null;

  constructor(config: CacheConfig = {}) {
    super({
      ...config,
      evictionPolicy: EvictionPolicy.TTL
    });

    // Start cleanup interval
    if (config.ttl) {
      this.cleanupInterval = setInterval(
        () => this.cleanup(),
        Math.min(config.ttl / 2, 60000) // Cleanup at half TTL or every minute
      );
    }
  }

  public async clear(): Promise<void> {
    await super.clear();
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Multi-level cache
 */
export class MultiLevelCache<K = string, V = unknown> implements ICache<K, V> {
  private caches: ICache<K, V>[];

  constructor(caches: ICache<K, V>[]) {
    if (caches.length === 0) {
      throw new CacheException('MultiLevelCache requires at least one cache');
    }
    this.caches = caches;
  }

  public async get(key: K): Promise<Nullable<V>> {
    for (let i = 0; i < this.caches.length; i++) {
      const value = await this.caches[i]!.get(key);
      
      if (value !== null) {
        // Populate higher priority caches
        for (let j = 0; j < i; j++) {
          await this.caches[j]!.set(key, value);
        }
        return value;
      }
    }
    
    return null;
  }

  public async set(key: K, value: V, ttl?: number): Promise<void> {
    // Set in all caches
    await Promise.all(
      this.caches.map(cache => cache.set(key, value, ttl))
    );
  }

  public async delete(key: K): Promise<boolean> {
    // Delete from all caches
    const results = await Promise.all(
      this.caches.map(cache => cache.delete(key))
    );
    return results.some(r => r);
  }

  public async has(key: K): Promise<boolean> {
    for (const cache of this.caches) {
      if (await cache.has(key)) {
        return true;
      }
    }
    return false;
  }

  public async clear(): Promise<void> {
    await Promise.all(
      this.caches.map(cache => cache.clear())
    );
  }

  public async size(): Promise<number> {
    // Return size of first level cache
    return this.caches[0]!.size();
  }

  public async keys(): Promise<K[]> {
    // Return keys from first level cache
    return this.caches[0]!.keys();
  }

  public getStats(): CacheStats {
    // Aggregate stats from all levels
    const stats: CacheStats = {
      size: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0
    };

    for (const cache of this.caches) {
      const levelStats = cache.getStats();
      stats.hits += levelStats.hits;
      stats.misses += levelStats.misses;
      stats.evictions += levelStats.evictions;
    }

    const totalRequests = stats.hits + stats.misses;
    stats.hitRate = totalRequests > 0 ? (stats.hits / totalRequests) * 100 : 0;

    return stats;
  }
}

/**
 * Cache factory
 */
export class CacheFactory {
  private static caches: Map<string, ICache<any, any>> = new Map();

  public static create<K = string, V = unknown>(
    type: CacheType,
    config?: CacheConfig
  ): ICache<K, V> {
    switch (type) {
      case CacheType.MEMORY:
        return new MemoryCache<K, V>(config);
      
      case CacheType.LRU:
        return new LRUCache<K, V>(config);
      
      case CacheType.LFU:
        return new LFUCache<K, V>(config);
      
      case CacheType.TTL:
        return new TTLCache<K, V>(config);
      
      default:
        throw new CacheException(`Unknown cache type: ${type}`);
    }
  }

  public static getOrCreate<K = string, V = unknown>(
    name: string,
    type: CacheType,
    config?: CacheConfig
  ): ICache<K, V> {
    if (!this.caches.has(name)) {
      this.caches.set(name, this.create<K, V>(type, config));
    }
    
    return this.caches.get(name)!;
  }

  public static destroy(name: string): void {
    const cache = this.caches.get(name);
    if (cache) {
      cache.clear();
      this.caches.delete(name);
    }
  }

  public static destroyAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    this.caches.clear();
  }
}