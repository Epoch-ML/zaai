"""
Base utility functions and classes for the analytics platform.

This module provides common utilities used throughout the platform including
data manipulation, formatting, timing, and other helper functions.
"""

import hashlib
import json
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, TypeVar, Union
import logging
import sys


# Type variables
T = TypeVar('T')
F = TypeVar('F', bound=Callable[..., Any])


# Timing utilities

class Timer:
    """Context manager and decorator for timing code execution."""
    
    def __init__(self, name: str = "Operation", logger: Optional[logging.Logger] = None):
        """Initialize timer.
        
        Args:
            name: Name of the operation being timed
            logger: Logger for output (uses print if None)
        """
        self.name = name
        self.logger = logger
        self.start_time = None
        self.end_time = None
        self.elapsed = None
    
    def __enter__(self):
        """Start timing."""
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Stop timing and report."""
        self.end_time = time.perf_counter()
        self.elapsed = self.end_time - self.start_time
        
        message = f"{self.name} took {self.elapsed:.4f} seconds"
        if self.logger:
            self.logger.info(message)
        else:
            print(message)
    
    def __call__(self, func: F) -> F:
        """Use as decorator."""
        @wraps(func)
        def wrapper(*args, **kwargs):
            with Timer(f"{func.__name__}", self.logger):
                return func(*args, **kwargs)
        return wrapper


def time_function(func: F) -> F:
    """Decorator to time function execution.
    
    Args:
        func: Function to time
        
    Returns:
        Wrapped function
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.4f} seconds")
        return result
    return wrapper


# Data manipulation utilities

def flatten_dict(d: Dict[str, Any], parent_key: str = '', 
                 separator: str = '.') -> Dict[str, Any]:
    """Flatten nested dictionary.
    
    Args:
        d: Dictionary to flatten
        parent_key: Parent key for recursion
        separator: Separator between keys
        
    Returns:
        Flattened dictionary
    """
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{separator}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, separator=separator).items())
        else:
            items.append((new_key, v))
    return dict(items)


def unflatten_dict(d: Dict[str, Any], separator: str = '.') -> Dict[str, Any]:
    """Unflatten a dictionary with dot notation.
    
    Args:
        d: Flattened dictionary
        separator: Separator used in keys
        
    Returns:
        Nested dictionary
    """
    result = {}
    for key, value in d.items():
        keys = key.split(separator)
        current = result
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            current = current[k]
        current[keys[-1]] = value
    return result


def deep_merge(dict1: Dict, dict2: Dict) -> Dict:
    """Deep merge two dictionaries.
    
    Args:
        dict1: First dictionary
        dict2: Second dictionary (overwrites dict1)
        
    Returns:
        Merged dictionary
    """
    result = dict1.copy()
    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def chunk_list(lst: List[T], chunk_size: int) -> Iterator[List[T]]:
    """Split list into chunks.
    
    Args:
        lst: List to chunk
        chunk_size: Size of each chunk
        
    Yields:
        List chunks
    """
    for i in range(0, len(lst), chunk_size):
        yield lst[i:i + chunk_size]


def safe_get(data: Dict[str, Any], path: str, default: Any = None, 
             separator: str = '.') -> Any:
    """Safely get nested dictionary value.
    
    Args:
        data: Dictionary to search
        path: Dot-separated path to value
        default: Default if not found
        separator: Path separator
        
    Returns:
        Value at path or default
    """
    keys = path.split(separator)
    current = data
    
    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return default
    
    return current


def safe_set(data: Dict[str, Any], path: str, value: Any, 
             separator: str = '.') -> None:
    """Safely set nested dictionary value.
    
    Args:
        data: Dictionary to modify
        path: Dot-separated path to value
        value: Value to set
        separator: Path separator
    """
    keys = path.split(separator)
    current = data
    
    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        current = current[key]
    
    current[keys[-1]] = value


# String utilities

def truncate_string(s: str, max_length: int, suffix: str = '...') -> str:
    """Truncate string to maximum length.
    
    Args:
        s: String to truncate
        max_length: Maximum length
        suffix: Suffix to add if truncated
        
    Returns:
        Truncated string
    """
    if len(s) <= max_length:
        return s
    return s[:max_length - len(suffix)] + suffix


