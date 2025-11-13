"""
Processing cache implementation for the processing module.

This module provides caching functionality to optimize repeated
data processing operations.
"""

import hashlib
import json
import pickle
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union
import logging

from core.base import BaseComponent
from core.exceptions import CacheError
from core.config import ProcessingConfig


@dataclass
class CacheEntry:
    """Represents a single cache entry."""
    
    key: str
    value: Any
    created_at: float
    accessed_at: float
    access_count: int = 0
    ttl: Optional[float] = None
    size_bytes: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def is_expired(self) -> bool:
        """Check if cache entry has expired.
        
        Returns:
            True if entry is expired
        """
        if self.ttl is None:
            return False
        return time.time() - self.created_at > self.ttl
    
    def touch(self) -> None:
        """Update access time and count."""
        self.accessed_at = time.time()
        self.access_count += 1


class CacheBackend:
    """Abstract base class for cache backends."""
    
    def __init__(self):
        """Initialize cache backend."""
        self.logger = logging.getLogger(self.__class__.__name__)
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None
        """
        raise NotImplementedError
    
    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Set value in cache.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds
        """
        raise NotImplementedError
    
    def delete(self, key: str) -> bool:
        """Delete value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key existed and was deleted
        """
        raise NotImplementedError
    
    def clear(self) -> None:
        """Clear all cache entries."""
        raise NotImplementedError
    
    def exists(self, key: str) -> bool:
        """Check if key exists in cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key exists
        """
        raise NotImplementedError


