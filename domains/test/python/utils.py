"""
Utility functions for data processing pipeline.

This module contains helper functions, decorators, and utility classes
used throughout the data processing system.
"""

import time
import logging
import functools
import hashlib
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Union
from contextlib import contextmanager
from datetime import datetime, timedelta


# Configure module logger
logger = logging.getLogger(__name__)


def setup_logging(level: str = "INFO", verbose: bool = False) -> None:
    """Configure logging for the application.
    
    Args:
        level: Logging level string
        verbose: If True, use DEBUG level regardless of level parameter
    """
    if verbose:
        level = "DEBUG"
    
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    logger.info(f"Logging configured at {level} level")


def validate_input(path: Path) -> bool:
    """Validate that input file exists and is readable.
    
    Args:
        path: Path to validate
        
    Returns:
        True if path is valid and readable
    """
    if not path.exists():
        logger.error(f"Input file does not exist: {path}")
        return False
    
    if not path.is_file():
        logger.error(f"Input path is not a file: {path}")
        return False
    
    if not path.stat().st_size > 0:
        logger.error(f"Input file is empty: {path}")
        return False
    
    try:
        with open(path, 'r') as f:
            f.read(1)
    except (IOError, PermissionError) as e:
        logger.error(f"Cannot read input file: {e}")
        return False
    
    return True


def format_results(analysis: Dict[str, Any], elapsed_time: float) -> Dict[str, Any]:
    """Format analysis results for output.
    
    Args:
        analysis: Raw analysis dictionary
        elapsed_time: Processing time in seconds
        
    Returns:
        Formatted results dictionary
    """
    formatted = {
        'timestamp': datetime.now().isoformat(),
        'processing_time_seconds': round(elapsed_time, 3),
        'summary': f"Processed {analysis.get('total_records', 0)} records in {elapsed_time:.2f}s",
        'analysis': analysis
    }
    
    # Add performance metrics
    if analysis.get('total_records', 0) > 0:
        formatted['records_per_second'] = round(
            analysis['total_records'] / elapsed_time, 2
        )
    
    return formatted


class Timer:
    """Context manager for timing code execution."""
    
    def __init__(self):
        """Initialize timer."""
        self.start_time = None
        self.end_time = None
        self.elapsed = 0.0
    
    def __enter__(self):
        """Start timing."""
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Stop timing and calculate elapsed time."""
        self.end_time = time.perf_counter()
        self.elapsed = self.end_time - self.start_time
        
        if exc_type is not None:
            logger.error(f"Timer caught exception after {self.elapsed:.3f}s: {exc_val}")
    
    def checkpoint(self) -> float:
        """Get elapsed time without stopping timer.
        
        Returns:
            Elapsed time in seconds
        """
        if self.start_time is None:
            return 0.0
        return time.perf_counter() - self.start_time


def retry(max_attempts: int = 3, delay: float = 1.0, backoff: float = 2.0):
    """Decorator to retry function calls on failure.
    
    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff: Multiplier for delay after each retry
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        logger.warning(
                            f"{func.__name__} failed (attempt {attempt + 1}/{max_attempts}): {e}"
                        )
                        time.sleep(current_delay)
                        current_delay *= backoff
                    else:
                        logger.error(f"{func.__name__} failed after {max_attempts} attempts")
            
            raise last_exception
        
        return wrapper
    return decorator


def cached(ttl_seconds: Optional[int] = None):
    """Decorator to cache function results.
    
    Args:
        ttl_seconds: Time-to-live for cache entries in seconds (None = no expiry)
    """
    def decorator(func: Callable) -> Callable:
        cache = {}
        cache_times = {}
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Create cache key from arguments
            key = hashlib.md5(
                f"{args}{kwargs}".encode()
            ).hexdigest()
            
            # Check if cached value exists and is valid
            if key in cache:
                if ttl_seconds is None:
                    logger.debug(f"Cache hit for {func.__name__}")
                    return cache[key]
                
                if time.time() - cache_times[key] < ttl_seconds:
                    logger.debug(f"Cache hit for {func.__name__}")
                    return cache[key]
                else:
                    logger.debug(f"Cache expired for {func.__name__}")
                    del cache[key]
                    del cache_times[key]
            
            # Compute and cache result
            logger.debug(f"Cache miss for {func.__name__}")
            result = func(*args, **kwargs)
            cache[key] = result
            cache_times[key] = time.time()
            
            return result
        
        # Add cache management methods
        wrapper.clear_cache = lambda: cache.clear() or cache_times.clear()
        wrapper.cache_size = lambda: len(cache)
        
        return wrapper
    return decorator


@contextmanager
def temporary_directory(base_path: Optional[Path] = None):
    """Context manager for creating and cleaning up a temporary directory.
    
    Args:
        base_path: Base path for temporary directory (uses system temp if None)
        
    Yields:
        Path to temporary directory
    """
    import tempfile
    import shutil
    
    if base_path:
        base_path = Path(base_path)
        base_path.mkdir(parents=True, exist_ok=True)
        temp_dir = base_path / f"tmp_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        temp_dir.mkdir()
        created_dir = temp_dir
    else:
        created_dir = Path(tempfile.mkdtemp())
    
    try:
        logger.debug(f"Created temporary directory: {created_dir}")
        yield created_dir
    finally:
        if created_dir.exists():
            shutil.rmtree(created_dir)
            logger.debug(f"Cleaned up temporary directory: {created_dir}")


class RateLimiter:
    """Simple rate limiter for controlling operation frequency."""
    
    def __init__(self, max_calls: int, time_window: float):
        """Initialize rate limiter.
        
        Args:
            max_calls: Maximum number of calls allowed
            time_window: Time window in seconds
        """
        self.max_calls = max_calls
        self.time_window = time_window
        self.calls = []
    
    def allow(self) -> bool:
        """Check if operation is allowed under rate limit.
        
        Returns:
            True if operation is allowed
        """
        now = time.time()
        
        # Remove old calls outside the time window
        self.calls = [call_time for call_time in self.calls 
                     if now - call_time < self.time_window]
        
        # Check if we can make a new call
        if len(self.calls) < self.max_calls:
            self.calls.append(now)
            return True
        
        return False
    
    def wait_if_needed(self) -> None:
        """Wait if necessary to respect rate limit."""
        while not self.allow():
            time.sleep(0.1)


def chunk_data(data: list, chunk_size: int):
    """Generator to yield chunks of data.
    
    Args:
        data: List to chunk
        chunk_size: Size of each chunk
        
    Yields:
        Chunks of the specified size
    """
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]


def flatten_dict(d: Dict, parent_key: str = '', sep: str = '.') -> Dict:
    """Flatten nested dictionary.
    
    Args:
        d: Dictionary to flatten
        parent_key: Parent key for recursion
        sep: Separator for concatenated keys
        
    Returns:
        Flattened dictionary
    """
    items = []
    
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    
    return dict(items)


def deep_merge(dict1: Dict, dict2: Dict) -> Dict:
    """Deep merge two dictionaries.
    
    Args:
        dict1: First dictionary
        dict2: Second dictionary (values override dict1)
        
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