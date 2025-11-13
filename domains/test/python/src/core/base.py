"""
Base classes and interfaces for the analytics platform.

This module provides abstract base classes and common interfaces
that are used throughout the platform to ensure consistency.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, TypeVar, Generic, Union
import logging
import uuid


# Type variables for generics
T = TypeVar('T')
TData = TypeVar('TData')


class Status(Enum):
    """Status enumeration for operations."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DataFormat(Enum):
    """Supported data formats."""
    JSON = "json"
    CSV = "csv"
    PARQUET = "parquet"
    XML = "xml"
    EXCEL = "excel"
    TEXT = "text"
    BINARY = "binary"


@dataclass
class Metadata:
    """Common metadata for all platform objects."""
    
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    tags: List[str] = field(default_factory=list)
    properties: Dict[str, Any] = field(default_factory=dict)
    
    def update_timestamp(self) -> None:
        """Update the modification timestamp."""
        self.updated_at = datetime.now()
    
    def add_tag(self, tag: str) -> None:
        """Add a tag if not already present."""
        if tag not in self.tags:
            self.tags.append(tag)
            self.update_timestamp()
    
    def set_property(self, key: str, value: Any) -> None:
        """Set a custom property."""
        self.properties[key] = value
        self.update_timestamp()


class BaseComponent(ABC):
    """Abstract base class for all platform components."""
    
    def __init__(self, metadata: Optional[Metadata] = None):
        """Initialize component with metadata.
        
        Args:
            metadata: Component metadata
        """
        self.metadata = metadata or Metadata()
        self.logger = logging.getLogger(self.__class__.__name__)
        self._initialized = False
    
    @abstractmethod
    def initialize(self) -> None:
        """Initialize the component."""
        pass
    
    @abstractmethod
    def validate(self) -> bool:
        """Validate component configuration.
        
        Returns:
            True if component is valid
        """
        pass
    
    @abstractmethod
    def cleanup(self) -> None:
        """Cleanup resources used by the component."""
        pass
    
    def __enter__(self):
        """Context manager entry."""
        if not self._initialized:
            self.initialize()
            self._initialized = True
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.cleanup()
        self._initialized = False


class DataContainer(Generic[TData], ABC):
    """Abstract container for data with type safety."""
    
    def __init__(self, data: Optional[TData] = None):
        """Initialize container with optional data.
        
        Args:
            data: Initial data
        """
        self._data = data
        self._metadata = Metadata()
    
    @abstractmethod
    def transform(self, transformer: 'BaseTransformer') -> 'DataContainer':
        """Apply a transformation to the data.
        
        Args:
            transformer: Transformer to apply
            
        Returns:
            New container with transformed data
        """
        pass
    
    @abstractmethod
    def validate_schema(self) -> bool:
        """Validate data against expected schema.
        
        Returns:
            True if data matches schema
        """
        pass
    
    @property
    def data(self) -> Optional[TData]:
        """Get the underlying data."""
        return self._data
    
    @data.setter
    def data(self, value: TData) -> None:
        """Set the underlying data."""
        self._data = value
        self._metadata.update_timestamp()
    
    @property
    def metadata(self) -> Metadata:
        """Get container metadata."""
        return self._metadata
    
    def is_empty(self) -> bool:
        """Check if container is empty.
        
        Returns:
            True if container has no data
        """
        return self._data is None


class BaseTransformer(ABC):
    """Abstract base class for data transformers."""
    
    def __init__(self, name: str = ""):
        """Initialize transformer.
        
        Args:
            name: Transformer name
        """
        self.name = name or self.__class__.__name__
        self.logger = logging.getLogger(self.name)
    
    @abstractmethod
    def transform(self, data: Any) -> Any:
        """Transform input data.
        
        Args:
            data: Input data
            
        Returns:
            Transformed data
        """
        pass
    
    @abstractmethod
    def can_transform(self, data: Any) -> bool:
        """Check if transformer can handle the data.
        
        Args:
            data: Data to check
            
        Returns:
            True if transformer can process the data
        """
        pass
    
    def __call__(self, data: Any) -> Any:
        """Make transformer callable.
        
        Args:
            data: Input data
            
        Returns:
            Transformed data
        """
        if not self.can_transform(data):
            raise ValueError(f"{self.name} cannot transform data of type {type(data)}")
        return self.transform(data)


class BaseProcessor(ABC):
    """Abstract base class for data processors."""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize processor with configuration.
        
        Args:
            config: Processor configuration
        """
        self.config = config or {}
        self.logger = logging.getLogger(self.__class__.__name__)
        self._status = Status.PENDING
        self._metrics: Dict[str, Any] = {}
    
    @abstractmethod
    def process(self, input_data: Any) -> Any:
        """Process input data.
        
        Args:
            input_data: Data to process
            
        Returns:
            Processed data
        """
        pass
    
    @abstractmethod
    def get_capabilities(self) -> List[str]:
        """Get list of processor capabilities.
        
        Returns:
            List of capability identifiers
        """
        pass
    
    @property
    def status(self) -> Status:
        """Get processor status."""
        return self._status
    
    def set_status(self, status: Status) -> None:
        """Set processor status.
        
        Args:
            status: New status
        """
        self._status = status
        self.logger.debug(f"Status changed to {status.value}")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get processing metrics.
        
        Returns:
            Dictionary of metrics
        """
        return self._metrics.copy()
    
    def record_metric(self, key: str, value: Any) -> None:
        """Record a processing metric.
        
        Args:
            key: Metric key
            value: Metric value
        """
        self._metrics[key] = value


class Observable:
    """Mixin for observable objects with event support."""
    
    def __init__(self):
        """Initialize observable."""
        self._observers: Dict[str, List] = {}
    
    def subscribe(self, event: str, callback) -> None:
        """Subscribe to an event.
        
        Args:
            event: Event name
            callback: Callback function
        """
        if event not in self._observers:
            self._observers[event] = []
        self._observers[event].append(callback)
    
    def unsubscribe(self, event: str, callback) -> None:
        """Unsubscribe from an event.
        
        Args:
            event: Event name
            callback: Callback function
        """
        if event in self._observers:
            self._observers[event].remove(callback)
    
    def notify(self, event: str, *args, **kwargs) -> None:
        """Notify all subscribers of an event.
        
        Args:
            event: Event name
            args: Positional arguments for callbacks
            kwargs: Keyword arguments for callbacks
        """
        if event in self._observers:
            for callback in self._observers[event]:
                try:
                    callback(*args, **kwargs)
                except Exception as e:
                    logging.error(f"Error in observer callback: {e}")