class MemoryCache(CacheBackend):
    """In-memory cache implementation."""
    
    def __init__(self, max_size: int = 1000, max_memory_mb: int = 100):
        """Initialize memory cache.
        
        Args:
            max_size: Maximum number of entries
            max_memory_mb: Maximum memory usage in MB
        """
        super().__init__()
        self.max_size = max_size
        self.max_memory_bytes = max_memory_mb * 1024 * 1024
        self.entries: Dict[str, CacheEntry] = {}
        self.total_size_bytes = 0
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if key not in self.entries:
            return None
        
        entry = self.entries[key]
        
        if entry.is_expired():
            self.delete(key)
            return None
        
        entry.touch()
        return entry.value
    
    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Set value in cache."""
        # Calculate size
        try:
            value_bytes = pickle.dumps(value)
            size_bytes = len(value_bytes)
        except:
            size_bytes = 0
        
        # Check if we need to evict entries
        if len(self.entries) >= self.max_size:
            self._evict_lru()
        
        if self.total_size_bytes + size_bytes > self.max_memory_bytes:
            self._evict_by_size(size_bytes)
        
        # Create entry
        entry = CacheEntry(
            key=key,
            value=value,
            created_at=time.time(),
            accessed_at=time.time(),
            ttl=ttl,
            size_bytes=size_bytes
        )
        
        # Update cache
        if key in self.entries:
            self.total_size_bytes -= self.entries[key].size_bytes
        
        self.entries[key] = entry
        self.total_size_bytes += size_bytes
    
    def delete(self, key: str) -> bool:
        """Delete value from cache."""
        if key in self.entries:
            self.total_size_bytes -= self.entries[key].size_bytes
            del self.entries[key]
            return True
        return False
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self.entries.clear()
        self.total_size_bytes = 0
    
    def exists(self, key: str) -> bool:
        """Check if key exists in cache."""
        if key not in self.entries:
            return False
        
        entry = self.entries[key]
        if entry.is_expired():
            self.delete(key)
            return False
        
        return True
    
    def _evict_lru(self) -> None:
        """Evict least recently used entry."""
        if not self.entries:
            return
        
        lru_key = min(self.entries, key=lambda k: self.entries[k].accessed_at)
        self.delete(lru_key)
        self.logger.debug(f"Evicted LRU entry: {lru_key}")
    
    def _evict_by_size(self, required_bytes: int) -> None:
        """Evict entries to free up space.
        
        Args:
            required_bytes: Bytes needed
        """
        # Sort by access time (LRU)
        sorted_keys = sorted(self.entries, key=lambda k: self.entries[k].accessed_at)
        
        for key in sorted_keys:
            if self.total_size_bytes + required_bytes <= self.max_memory_bytes:
                break
            self.delete(key)
            self.logger.debug(f"Evicted entry for size: {key}")


class FileCache(CacheBackend):
    """File-based cache implementation."""
    
    def __init__(self, cache_dir: Union[str, Path], max_files: int = 10000):
        """Initialize file cache.
        
        Args:
            cache_dir: Directory for cache files
            max_files: Maximum number of cache files
        """
        super().__init__()
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.max_files = max_files
        self.index_file = self.cache_dir / "_index.json"
        self.index = self._load_index()
    
    def _load_index(self) -> Dict[str, Dict]:
        """Load cache index from file."""
        if self.index_file.exists():
            try:
                with open(self.index_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    def _save_index(self) -> None:
        """Save cache index to file."""
        with open(self.index_file, 'w') as f:
            json.dump(self.index, f)
    
    def _get_cache_path(self, key: str) -> Path:
        """Get file path for cache key.
        
        Args:
            key: Cache key
            
        Returns:
            Path to cache file
        """
        # Hash key to create filename
        key_hash = hashlib.md5(key.encode()).hexdigest()
        return self.cache_dir / f"{key_hash}.cache"
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if key not in self.index:
            return None
        
        entry_info = self.index[key]
        
        # Check expiration
        if 'ttl' in entry_info:
            if time.time() - entry_info['created_at'] > entry_info['ttl']:
                self.delete(key)
                return None
        
        # Load from file
        cache_path = self._get_cache_path(key)
        if not cache_path.exists():
            del self.index[key]
            self._save_index()
            return None
        
        try:
            with open(cache_path, 'rb') as f:
                value = pickle.load(f)
            
            # Update access info
            self.index[key]['accessed_at'] = time.time()
            self.index[key]['access_count'] = self.index[key].get('access_count', 0) + 1
            self._save_index()
            
            return value
            
        except Exception as e:
            self.logger.error(f"Failed to load cache file for key {key}: {e}")
            self.delete(key)
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Set value in cache."""
        # Check file limit
        if len(self.index) >= self.max_files and key not in self.index:
            self._evict_lru()
        
        # Save to file
        cache_path = self._get_cache_path(key)
        
        try:
            with open(cache_path, 'wb') as f:
                pickle.dump(value, f)
            
            # Update index
            self.index[key] = {
                'created_at': time.time(),
                'accessed_at': time.time(),
                'access_count': 0,
                'file': str(cache_path.name)
            }
            
            if ttl is not None:
                self.index[key]['ttl'] = ttl
            
            self._save_index()
            
        except Exception as e:
            self.logger.error(f"Failed to save cache file for key {key}: {e}")
            raise CacheError(f"Failed to cache value: {e}", key=key, operation="set")
    
    def delete(self, key: str) -> bool:
        """Delete value from cache."""
        if key not in self.index:
            return False
        
        # Delete file
        cache_path = self._get_cache_path(key)
        if cache_path.exists():
            cache_path.unlink()
        
        # Update index
        del self.index[key]
        self._save_index()
        
        return True
    
    def clear(self) -> None:
        """Clear all cache entries."""
        # Delete all cache files
        for cache_file in self.cache_dir.glob("*.cache"):
            cache_file.unlink()
        
        # Clear index
        self.index.clear()
        self._save_index()
    
    def exists(self, key: str) -> bool:
        """Check if key exists in cache."""
        if key not in self.index:
            return False
        
        # Check expiration
        entry_info = self.index[key]
        if 'ttl' in entry_info:
            if time.time() - entry_info['created_at'] > entry_info['ttl']:
                self.delete(key)
                return False
        
        return self._get_cache_path(key).exists()
    
    def _evict_lru(self) -> None:
        """Evict least recently used entry."""
        if not self.index:
            return
        
        lru_key = min(self.index, key=lambda k: self.index[k].get('accessed_at', 0))
        self.delete(lru_key)
        self.logger.debug(f"Evicted LRU entry: {lru_key}")


