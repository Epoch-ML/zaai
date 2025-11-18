"""
Base utility functions for the analytics platform.

Essential utilities for data manipulation, formatting, and common operations.
"""

import json
import time
import uuid
from functools import wraps
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, TypeVar, Union
import logging


T = TypeVar('T')


# Timing utilities

class Timer:
    """Context manager for timing code execution."""
    
    def __init__(self, name: str = "Operation"):
        self.name = name
        self.start_time = None
        self.elapsed = None
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.elapsed = time.perf_counter() - self.start_time
        print(f"{self.name} took {self.elapsed:.4f} seconds")


# Data manipulation

def flatten_dict(d: Dict[str, Any], separator: str = '.') -> Dict[str, Any]:
    """Flatten nested dictionary."""
    items = []
    
    def flatten(obj, parent_key=''):
        if isinstance(obj, dict):
            for k, v in obj.items():
                new_key = f"{parent_key}{separator}{k}" if parent_key else k
                flatten(v, new_key)
        else:
            items.append((parent_key, obj))
    
    flatten(d)
    return dict(items)


def deep_merge(dict1: Dict, dict2: Dict) -> Dict:
    """Deep merge two dictionaries."""
    result = dict1.copy()
    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def chunk_list(lst: List[T], chunk_size: int) -> Iterator[List[T]]:
    """Split list into chunks."""
    for i in range(0, len(lst), chunk_size):
        yield lst[i:i + chunk_size]


def safe_get(data: Dict, path: str, default: Any = None) -> Any:
    """Safely get nested dictionary value using dot notation."""
    keys = path.split('.')
    current = data
    
    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return default
    return current


# String utilities

def truncate(s: str, max_length: int, suffix: str = '...') -> str:
    """Truncate string to maximum length."""
    if len(s) <= max_length:
        return s
    return s[:max_length - len(suffix)] + suffix


def to_snake_case(s: str) -> str:
    """Convert string to snake_case."""
    import re
    s = re.sub('([A-Z]+)([A-Z][a-z])', r'\1_\2', s)
    s = re.sub('([a-z\d])([A-Z])', r'\1_\2', s)
    return s.replace('-', '_').lower()


def generate_id(prefix: str = '') -> str:
    """Generate unique ID."""
    uid = str(uuid.uuid4())[:8]
    return f"{prefix}_{uid}" if prefix else uid


# File utilities

def ensure_directory(path: Union[str, Path]) -> Path:
    """Ensure directory exists."""
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_json_file(path: Union[str, Path]) -> Any:
    """Read JSON file."""
    with open(path, 'r') as f:
        return json.load(f)


def write_json_file(data: Any, path: Union[str, Path]) -> None:
    """Write data to JSON file."""
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, default=str)


# Formatting

def format_bytes(num_bytes: int) -> str:
    """Format bytes in human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"


def format_duration(seconds: float) -> str:
    """Format duration in human-readable format."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{seconds/60:.1f}m"
    else:
        return f"{seconds/3600:.1f}h"


def format_percentage(value: float) -> str:
    """Format as percentage."""
    return f"{value * 100:.1f}%"


# Caching

class SimpleCache:
    """Simple in-memory cache with TTL."""
    
    def __init__(self, ttl_seconds: Optional[int] = None):
        self._cache = {}
        self.ttl = ttl_seconds
    
    def get(self, key: str, default: Any = None) -> Any:
        if key not in self._cache:
            return default
        
        value, timestamp = self._cache[key]
        if self.ttl and (time.time() - timestamp) > self.ttl:
            del self._cache[key]
            return default
        return value
    
    def set(self, key: str, value: Any) -> None:
        self._cache[key] = (value, time.time())
    
    def clear(self) -> None:
        self._cache.clear()


def memoize(func):
    """Simple memoization decorator."""
    cache = {}
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        key = str((args, tuple(sorted(kwargs.items()))))
        if key not in cache:
            cache[key] = func(*args, **kwargs)
        return cache[key]
    
    wrapper.cache = cache
    return wrapper


# Retry decorator

def retry(max_attempts: int = 3, delay: float = 1.0):
    """Retry decorator with exponential backoff."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts - 1:
                        raise
                    time.sleep(delay * (2 ** attempt))
        return wrapper
    return decorator


# Logging

def setup_logger(name: str, level: int = logging.INFO) -> logging.Logger:
    """Setup simple logger."""
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    return logger


# Math utilities

def safe_divide(num: float, denom: float, default: float = 0.0) -> float:
    """Safe division with zero handling."""
    return num / denom if denom != 0 else default


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp value between min and max."""
    return max(min_val, min(value, max_val))