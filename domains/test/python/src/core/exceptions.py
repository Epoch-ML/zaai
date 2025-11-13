"""
Custom exceptions for the analytics platform.

This module defines all custom exceptions used throughout the platform
to provide clear error handling and debugging information.
"""

from typing import Any, Dict, Optional


class PlatformError(Exception):
    """Base exception for all platform-specific errors."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        """Initialize platform error.
        
        Args:
            message: Error message
            details: Additional error details
        """
        super().__init__(message)
        self.message = message
        self.details = details or {}
    
    def __str__(self) -> str:
        """String representation of the error."""
        if self.details:
            return f"{self.message} - Details: {self.details}"
        return self.message


class ConfigurationError(PlatformError):
    """Raised when configuration is invalid or missing."""
    
    def __init__(self, message: str, config_key: Optional[str] = None):
        """Initialize configuration error.
        
        Args:
            message: Error message
            config_key: Configuration key that caused the error
        """
        details = {"config_key": config_key} if config_key else {}
        super().__init__(message, details)


class ValidationError(PlatformError):
    """Raised when data validation fails."""
    
    def __init__(self, message: str, field: Optional[str] = None, value: Any = None):
        """Initialize validation error.
        
        Args:
            message: Error message
            field: Field that failed validation
            value: Invalid value
        """
        details = {}
        if field:
            details["field"] = field
        if value is not None:
            details["value"] = value
        super().__init__(message, details)


class DataIngestionError(PlatformError):
    """Raised when data ingestion fails."""
    
    def __init__(self, message: str, source: Optional[str] = None, 
                 format: Optional[str] = None):
        """Initialize data ingestion error.
        
        Args:
            message: Error message
            source: Data source that failed
            format: Data format involved
        """
        details = {}
        if source:
            details["source"] = source
        if format:
            details["format"] = format
        super().__init__(message, details)


class ProcessingError(PlatformError):
    """Raised when data processing fails."""
    
    def __init__(self, message: str, processor: Optional[str] = None,
                 stage: Optional[str] = None):
        """Initialize processing error.
        
        Args:
            message: Error message
            processor: Processor that failed
            stage: Processing stage where failure occurred
        """
        details = {}
        if processor:
            details["processor"] = processor
        if stage:
            details["stage"] = stage
        super().__init__(message, details)


class TransformationError(ProcessingError):
    """Raised when data transformation fails."""
    
    def __init__(self, message: str, transformer: Optional[str] = None,
                 input_type: Optional[str] = None, output_type: Optional[str] = None):
        """Initialize transformation error.
        
        Args:
            message: Error message
            transformer: Transformer that failed
            input_type: Expected input type
            output_type: Expected output type
        """
        super().__init__(message, processor=transformer)
        if input_type:
            self.details["input_type"] = input_type
        if output_type:
            self.details["output_type"] = output_type


class PipelineError(PlatformError):
    """Raised when pipeline execution fails."""
    
    def __init__(self, message: str, pipeline_name: Optional[str] = None,
                 step: Optional[int] = None, step_name: Optional[str] = None):
        """Initialize pipeline error.
        
        Args:
            message: Error message
            pipeline_name: Name of the failed pipeline
            step: Step number where failure occurred
            step_name: Name of the failed step
        """
        details = {}
        if pipeline_name:
            details["pipeline"] = pipeline_name
        if step is not None:
            details["step_number"] = step
        if step_name:
            details["step_name"] = step_name
        super().__init__(message, details)


class CacheError(PlatformError):
    """Raised when cache operations fail."""
    
    def __init__(self, message: str, key: Optional[str] = None,
                 operation: Optional[str] = None):
        """Initialize cache error.
        
        Args:
            message: Error message
            key: Cache key involved
            operation: Operation that failed (get/set/delete)
        """
        details = {}
        if key:
            details["key"] = key
        if operation:
            details["operation"] = operation
        super().__init__(message, details)


class VisualizationError(PlatformError):
    """Raised when visualization generation fails."""
    
    def __init__(self, message: str, chart_type: Optional[str] = None,
                 export_format: Optional[str] = None):
        """Initialize visualization error.
        
        Args:
            message: Error message
            chart_type: Type of chart that failed
            export_format: Export format that failed
        """
        details = {}
        if chart_type:
            details["chart_type"] = chart_type
        if export_format:
            details["export_format"] = export_format
        super().__init__(message, details)


class SchemaError(ValidationError):
    """Raised when schema validation or operations fail."""
    
    def __init__(self, message: str, schema_name: Optional[str] = None,
                 expected_type: Optional[str] = None, actual_type: Optional[str] = None):
        """Initialize schema error.
        
        Args:
            message: Error message
            schema_name: Name of the schema
            expected_type: Expected data type
            actual_type: Actual data type received
        """
        super().__init__(message)
        if schema_name:
            self.details["schema"] = schema_name
        if expected_type:
            self.details["expected_type"] = expected_type
        if actual_type:
            self.details["actual_type"] = actual_type


class ConnectionError(DataIngestionError):
    """Raised when connection to data source fails."""
    
    def __init__(self, message: str, host: Optional[str] = None,
                 port: Optional[int] = None, protocol: Optional[str] = None):
        """Initialize connection error.
        
        Args:
            message: Error message
            host: Host that failed to connect
            port: Port number
            protocol: Connection protocol
        """
        super().__init__(message)
        if host:
            self.details["host"] = host
        if port:
            self.details["port"] = port
        if protocol:
            self.details["protocol"] = protocol


class TimeoutError(PlatformError):
    """Raised when an operation times out."""
    
    def __init__(self, message: str, operation: Optional[str] = None,
                 timeout_seconds: Optional[float] = None):
        """Initialize timeout error.
        
        Args:
            message: Error message
            operation: Operation that timed out
            timeout_seconds: Timeout duration in seconds
        """
        details = {}
        if operation:
            details["operation"] = operation
        if timeout_seconds:
            details["timeout_seconds"] = timeout_seconds
        super().__init__(message, details)


class ResourceError(PlatformError):
    """Raised when resource limits are exceeded."""
    
    def __init__(self, message: str, resource_type: Optional[str] = None,
                 limit: Optional[Any] = None, current: Optional[Any] = None):
        """Initialize resource error.
        
        Args:
            message: Error message
            resource_type: Type of resource (memory, disk, etc.)
            limit: Resource limit
            current: Current resource usage
        """
        details = {}
        if resource_type:
            details["resource_type"] = resource_type
        if limit is not None:
            details["limit"] = limit
        if current is not None:
            details["current"] = current
        super().__init__(message, details)


def handle_platform_error(func):
    """Decorator to handle platform errors gracefully.
    
    Args:
        func: Function to decorate
        
    Returns:
        Decorated function
    """
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except PlatformError as e:
            # Log the platform error with details
            import logging
            logger = logging.getLogger(func.__module__)
            logger.error(f"Platform error in {func.__name__}: {e}")
            raise
        except Exception as e:
            # Wrap unexpected errors in PlatformError
            import logging
            logger = logging.getLogger(func.__module__)
            logger.error(f"Unexpected error in {func.__name__}: {e}")
            raise PlatformError(f"Unexpected error in {func.__name__}: {str(e)}")
    
    return wrapper