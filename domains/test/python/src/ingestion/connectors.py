"""
Connectors for various data sources.

This module provides specific connector implementations for different
data sources and protocols used by the platform.
"""

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Iterator
import logging

from core.base import BaseComponent
from core.exceptions import ConnectionError, DataIngestionError
from core.registry import register_component, ComponentType
from .sources import DataSource, SourceCredentials


class BaseConnector(BaseComponent):
    """Abstract base class for data connectors."""
    
    def __init__(self, name: str, credentials: Optional[SourceCredentials] = None):
        """Initialize connector.
        
        Args:
            name: Connector name
            credentials: Connection credentials
        """
        super().__init__()
        self.name = name
        self.credentials = credentials
        self._connection = None
    
    @abstractmethod
    def connect(self) -> Any:
        """Establish connection and return connection object.
        
        Returns:
            Connection object
            
        Raises:
            ConnectionError: If connection fails
        """
        pass
    
    @abstractmethod
    def disconnect(self) -> None:
        """Close the connection."""
        pass
    
    @abstractmethod
    def execute(self, command: Any) -> Any:
        """Execute a command/query on the connection.
        
        Args:
            command: Command to execute
            
        Returns:
            Command result
        """
        pass
    
    def initialize(self) -> None:
        """Initialize the connector."""
        if self._connection is None:
            self._connection = self.connect()
    
    def cleanup(self) -> None:
        """Cleanup connector resources."""
        if self._connection is not None:
            self.disconnect()
            self._connection = None
    
    def validate(self) -> bool:
        """Validate connector configuration.
        
        Returns:
            True if configuration is valid
        """
        return True


@register_component(ComponentType.CONNECTOR, tags=["sql", "database"])
class SQLConnector(BaseConnector):
    """Connector for SQL databases."""
    
    def __init__(self, database_type: str, host: str, port: int,
                 database: str, credentials: SourceCredentials):
        """Initialize SQL connector.
        
        Args:
            database_type: Type of SQL database (mysql, postgresql, etc.)
            host: Database host
            port: Database port
            database: Database name
            credentials: Connection credentials
        """
        super().__init__(name=f"sql_{database_type}", credentials=credentials)
        self.database_type = database_type
        self.host = host
        self.port = port
        self.database = database
    
    def connect(self) -> Dict[str, Any]:
        """Connect to SQL database.
        
        Returns:
            Mock connection object
        """
        self.logger.info(f"Connecting to {self.database_type} database at {self.host}:{self.port}")
        
        # In production, would use actual database driver (psycopg2, pymysql, etc.)
        connection = {
            'type': self.database_type,
            'host': self.host,
            'port': self.port,
            'database': self.database,
            'connected': True
        }
        
        self._connection = connection
        return connection
    
    def disconnect(self) -> None:
        """Disconnect from SQL database."""
        if self._connection:
            self.logger.info(f"Disconnecting from {self.database_type} database")
            self._connection['connected'] = False
            self._connection = None
    
    def execute(self, query: str) -> List[Dict[str, Any]]:
        """Execute SQL query.
        
        Args:
            query: SQL query string
            
        Returns:
            Query results as list of dictionaries
        """
        if not self._connection or not self._connection.get('connected'):
            raise ConnectionError("Not connected to database")
        
        self.logger.debug(f"Executing query: {query[:100]}...")
        
        # Mock query execution
        results = []
        for i in range(5):
            results.append({
                'id': i,
                'name': f'record_{i}',
                'value': i * 10
            })
        
        return results
    
    def execute_many(self, query: str, params: List[tuple]) -> int:
        """Execute parameterized query with multiple parameter sets.
        
        Args:
            query: Parameterized SQL query
            params: List of parameter tuples
            
        Returns:
            Number of affected rows
        """
        if not self._connection or not self._connection.get('connected'):
            raise ConnectionError("Not connected to database")
        
        self.logger.debug(f"Executing batch query with {len(params)} parameter sets")
        
        # Mock batch execution
        return len(params)
    
    def get_tables(self) -> List[str]:
        """Get list of tables in the database.
        
        Returns:
            List of table names
        """
        if not self._connection or not self._connection.get('connected'):
            raise ConnectionError("Not connected to database")
        
        # Mock table list
        return ['users', 'products', 'orders', 'customers']
    
    def get_table_schema(self, table: str) -> Dict[str, Any]:
        """Get schema for a specific table.
        
        Args:
            table: Table name
            
        Returns:
            Table schema dictionary
        """
        # Mock table schema
        return {
            'table': table,
            'columns': [
                {'name': 'id', 'type': 'integer', 'primary_key': True},
                {'name': 'name', 'type': 'varchar(255)'},
                {'name': 'created_at', 'type': 'timestamp'}
            ]
        }