def to_snake_case(s: str) -> str:
    """Convert string to snake_case.
    
    Args:
        s: Input string
        
    Returns:
        snake_case string
    """
    import re
    # Replace hyphens with underscores
    s = s.replace('-', '_')
    # Insert underscores before capitals
    s = re.sub('([A-Z]+)([A-Z][a-z])', r'\1_\2', s)
    s = re.sub('([a-z\d])([A-Z])', r'\1_\2', s)
    # Convert to lowercase
    return s.lower()


def to_camel_case(s: str) -> str:
    """Convert string to camelCase.
    
    Args:
        s: Input string
        
    Returns:
        camelCase string
    """
    components = s.replace('-', '_').split('_')
    return components[0].lower() + ''.join(x.title() for x in components[1:])


def generate_id(prefix: str = '') -> str:
    """Generate unique ID.
    
    Args:
        prefix: Optional prefix
        
    Returns:
        Unique ID string
    """
    unique_id = str(uuid.uuid4())
    return f"{prefix}_{unique_id}" if prefix else unique_id


# File utilities

def ensure_directory(path: Union[str, Path]) -> Path:
    """Ensure directory exists.
    
    Args:
        path: Directory path
        
    Returns:
        Path object
    """
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_file_size_mb(path: Union[str, Path]) -> float:
    """Get file size in megabytes.
    
    Args:
        path: File path
        
    Returns:
        Size in MB
    """
    path = Path(path)
    if not path.exists():
        return 0.0
    return path.stat().st_size / (1024 * 1024)


def hash_file(path: Union[str, Path], algorithm: str = 'sha256') -> str:
    """Calculate file hash.
    
    Args:
        path: File path
        algorithm: Hash algorithm
        
    Returns:
        Hex digest
    """
    path = Path(path)
    hasher = hashlib.new(algorithm)
    
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            hasher.update(chunk)
    
    return hasher.hexdigest()


def read_json_file(path: Union[str, Path]) -> Any:
    """Read JSON file.
    
    Args:
        path: File path
        
    Returns:
        Parsed JSON data
    """
    with open(path, 'r') as f:
        return json.load(f)


def write_json_file(data: Any, path: Union[str, Path], indent: int = 2) -> None:
    """Write data to JSON file.
    
    Args:
        data: Data to write
        path: Output path
        indent: JSON indent level
    """
    with open(path, 'w') as f:
        json.dump(data, f, indent=indent, default=str)


# Formatting utilities

def format_bytes(num_bytes: int) -> str:
    """Format bytes in human-readable format.
    
    Args:
        num_bytes: Number of bytes
        
    Returns:
        Formatted string
    """
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.2f} PB"


def format_duration(seconds: float) -> str:
    """Format duration in human-readable format.
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        Formatted string
    """
    if seconds < 60:
        return f"{seconds:.2f} seconds"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.2f} minutes"
    elif seconds < 86400:
        hours = seconds / 3600
        return f"{hours:.2f} hours"
    else:
        days = seconds / 86400
        return f"{days:.2f} days"


def format_percentage(value: float, decimals: int = 2) -> str:
    """Format value as percentage.
    
    Args:
        value: Value (0.0 to 1.0)
        decimals: Number of decimal places
        
    Returns:
        Formatted percentage string
    """
    return f"{value * 100:.{decimals}f}%"


def format_number(num: float, decimals: Optional[int] = None) -> str:
    """Format number with thousands separator.
    
    Args:
        num: Number to format
        decimals: Number of decimal places
        
    Returns:
        Formatted number string
    """
    if decimals is not None:
        return f"{num:,.{decimals}f}"
    return f"{num:,}"


# Caching utilities

