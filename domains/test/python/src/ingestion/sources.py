"""
Data source definitions for the ingestion module.

This module defines various data sources that can be ingested
by the platform, including files, databases, and APIs.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Union
import logging

from core.base import BaseComponent, Metadata, DataFormat
from core.exceptions import DataIngestionError, ConnectionError
from core.config import IngestionConfig


class SourceType(Enum):
    """Types of data sources."""
    FILE = "file"
    DATABASE = "database"
    API = "api"
    STREAM = "stream"
    MEMORY = "memory"


@dataclass
class SourceCredentials:
    """Credentials for data source access."""
    
    username: Optional[str] = None
    password: Optional[str] = None
    api_key: Optional[str] = None
    token: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    extra: Dict[str, Any] = None
    
    def __post_init__(self):
        """Initialize extra dictionary."""
        if self.extra is None:
            self.extra = {}
    
    def mask_sensitive(self) -> Dict[str, Any]:
        """Get credentials with sensitive data masked.
        
        Returns:
            Dictionary with masked sensitive values
        """
        masked = {}
        
        if self.username:
            masked['username'] = self.username
        if self.password:
            masked['password'] = '***'
        if self.api_key:
            masked['api_key'] = f"{self.api_key[:4]}...{self.api_key[-4:]}" if len(self.api_key) > 8 else '***'
        if self.token:
            masked['token'] = '***'
        if self.host:
            masked['host'] = self.host
        if self.port:
            masked['port'] = self.port
        if self.database:
            masked['database'] = self.database
        
        return masked


class DataSource(BaseComponent):
    """Abstract base class for data sources."""
    
    def __init__(self, name: str, source_type: SourceType,
                 config: Optional[IngestionConfig] = None,
                 credentials: Optional[SourceCredentials] = None):
        """Initialize data source.
        
        Args:
            name: Source name
            source_type: Type of source
            config: Ingestion configuration
            credentials: Source credentials
        """
        metadata = Metadata(name=name, description=f"{source_type.value} data source")
        super().__init__(metadata)
        
        self.source_type = source_type
        self.config = config or IngestionConfig()
        self.credentials = credentials
        self._connected = False
    
    @abstractmethod
    def connect(self) -> None:
        """Establish connection to the data source.
        
        Raises:
            ConnectionError: If connection fails
        """
        pass
    
    @abstractmethod
    def disconnect(self) -> None:
        """Close connection to the data source."""
        pass
    
    @abstractmethod
    def read(self, **kwargs) -> Iterator[Dict[str, Any]]:
        """Read data from the source.
        
        Args:
            **kwargs: Additional read parameters
            
        Yields:
            Data records as dictionaries
        """
        pass
    
    @abstractmethod
    def get_schema(self) -> Dict[str, Any]:
        """Get schema information for the data source.
        
        Returns:
            Schema dictionary
        """
        pass
    
    def initialize(self) -> None:
        """Initialize the data source."""
        self.connect()
    
    def cleanup(self) -> None:
        """Cleanup data source resources."""
        if self._connected:
            self.disconnect()
    
    def validate(self) -> bool:
        """Validate data source configuration.
        
        Returns:
            True if configuration is valid
        """
        return self.config.validate()
    
    def is_connected(self) -> bool:
        """Check if source is connected.
        
        Returns:
            True if connected
        """
        return self._connected


class FileSource(DataSource):
    """Data source for file-based data."""
    
    def __init__(self, file_path: Union[str, Path], 
                 format: Optional[DataFormat] = None,
                 config: Optional[IngestionConfig] = None):
        """Initialize file source.
        
        Args:
            file_path: Path to file
            format: File format
            config: Ingestion configuration
        """
        self.file_path = Path(file_path)
        
        # Auto-detect format from extension if not provided
        if format is None:
            ext = self.file_path.suffix.lower()[1:]  # Remove the dot
            try:
                format = DataFormat[ext.upper()]
            except KeyError:
                format = DataFormat.TEXT
        
        self.format = format
        
        super().__init__(
            name=f"file:{self.file_path.name}",
            source_type=SourceType.FILE,
            config=config
        )
    
    def connect(self) -> None:
        """Verify file exists and is accessible.
        
        Raises:
            ConnectionError: If file cannot be accessed
        """
        if not self.file_path.exists():
            raise ConnectionError(f"File not found: {self.file_path}")
        
        if not self.file_path.is_file():
            raise ConnectionError(f"Path is not a file: {self.file_path}")
        
        # Check file size
        size_mb = self.file_path.stat().st_size / (1024 * 1024)
        if size_mb > self.config.max_file_size_mb:
            raise ConnectionError(
                f"File size {size_mb:.2f}MB exceeds maximum "
                f"{self.config.max_file_size_mb}MB"
            )
        
        self._connected = True
        self.logger.info(f"Connected to file source: {self.file_path}")
    
    def disconnect(self) -> None:
        """Disconnect from file source."""
        self._connected = False
        self.logger.debug(f"Disconnected from file source: {self.file_path}")
    
    def read(self, **kwargs) -> Iterator[Dict[str, Any]]:
        """Read data from file.
        
        Args:
            **kwargs: Additional read parameters
            
        Yields:
            Data records as dictionaries
        """
        if not self._connected:
            raise DataIngestionError("Source not connected", source=str(self.file_path))
        
        # Import parser for the file format
        from .parsers import get_parser
        
        parser = get_parser(self.format)
        
        with open(self.file_path, 'r', encoding=self.config.encoding) as f:
            for record in parser.parse(f, self.config):
                yield record
    
    def get_schema(self) -> Dict[str, Any]:
        """Get schema for file data.
        
        Returns:
            Schema dictionary
        """
        # Import schema detector
        from .schema import detect_schema
        
        # Read sample of data to detect schema
        sample = []
        for i, record in enumerate(self.read()):
            sample.append(record)
            if i >= 100:  # Sample first 100 records
                break
        
        return detect_schema(sample)


class DatabaseSource(DataSource):
    """Data source for database connections."""
    
    def __init__(self, connection_string: str,
                 query: Optional[str] = None,
                 table: Optional[str] = None,
                 config: Optional[IngestionConfig] = None,
                 credentials: Optional[SourceCredentials] = None):
        """Initialize database source.
        
        Args:
            connection_string: Database connection string
            query: SQL query to execute
            table: Table name to read from
            config: Ingestion configuration
            credentials: Database credentials
        """
        self.connection_string = connection_string
        self.query = query
        self.table = table
        self.connection = None
        
        super().__init__(
            name=f"db:{table or 'query'}",
            source_type=SourceType.DATABASE,
            config=config,
            credentials=credentials
        )
    
    def connect(self) -> None:
        """Connect to database.
        
        Raises:
            ConnectionError: If connection fails
        """
        try:
            # Simplified connection logic
            # In production, would use actual database driver
            self.logger.info(f"Connecting to database: {self.connection_string}")
            
            # Mock connection
            self.connection = {
                'string': self.connection_string,
                'credentials': self.credentials.mask_sensitive() if self.credentials else {}
            }
            
            self._connected = True
            self.logger.info("Database connection established")
            
        except Exception as e:
            raise ConnectionError(
                f"Failed to connect to database: {e}",
                host=self.credentials.host if self.credentials else None
            )
    
    def disconnect(self) -> None:
        """Disconnect from database."""
        if self.connection:
            self.logger.info("Closing database connection")
            self.connection = None
            self._connected = False
    
    def read(self, **kwargs) -> Iterator[Dict[str, Any]]:
        """Read data from database.
        
        Args:
            **kwargs: Additional read parameters
            
        Yields:
            Data records as dictionaries
        """
        if not self._connected:
            raise DataIngestionError("Database not connected")
        
        # Simplified read logic
        # In production, would execute actual SQL query
        
        if self.query:
            self.logger.info(f"Executing query: {self.query[:100]}...")
        elif self.table:
            self.logger.info(f"Reading from table: {self.table}")
        
        # Mock data generation
        for i in range(10):  # Generate 10 mock records
            yield {
                'id': i,
                'value': f"data_{i}",
                'source': 'database'
            }
    
    def get_schema(self) -> Dict[str, Any]:
        """Get database schema.
        
        Returns:
            Schema dictionary
        """
        if not self._connected:
            raise DataIngestionError("Database not connected")
        
        # Mock schema
        return {
            'fields': [
                {'name': 'id', 'type': 'integer', 'nullable': False},
                {'name': 'value', 'type': 'string', 'nullable': True},
                {'name': 'source', 'type': 'string', 'nullable': True}
            ],
            'primary_key': ['id']
        }


class APISource(DataSource):
    """Data source for API endpoints."""
    
    def __init__(self, endpoint: str,
                 method: str = "GET",
                 headers: Optional[Dict[str, str]] = None,
                 params: Optional[Dict[str, Any]] = None,
                 config: Optional[IngestionConfig] = None,
                 credentials: Optional[SourceCredentials] = None):
        """Initialize API source.
        
        Args:
            endpoint: API endpoint URL
            method: HTTP method
            headers: Request headers
            params: Query parameters
            config: Ingestion configuration
            credentials: API credentials
        """
        self.endpoint = endpoint
        self.method = method.upper()
        self.headers = headers or {}
        self.params = params or {}
        
        super().__init__(
            name=f"api:{endpoint}",
            source_type=SourceType.API,
            config=config,
            credentials=credentials
        )
    
    def connect(self) -> None:
        """Establish API connection.
        
        Raises:
            ConnectionError: If connection fails
        """
        # Add authentication headers if credentials provided
        if self.credentials:
            if self.credentials.api_key:
                self.headers['X-API-Key'] = self.credentials.api_key
            elif self.credentials.token:
                self.headers['Authorization'] = f"Bearer {self.credentials.token}"
        
        # Test connection with a simple request
        try:
            self.logger.info(f"Testing API connection to {self.endpoint}")
            # In production, would make actual HTTP request
            self._connected = True
            self.logger.info("API connection established")
        except Exception as e:
            raise ConnectionError(f"Failed to connect to API: {e}", host=self.endpoint)
    
    def disconnect(self) -> None:
        """Disconnect from API."""
        self._connected = False
        self.logger.debug(f"Disconnected from API: {self.endpoint}")
    
    def read(self, **kwargs) -> Iterator[Dict[str, Any]]:
        """Read data from API.
        
        Args:
            **kwargs: Additional read parameters
            
        Yields:
            Data records as dictionaries
        """
        if not self._connected:
            raise DataIngestionError("API not connected", source=self.endpoint)
        
        # Mock API response
        # In production, would make actual HTTP requests with pagination
        
        page = 1
        while page <= 3:  # Mock 3 pages of data
            self.logger.debug(f"Fetching page {page} from API")
            
            # Mock response data
            for i in range(5):  # 5 records per page
                yield {
                    'id': f"api_{page}_{i}",
                    'data': f"value_{page}_{i}",
                    'timestamp': '2024-01-01T00:00:00Z'
                }
            
            page += 1
    
    def get_schema(self) -> Dict[str, Any]:
        """Get API response schema.
        
        Returns:
            Schema dictionary
        """
        # Mock schema based on expected API response
        return {
            'fields': [
                {'name': 'id', 'type': 'string'},
                {'name': 'data', 'type': 'string'},
                {'name': 'timestamp', 'type': 'datetime'}
            ]
        }


class StreamSource(DataSource):
    """Data source for streaming data."""
    
    def __init__(self, stream_url: str,
                 protocol: str = "websocket",
                 config: Optional[IngestionConfig] = None,
                 credentials: Optional[SourceCredentials] = None):
        """Initialize stream source.
        
        Args:
            stream_url: Stream endpoint URL
            protocol: Streaming protocol
            config: Ingestion configuration
            credentials: Stream credentials
        """
        self.stream_url = stream_url
        self.protocol = protocol
        self.stream = None
        
        super().__init__(
            name=f"stream:{stream_url}",
            source_type=SourceType.STREAM,
            config=config,
            credentials=credentials
        )
    
    def connect(self) -> None:
        """Connect to stream.
        
        Raises:
            ConnectionError: If connection fails
        """
        try:
            self.logger.info(f"Connecting to stream: {self.stream_url}")
            # In production, would establish actual stream connection
            self.stream = {'url': self.stream_url, 'protocol': self.protocol}
            self._connected = True
            self.logger.info("Stream connection established")
        except Exception as e:
            raise ConnectionError(f"Failed to connect to stream: {e}", host=self.stream_url)
    
    def disconnect(self) -> None:
        """Disconnect from stream."""
        if self.stream:
            self.logger.info("Closing stream connection")
            self.stream = None
            self._connected = False
    
    def read(self, max_messages: int = 100, **kwargs) -> Iterator[Dict[str, Any]]:
        """Read data from stream.
        
        Args:
            max_messages: Maximum messages to read
            **kwargs: Additional read parameters
            
        Yields:
            Data records as dictionaries
        """
        if not self._connected:
            raise DataIngestionError("Stream not connected", source=self.stream_url)
        
        # Mock streaming data
        for i in range(max_messages):
            yield {
                'message_id': i,
                'content': f"stream_message_{i}",
                'timestamp': '2024-01-01T00:00:00Z'
            }
    
    def get_schema(self) -> Dict[str, Any]:
        """Get stream message schema.
        
        Returns:
            Schema dictionary
        """
        return {
            'fields': [
                {'name': 'message_id', 'type': 'integer'},
                {'name': 'content', 'type': 'string'},
                {'name': 'timestamp', 'type': 'datetime'}
            ]
        }