@register_component(ComponentType.CONNECTOR, tags=["nosql", "mongodb"])
class MongoConnector(BaseConnector):
    """Connector for MongoDB databases."""
    
    def __init__(self, connection_string: str, database: str,
                 credentials: Optional[SourceCredentials] = None):
        """Initialize MongoDB connector.
        
        Args:
            connection_string: MongoDB connection string
            database: Database name
            credentials: Optional connection credentials
        """
        super().__init__(name="mongo", credentials=credentials)
        self.connection_string = connection_string
        self.database = database
    
    def connect(self) -> Dict[str, Any]:
        """Connect to MongoDB.
        
        Returns:
            Mock connection object
        """
        self.logger.info(f"Connecting to MongoDB: {self.database}")
        
        # In production, would use pymongo
        connection = {
            'type': 'mongodb',
            'connection_string': self.connection_string,
            'database': self.database,
            'connected': True
        }
        
        self._connection = connection
        return connection
    
    def disconnect(self) -> None:
        """Disconnect from MongoDB."""
        if self._connection:
            self.logger.info("Disconnecting from MongoDB")
            self._connection['connected'] = False
            self._connection = None
    
    def execute(self, operation: Dict[str, Any]) -> Any:
        """Execute MongoDB operation.
        
        Args:
            operation: Operation dictionary with collection and query
            
        Returns:
            Operation result
        """
        if not self._connection or not self._connection.get('connected'):
            raise ConnectionError("Not connected to MongoDB")
        
        collection = operation.get('collection')
        query = operation.get('query', {})
        
        self.logger.debug(f"Executing operation on collection '{collection}'")
        
        # Mock query execution
        results = []
        for i in range(3):
            results.append({
                '_id': f'doc_{i}',
                'data': f'value_{i}'
            })
        
        return results
    
    def get_collections(self) -> List[str]:
        """Get list of collections in the database.
        
        Returns:
            List of collection names
        """
        # Mock collection list
        return ['users', 'products', 'logs', 'sessions']


@register_component(ComponentType.CONNECTOR, tags=["http", "rest", "api"])
class HTTPConnector(BaseConnector):
    """Connector for HTTP/REST APIs."""
    
    def __init__(self, base_url: str, headers: Optional[Dict[str, str]] = None,
                 timeout: float = 30.0, credentials: Optional[SourceCredentials] = None):
        """Initialize HTTP connector.
        
        Args:
            base_url: Base URL for API
            headers: Default headers
            timeout: Request timeout in seconds
            credentials: API credentials
        """
        super().__init__(name="http", credentials=credentials)
        self.base_url = base_url.rstrip('/')
        self.headers = headers or {}
        self.timeout = timeout
        self.session = None
    
    def connect(self) -> Dict[str, Any]:
        """Initialize HTTP session.
        
        Returns:
            Session information
        """
        self.logger.info(f"Initializing HTTP session for {self.base_url}")
        
        # Add authentication if credentials provided
        if self.credentials:
            if self.credentials.api_key:
                self.headers['X-API-Key'] = self.credentials.api_key
            elif self.credentials.token:
                self.headers['Authorization'] = f"Bearer {self.credentials.token}"
        
        # In production, would create requests.Session()
        self.session = {
            'base_url': self.base_url,
            'headers': self.headers,
            'timeout': self.timeout
        }
        
        self._connection = self.session
        return self.session
    
    def disconnect(self) -> None:
        """Close HTTP session."""
        if self.session:
            self.logger.info("Closing HTTP session")
            self.session = None
            self._connection = None
    
    def execute(self, request: Dict[str, Any]) -> Any:
        """Execute HTTP request.
        
        Args:
            request: Request dictionary with method, path, params, etc.
            
        Returns:
            Response data
        """
        if not self.session:
            raise ConnectionError("HTTP session not initialized")
        
        method = request.get('method', 'GET')
        path = request.get('path', '/')
        params = request.get('params', {})
        data = request.get('data')
        
        url = f"{self.base_url}{path}"
        self.logger.debug(f"Executing {method} request to {url}")
        
        # Mock HTTP response
        return {
            'status': 200,
            'data': {
                'result': 'success',
                'items': [{'id': i, 'value': f'item_{i}'} for i in range(3)]
            }
        }
    
    def get(self, path: str, **kwargs) -> Any:
        """Execute GET request.
        
        Args:
            path: Request path
            **kwargs: Additional request parameters
            
        Returns:
            Response data
        """
        request = {'method': 'GET', 'path': path, **kwargs}
        return self.execute(request)
    
    def post(self, path: str, data: Any, **kwargs) -> Any:
        """Execute POST request.
        
        Args:
            path: Request path
            data: Request body data
            **kwargs: Additional request parameters
            
        Returns:
            Response data
        """
        request = {'method': 'POST', 'path': path, 'data': data, **kwargs}
        return self.execute(request)


