"""
Data loader orchestration for the ingestion module.

This module coordinates the loading of data from various sources
using appropriate connectors and parsers.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from dataclasses import dataclass
from typing import Any, Dict, Iterator, List, Optional, Union
from pathlib import Path
import logging

from core.base import BaseComponent, Status, DataFormat
from core.config import IngestionConfig
from core.exceptions import DataIngestionError
from core.registry import get_registry, ComponentType
from .sources import DataSource, FileSource, DatabaseSource, APISource
from .parsers import get_parser, detect_format
from .schema import TableSchema, detect_schema
from .connectors import BaseConnector


@dataclass
class LoadResult:
    """Result of a data loading operation."""
    
    source_name: str
    records_loaded: int
    records_failed: int
    schema: Optional[TableSchema] = None
    errors: List[str] = None
    elapsed_time: float = 0.0
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        """Initialize collections."""
        if self.errors is None:
            self.errors = []
        if self.metadata is None:
            self.metadata = {}
    
    @property
    def success_rate(self) -> float:
        """Calculate success rate.
        
        Returns:
            Success rate as percentage
        """
        total = self.records_loaded + self.records_failed
        if total == 0:
            return 0.0
        return (self.records_loaded / total) * 100


class DataLoader(BaseComponent):
    """Orchestrates data loading from various sources."""
    
    def __init__(self, config: Optional[IngestionConfig] = None,
                 max_workers: int = 4):
        """Initialize data loader.
        
        Args:
            config: Ingestion configuration
            max_workers: Maximum parallel workers
        """
        super().__init__()
        self.config = config or IngestionConfig()
        self.max_workers = max_workers
        self._sources: Dict[str, DataSource] = {}
        self._connectors: Dict[str, BaseConnector] = {}
        self._executor = None
    
    def initialize(self) -> None:
        """Initialize the data loader."""
        self._executor = ThreadPoolExecutor(max_workers=self.max_workers)
        self.logger.info(f"Data loader initialized with {self.max_workers} workers")
    
    def cleanup(self) -> None:
        """Cleanup loader resources."""
        # Close all sources
        for source in self._sources.values():
            try:
                source.cleanup()
            except Exception as e:
                self.logger.error(f"Error closing source: {e}")
        
        # Close all connectors
        for connector in self._connectors.values():
            try:
                connector.cleanup()
            except Exception as e:
                self.logger.error(f"Error closing connector: {e}")
        
        # Shutdown executor
        if self._executor:
            self._executor.shutdown(wait=True)
            self._executor = None
    
    def validate(self) -> bool:
        """Validate loader configuration.
        
        Returns:
            True if configuration is valid
        """
        return self.config.validate()
    
    def register_source(self, name: str, source: DataSource) -> None:
        """Register a data source.
        
        Args:
            name: Source identifier
            source: Data source instance
        """
        self._sources[name] = source
        self.logger.info(f"Registered source: {name}")
    
    def register_connector(self, name: str, connector: BaseConnector) -> None:
        """Register a connector.
        
        Args:
            name: Connector identifier
            connector: Connector instance
        """
        self._connectors[name] = connector
        self.logger.info(f"Registered connector: {name}")
    
    def load_file(self, file_path: Union[str, Path], 
                  format: Optional[DataFormat] = None) -> LoadResult:
        """Load data from a file.
        
        Args:
            file_path: Path to file
            format: File format (auto-detected if None)
            
        Returns:
            Load result
        """
        import time
        start_time = time.time()
        
        file_path = Path(file_path)
        result = LoadResult(source_name=str(file_path), records_loaded=0, records_failed=0)
        
        try:
            # Create file source
            source = FileSource(file_path, format, self.config)
            
            # Connect and load
            with source:
                # Detect schema from sample
                sample_records = []
                record_count = 0
                
                for record in source.read():
                    try:
                        # Process record (validation, transformation, etc.)
                        processed = self._process_record(record)
                        
                        if record_count < 100:
                            sample_records.append(processed)
                        
                        result.records_loaded += 1
                        record_count += 1
                        
                        # Yield for streaming if needed
                        if record_count % self.config.chunk_size == 0:
                            self.logger.debug(f"Loaded {record_count} records")
                            
                    except Exception as e:
                        result.records_failed += 1
                        result.errors.append(str(e))
                        if len(result.errors) > 100:
                            result.errors = result.errors[:100]  # Limit error list
                
                # Detect schema from sample
                if sample_records:
                    schema_dict = detect_schema(sample_records)
                    result.metadata['detected_schema'] = schema_dict
            
            result.elapsed_time = time.time() - start_time
            self.logger.info(
                f"Loaded {result.records_loaded} records from {file_path} "
                f"in {result.elapsed_time:.2f}s"
            )
            
        except Exception as e:
            result.errors.append(f"Load failed: {str(e)}")
            self.logger.error(f"Failed to load {file_path}: {e}")
        
        return result
    
    def load_database(self, connector_name: str, query: str = None,
                     table: str = None) -> LoadResult:
        """Load data from a database.
        
        Args:
            connector_name: Name of registered connector
            query: SQL query
            table: Table name
            
        Returns:
            Load result
        """
        import time
        start_time = time.time()
        
        result = LoadResult(
            source_name=f"{connector_name}:{table or 'query'}",
            records_loaded=0,
            records_failed=0
        )
        
        try:
            # Get connector
            if connector_name not in self._connectors:
                raise DataIngestionError(f"Connector not found: {connector_name}")
            
            connector = self._connectors[connector_name]
            
            # Execute query
            with connector:
                if query:
                    records = connector.execute(query)
                elif table:
                    records = connector.execute(f"SELECT * FROM {table}")
                else:
                    raise DataIngestionError("Either query or table must be specified")
                
                # Process records
                for record in records:
                    try:
                        processed = self._process_record(record)
                        result.records_loaded += 1
                    except Exception as e:
                        result.records_failed += 1
                        result.errors.append(str(e))
            
            result.elapsed_time = time.time() - start_time
            self.logger.info(
                f"Loaded {result.records_loaded} records from database "
                f"in {result.elapsed_time:.2f}s"
            )
            
        except Exception as e:
            result.errors.append(f"Database load failed: {str(e)}")
            self.logger.error(f"Failed to load from database: {e}")
        
        return result
    
    def load_api(self, endpoint: str, method: str = "GET",
                params: Optional[Dict] = None) -> LoadResult:
        """Load data from an API.
        
        Args:
            endpoint: API endpoint
            method: HTTP method
            params: Request parameters
            
        Returns:
            Load result
        """
        import time
        start_time = time.time()
        
        result = LoadResult(source_name=f"api:{endpoint}", records_loaded=0, records_failed=0)
        
        try:
            # Create API source
            source = APISource(endpoint, method, params=params, config=self.config)
            
            # Connect and load
            with source:
                for record in source.read():
                    try:
                        processed = self._process_record(record)
                        result.records_loaded += 1
                    except Exception as e:
                        result.records_failed += 1
                        result.errors.append(str(e))
            
            result.elapsed_time = time.time() - start_time
            self.logger.info(
                f"Loaded {result.records_loaded} records from API "
                f"in {result.elapsed_time:.2f}s"
            )
            
        except Exception as e:
            result.errors.append(f"API load failed: {str(e)}")
            self.logger.error(f"Failed to load from API: {e}")
        
        return result
    
    def load_parallel(self, sources: List[DataSource]) -> List[LoadResult]:
        """Load data from multiple sources in parallel.
        
        Args:
            sources: List of data sources
            
        Returns:
            List of load results
        """
        if not self._executor:
            raise RuntimeError("Loader not initialized")
        
        futures = []
        results = []
        
        for source in sources:
            future = self._executor.submit(self._load_source, source)
            futures.append(future)
        
        for future in futures:
            try:
                result = future.result(timeout=self.config.connection_timeout)
                results.append(result)
            except Exception as e:
                self.logger.error(f"Parallel load failed: {e}")
                results.append(LoadResult(
                    source_name="unknown",
                    records_loaded=0,
                    records_failed=0,
                    errors=[str(e)]
                ))
        
        return results
    
    def _load_source(self, source: DataSource) -> LoadResult:
        """Load data from a single source.
        
        Args:
            source: Data source
            
        Returns:
            Load result
        """
        import time
        start_time = time.time()
        
        result = LoadResult(
            source_name=source.metadata.name,
            records_loaded=0,
            records_failed=0
        )
        
        try:
            with source:
                for record in source.read():
                    try:
                        processed = self._process_record(record)
                        result.records_loaded += 1
                    except Exception as e:
                        result.records_failed += 1
                        result.errors.append(str(e))
            
            result.elapsed_time = time.time() - start_time
            
        except Exception as e:
            result.errors.append(f"Source load failed: {str(e)}")
            self.logger.error(f"Failed to load source: {e}")
        
        return result
    
    def _process_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single record.
        
        Args:
            record: Raw record
            
        Returns:
            Processed record
        """
        # Apply any transformations or validations
        # This is a placeholder for actual processing logic
        
        # Remove None values if configured
        if hasattr(self.config, 'remove_nulls') and self.config.remove_nulls:
            record = {k: v for k, v in record.items() if v is not None}
        
        # Parse dates if configured
        if self.config.parse_dates:
            record = self._parse_dates(record)
        
        return record
    
    def _parse_dates(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Parse date fields in a record.
        
        Args:
            record: Record with potential date fields
            
        Returns:
            Record with parsed dates
        """
        import re
        from datetime import datetime
        
        date_pattern = re.compile(r'^\d{4}-\d{2}-\d{2}')
        
        for key, value in record.items():
            if isinstance(value, str) and date_pattern.match(value):
                try:
                    # Try to parse as datetime
                    record[key] = datetime.fromisoformat(value)
                except:
                    pass  # Keep original value if parsing fails
        
        return record


class BatchLoader(DataLoader):
    """Loader optimized for batch processing."""
    
    def __init__(self, config: Optional[IngestionConfig] = None,
                 batch_size: int = 1000):
        """Initialize batch loader.
        
        Args:
            config: Ingestion configuration
            batch_size: Size of each batch
        """
        super().__init__(config)
        self.batch_size = batch_size
        self._current_batch = []
    
    def load_batch(self, source: DataSource) -> Iterator[List[Dict[str, Any]]]:
        """Load data in batches.
        
        Args:
            source: Data source
            
        Yields:
            Batches of records
        """
        batch = []
        
        with source:
            for record in source.read():
                try:
                    processed = self._process_record(record)
                    batch.append(processed)
                    
                    if len(batch) >= self.batch_size:
                        yield batch
                        batch = []
                        
                except Exception as e:
                    self.logger.error(f"Failed to process record: {e}")
        
        # Yield remaining records
        if batch:
            yield batch


class StreamLoader(DataLoader):
    """Loader for streaming data sources."""
    
    def __init__(self, config: Optional[IngestionConfig] = None):
        """Initialize stream loader.
        
        Args:
            config: Ingestion configuration
        """
        super().__init__(config)
        self._active_streams = {}
    
    async def load_stream_async(self, source: DataSource) -> AsyncIterator[Dict[str, Any]]:
        """Load data from a streaming source asynchronously.
        
        Args:
            source: Streaming data source
            
        Yields:
            Stream records
        """
        stream_id = id(source)
        self._active_streams[stream_id] = source
        
        try:
            async with source:
                async for record in source.read():
                    try:
                        processed = self._process_record(record)
                        yield processed
                    except Exception as e:
                        self.logger.error(f"Failed to process stream record: {e}")
        finally:
            del self._active_streams[stream_id]
    
    def stop_stream(self, stream_id: int) -> None:
        """Stop a streaming source.
        
        Args:
            stream_id: Stream identifier
        """
        if stream_id in self._active_streams:
            source = self._active_streams[stream_id]
            source.disconnect()
            del self._active_streams[stream_id]