class SimpleCache:
    """Simple in-memory cache with TTL support."""
    
    def __init__(self, ttl_seconds: Optional[int] = None):
        """Initialize cache.
        
        Args:
            ttl_seconds: Time to live in seconds
        """
        self._cache: Dict[str, tuple] = {}
        self.ttl_seconds = ttl_seconds
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get value from cache.
        
        Args:
            key: Cache key
            default: Default if not found or expired
            
        Returns:
            Cached value or default
        """
        if key not in self._cache:
            return default
        
        value, timestamp = self._cache[key]
        
        if self.ttl_seconds:
            age = time.time() - timestamp
            if age > self.ttl_seconds:
                del self._cache[key]
                return default
        
        return value
    
    def set(self, key: str, value: Any) -> None:
        """Set value in cache.
        
        Args:
            key: Cache key
            value: Value to cache
        """
        self._cache[key] = (value, time.time())
    
    def delete(self, key: str) -> None:
        """Delete value from cache.
        
        Args:
            key: Cache key
        """
        self._cache.pop(key, None)
    
    def clear(self) -> None:
        """Clear all cached values."""
        self._cache.clear()
    
    def size(self) -> int:
        """Get cache size.
        
        Returns:
            Number of cached items
        """
        return len(self._cache)


def memoize(ttl_seconds: Optional[int] = None):
    """Decorator for memoizing function results.
    
    Args:
        ttl_seconds: Cache TTL in seconds
        
    Returns:
        Decorator function
    """
    cache = SimpleCache(ttl_seconds)
    
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create cache key from arguments
            key = str((args, tuple(sorted(kwargs.items()))))
            
            # Check cache
            result = cache.get(key)
            if result is not None:
                return result
            
            # Calculate and cache result
            result = func(*args, **kwargs)
            cache.set(key, result)
            return result
        
        wrapper.cache = cache
        return wrapper
    
    return decorator


# Retry utilities

def retry(max_attempts: int = 3, delay: float = 1.0, 
          backoff: float = 2.0, exceptions: tuple = (Exception,)):
    """Decorator for retrying functions.
    
    Args:
        max_attempts: Maximum retry attempts
        delay: Initial delay between retries
        backoff: Backoff multiplier
        exceptions: Exceptions to catch
        
    Returns:
        Decorator function
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_attempts - 1:
                        raise
                    
                    time.sleep(current_delay)
                    current_delay *= backoff
            
            return func(*args, **kwargs)
        
        return wrapper
    
    return decorator


# Context managers

@contextmanager
def suppress_output():
    """Context manager to suppress stdout/stderr."""
    import io
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    
    try:
        sys.stdout = io.StringIO()
        sys.stderr = io.StringIO()
        yield
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


@contextmanager
def temporary_env(**env_vars):
    """Context manager for temporary environment variables.
    
    Args:
        **env_vars: Environment variables to set
    """
    import os
    old_env = {}
    
    for key, value in env_vars.items():
        old_env[key] = os.environ.get(key)
        os.environ[key] = str(value)
    
    try:
        yield
    finally:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


# Validation utilities

def is_valid_email(email: str) -> bool:
    """Check if string is valid email.
    
    Args:
        email: Email string
        
    Returns:
        True if valid email
    """
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def is_valid_url(url: str) -> bool:
    """Check if string is valid URL.
    
    Args:
        url: URL string
        
    Returns:
        True if valid URL
    """
    import re
    pattern = r'^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)$'
    return bool(re.match(pattern, url))


def is_valid_json(s: str) -> bool:
    """Check if string is valid JSON.
    
    Args:
        s: JSON string
        
    Returns:
        True if valid JSON
    """
    try:
        json.loads(s)
        return True
    except (json.JSONDecodeError, TypeError):
        return False


# Logging utilities

def setup_logger(name: str, level: int = logging.INFO,
                format_string: Optional[str] = None) -> logging.Logger:
    """Setup logger with formatting.
    
    Args:
        name: Logger name
        level: Logging level
        format_string: Log format string
        
    Returns:
        Configured logger
    """
    if format_string is None:
        format_string = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(format_string)
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    return logger


@dataclass
class LogContext:
    """Context information for structured logging."""
    
    operation: str
    user: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    metadata: Dict[str, Any] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        result = {
            'operation': self.operation,
            'timestamp': datetime.now().isoformat()
        }
        
        if self.user:
            result['user'] = self.user
        if self.session_id:
            result['session_id'] = self.session_id
        if self.request_id:
            result['request_id'] = self.request_id
        if self.metadata:
            result['metadata'] = self.metadata
        
        return result


# Math utilities

def safe_divide(numerator: float, denominator: float, 
                default: float = 0.0) -> float:
    """Safe division with default for zero denominator.
    
    Args:
        numerator: Numerator
        denominator: Denominator
        default: Default value if denominator is zero
        
    Returns:
        Division result or default
    """
    if denominator == 0:
        return default
    return numerator / denominator


def clamp(value: float, min_value: float, max_value: float) -> float:
    """Clamp value between min and max.
    
    Args:
        value: Value to clamp
        min_value: Minimum value
        max_value: Maximum value
        
    Returns:
        Clamped value
    """
    return max(min_value, min(value, max_value))


def round_to_precision(value: float, precision: int) -> float:
    """Round to specific decimal precision.
    
    Args:
        value: Value to round
        precision: Decimal places
        
    Returns:
        Rounded value
    """
    return round(value, precision)