@register_component(ComponentType.CONNECTOR, tags=["file", "s3", "cloud"])
class S3Connector(BaseConnector):
    """Connector for Amazon S3 storage."""
    
    def __init__(self, bucket: str, region: str = 'us-east-1',
                 credentials: Optional[SourceCredentials] = None):
        """Initialize S3 connector.
        
        Args:
            bucket: S3 bucket name
            region: AWS region
            credentials: AWS credentials
        """
        super().__init__(name="s3", credentials=credentials)
        self.bucket = bucket
        self.region = region
        self.client = None
    
    def connect(self) -> Dict[str, Any]:
        """Connect to S3.
        
        Returns:
            S3 client information
        """
        self.logger.info(f"Connecting to S3 bucket: {self.bucket}")
        
        # In production, would use boto3
        client = {
            'type': 's3',
            'bucket': self.bucket,
            'region': self.region,
            'connected': True
        }
        
        self.client = client
        self._connection = client
        return client
    
    def disconnect(self) -> None:
        """Disconnect from S3."""
        if self.client:
            self.logger.info("Closing S3 connection")
            self.client = None
            self._connection = None
    
    def execute(self, operation: Dict[str, Any]) -> Any:
        """Execute S3 operation.
        
        Args:
            operation: Operation dictionary
            
        Returns:
            Operation result
        """
        if not self.client:
            raise ConnectionError("Not connected to S3")
        
        op_type = operation.get('type')
        
        if op_type == 'list':
            return self.list_objects(operation.get('prefix', ''))
        elif op_type == 'get':
            return self.get_object(operation['key'])
        elif op_type == 'put':
            return self.put_object(operation['key'], operation['data'])
        else:
            raise DataIngestionError(f"Unknown S3 operation: {op_type}")
    
    def list_objects(self, prefix: str = '') -> List[str]:
        """List objects in bucket.
        
        Args:
            prefix: Prefix to filter objects
            
        Returns:
            List of object keys
        """
        # Mock S3 listing
        return [
            f"{prefix}file1.csv",
            f"{prefix}file2.json",
            f"{prefix}file3.parquet"
        ]
    
    def get_object(self, key: str) -> Dict[str, Any]:
        """Get object from S3.
        
        Args:
            key: Object key
            
        Returns:
            Object data
        """
        # Mock S3 get
        return {
            'key': key,
            'data': f'Mock data for {key}',
            'size': 1024,
            'last_modified': '2024-01-01T00:00:00Z'
        }
    
    def put_object(self, key: str, data: Any) -> Dict[str, Any]:
        """Put object to S3.
        
        Args:
            key: Object key
            data: Object data
            
        Returns:
            Upload result
        """
        # Mock S3 put
        return {
            'key': key,
            'etag': 'mock-etag-12345',
            'version_id': 'v1'
        }