class ProcessingCache(BaseComponent):
    """Main cache manager for processing operations."""
    
    def __init__(self, config: Optional[ProcessingConfig] = None,
                 backend: Optional[CacheBackend] = None):
        """Initialize processing cache.
        
        Args:
            config: Processing configuration
            backend: Cache backend to use
        """
        super().__init__()
        self.config = config or ProcessingConfig()
        
        if backend:
            self.backend = backend
        elif self.config.enable_caching:
            # Use memory cache by default
            self.backend = MemoryCache()
        else:
            # Null cache (no-op)
            self.backend = NullCache()
        
        self.stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'deletes': 0
        }
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None
        """
        value = self.backend.get(key)
        
        if value is not None:
            self.stats['hits'] += 1
            self.logger.debug(f"Cache hit: {key}")
        else:
            self.stats['misses'] += 1
            self.logger.debug(f"Cache miss: {key}")
        
        return value
    
    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Set value in cache.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds
        """
        if ttl is None:
            ttl = self.config.cache_ttl_seconds
        
        self.backend.set(key, value, ttl)
        self.stats['sets'] += 1
        self.logger.debug(f"Cached: {key}")
    
    def delete(self, key: str) -> bool:
        """Delete value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key existed and was deleted
        """
        result = self.backend.delete(key)
        if result:
            self.stats['deletes'] += 1
            self.logger.debug(f"Deleted from cache: {key}")
        return result
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self.backend.clear()
        self.logger.info("Cache cleared")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics.
        
        Returns:
            Cache statistics
        """
        total_requests = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0
        
        return {
            **self.stats,
            'hit_rate': hit_rate,
            'total_requests': total_requests
        }
    
    def cached_process(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with caching.
        
        Args:
            func: Function to execute
            *args: Function arguments
            **kwargs: Function keyword arguments
            
        Returns:
            Function result (from cache or execution)
        """
        # Generate cache key
        cache_key = self._generate_key(func.__name__, args, kwargs)
        
        # Check cache
        result = self.get(cache_key)
        if result is not None:
            return result
        
        # Execute function
        result = func(*args, **kwargs)
        
        # Cache result
        self.set(cache_key, result)
        
        return result
    
    def _generate_key(self, func_name: str, args: tuple, kwargs: dict) -> str:
        """Generate cache key from function call.
        
        Args:
            func_name: Function name
            args: Function arguments
            kwargs: Function keyword arguments
            
        Returns:
            Cache key
        """
        key_parts = [func_name]
        
        # Add arguments
        for arg in args:
            try:
                key_parts.append(str(arg))
            except:
                key_parts.append(str(type(arg)))
        
        # Add keyword arguments
        for k, v in sorted(kwargs.items()):
            try:
                key_parts.append(f"{k}={v}")
            except:
                key_parts.append(f"{k}={type(v)}")
        
        key_str = ":".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()
    
    def initialize(self) -> None:
        """Initialize cache."""
        self.logger.info("Cache initialized")
    
    def cleanup(self) -> None:
        """Cleanup cache resources."""
        if self.config.enable_caching:
            self.clear()
    
    def validate(self) -> bool:
        """Validate cache configuration."""
        return True


class NullCache(CacheBackend):
    """No-op cache implementation."""
    
    def get(self, key: str) -> Optional[Any]:
        """Always returns None."""
        return None
    
    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Does nothing."""
        pass
    
    def delete(self, key: str) -> bool:
        """Always returns False."""
        return False
    
    def clear(self) -> None:
        """Does nothing."""
        pass
    
    def exists(self, key: str) -> bool:
        """Always returns False."""
        return False


def cached(ttl: Optional[float] = None):
    """Decorator for caching function results.
    
    Args:
        ttl: Time-to-live for cache entries
    """
    def decorator(func: Callable) -> Callable:
        cache = ProcessingCache()
        
        def wrapper(*args, **kwargs):
            # Generate cache key
            key = cache._generate_key(func.__name__, args, kwargs)
            
            # Check cache
            result = cache.get(key)
            if result is not None:
                return result
            
            # Execute function
            result = func(*args, **kwargs)
            
            # Cache result
            cache.set(key, result, ttl)
            
            return result
        
        return wrapper
    
    return decorator