@register_component(ComponentType.CONNECTOR, tags=["kafka", "streaming"])
class KafkaConnector(BaseConnector):
    """Connector for Apache Kafka."""
    
    def __init__(self, brokers: List[str], topic: str,
                 credentials: Optional[SourceCredentials] = None):
        """Initialize Kafka connector.
        
        Args:
            brokers: List of Kafka brokers
            topic: Kafka topic
            credentials: Optional credentials
        """
        super().__init__(name="kafka", credentials=credentials)
        self.brokers = brokers
        self.topic = topic
        self.consumer = None
        self.producer = None
    
    def connect(self) -> Dict[str, Any]:
        """Connect to Kafka.
        
        Returns:
            Connection information
        """
        self.logger.info(f"Connecting to Kafka brokers: {self.brokers}")
        
        # In production, would use kafka-python
        connection = {
            'type': 'kafka',
            'brokers': self.brokers,
            'topic': self.topic,
            'connected': True
        }
        
        self._connection = connection
        return connection
    
    def disconnect(self) -> None:
        """Disconnect from Kafka."""
        if self._connection:
            self.logger.info("Closing Kafka connection")
            self._connection = None
    
    def execute(self, operation: Dict[str, Any]) -> Any:
        """Execute Kafka operation.
        
        Args:
            operation: Operation dictionary
            
        Returns:
            Operation result
        """
        if not self._connection:
            raise ConnectionError("Not connected to Kafka")
        
        op_type = operation.get('type')
        
        if op_type == 'consume':
            return self.consume_messages(operation.get('count', 10))
        elif op_type == 'produce':
            return self.produce_message(operation['message'])
        else:
            raise DataIngestionError(f"Unknown Kafka operation: {op_type}")
    
    def consume_messages(self, count: int = 10) -> List[Dict[str, Any]]:
        """Consume messages from Kafka.
        
        Args:
            count: Number of messages to consume
            
        Returns:
            List of messages
        """
        # Mock Kafka consumption
        messages = []
        for i in range(count):
            messages.append({
                'offset': i,
                'partition': 0,
                'key': f'key_{i}',
                'value': f'message_{i}',
                'timestamp': '2024-01-01T00:00:00Z'
            })
        
        return messages
    
    def produce_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Produce message to Kafka.
        
        Args:
            message: Message to produce
            
        Returns:
            Production result
        """
        # Mock Kafka production
        return {
            'topic': self.topic,
            'partition': 0,
            'offset': 100,
            'timestamp': '2024-01-01T00:00:00Z'
        }


@register_component(ComponentType.CONNECTOR, tags=["redis", "cache"])
class RedisConnector(BaseConnector):
    """Connector for Redis."""
    
    def __init__(self, host: str = 'localhost', port: int = 6379,
                 db: int = 0, credentials: Optional[SourceCredentials] = None):
        """Initialize Redis connector.
        
        Args:
            host: Redis host
            port: Redis port
            db: Database number
            credentials: Optional credentials
        """
        super().__init__(name="redis", credentials=credentials)
        self.host = host
        self.port = port
        self.db = db
        self.client = None
    
    def connect(self) -> Dict[str, Any]:
        """Connect to Redis.
        
        Returns:
            Connection information
        """
        self.logger.info(f"Connecting to Redis at {self.host}:{self.port}")
        
        # In production, would use redis-py
        client = {
            'type': 'redis',
            'host': self.host,
            'port': self.port,
            'db': self.db,
            'connected': True
        }
        
        self.client = client
        self._connection = client
        return client
    
    def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self.client:
            self.logger.info("Closing Redis connection")
            self.client = None
            self._connection = None
    
    def execute(self, command: Dict[str, Any]) -> Any:
        """Execute Redis command.
        
        Args:
            command: Command dictionary
            
        Returns:
            Command result
        """
        if not self.client:
            raise ConnectionError("Not connected to Redis")
        
        cmd_type = command.get('type')
        
        if cmd_type == 'get':
            return self.get(command['key'])
        elif cmd_type == 'set':
            return self.set(command['key'], command['value'])
        elif cmd_type == 'delete':
            return self.delete(command['key'])
        elif cmd_type == 'keys':
            return self.keys(command.get('pattern', '*'))
        else:
            raise DataIngestionError(f"Unknown Redis command: {cmd_type}")
    
    def get(self, key: str) -> Optional[str]:
        """Get value from Redis.
        
        Args:
            key: Redis key
            
        Returns:
            Value or None
        """
        # Mock Redis get
        return f"value_for_{key}"
    
    def set(self, key: str, value: str) -> bool:
        """Set value in Redis.
        
        Args:
            key: Redis key
            value: Value to set
            
        Returns:
            Success status
        """
        # Mock Redis set
        return True
    
    def delete(self, key: str) -> bool:
        """Delete key from Redis.
        
        Args:
            key: Redis key
            
        Returns:
            Success status
        """
        # Mock Redis delete
        return True
    
    def keys(self, pattern: str = '*') -> List[str]:
        """Get keys matching pattern.
        
        Args:
            pattern: Key pattern
            
        Returns:
            List of matching keys
        """
        # Mock Redis keys
        return ['key1', 'key2', 'key3']


# Factory function for creating connectors

def create_connector(connector_type: str, **kwargs) -> BaseConnector:
    """Create a connector based on type.
    
    Args:
        connector_type: Type of connector to create
        **kwargs: Connector-specific arguments
        
    Returns:
        Connector instance
        
    Raises:
        DataIngestionError: If connector type is unknown
    """
    connectors = {
        'sql': SQLConnector,
        'mongo': MongoConnector,
        'http': HTTPConnector,
        's3': S3Connector,
        'kafka': KafkaConnector,
        'redis': RedisConnector
    }
    
    if connector_type not in connectors:
        raise DataIngestionError(f"Unknown connector type: {connector_type}")
    
    connector_class = connectors[connector_type]
    return connector_class(**kwargs)