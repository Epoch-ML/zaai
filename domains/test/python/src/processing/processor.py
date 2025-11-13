"""
Main data processor for the processing module.

This module provides the core data processing functionality including
cleaning, transformation, and analysis operations.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Union, Callable
import logging
import time

from core.base import BaseProcessor, Status, Metadata, DataContainer
from core.exceptions import ProcessingError, ValidationError
from core.config import ProcessingConfig
from core.registry import register_processor
from ingestion.schema import TableSchema, FieldSchema


@dataclass
class ProcessingResult:
    """Result of a processing operation."""
    
    input_count: int = 0
    output_count: int = 0
    filtered_count: int = 0
    error_count: int = 0
    transformations_applied: List[str] = field(default_factory=list)
    elapsed_time: float = 0.0
    metrics: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def success_rate(self) -> float:
        """Calculate processing success rate."""
        total = self.input_count
        if total == 0:
            return 0.0
        return ((total - self.error_count) / total) * 100


@register_processor(tags=["core", "main"])
class DataProcessor(BaseProcessor):
    """Main data processor with configurable operations."""
    
    def __init__(self, config: Optional[ProcessingConfig] = None,
                 schema: Optional[TableSchema] = None):
        """Initialize data processor.
        
        Args:
            config: Processing configuration
            schema: Expected data schema
        """
        super().__init__(config.to_dict() if config else {})
        self.processing_config = config or ProcessingConfig()
        self.schema = schema
        self.result = ProcessingResult()
        self._transformers = []
        self._filters = []
        
    def add_transformer(self, transformer: Callable[[Dict], Dict]) -> None:
        """Add a transformation function.
        
        Args:
            transformer: Transformation function
        """
        self._transformers.append(transformer)
        self.logger.debug(f"Added transformer: {transformer.__name__}")
    
    def add_filter(self, filter_func: Callable[[Dict], bool]) -> None:
        """Add a filter function.
        
        Args:
            filter_func: Filter function returning True to keep record
        """
        self._filters.append(filter_func)
        self.logger.debug(f"Added filter: {filter_func.__name__}")
    
    def process(self, input_data: Union[List[Dict], Iterator[Dict]]) -> List[Dict]:
        """Process input data through all configured operations.
        
        Args:
            input_data: Input data records
            
        Returns:
            Processed data records
        """
        start_time = time.time()
        self.set_status(Status.RUNNING)
        self.result = ProcessingResult()
        
        output_data = []
        
        try:
            # Process each record
            for record in input_data:
                self.result.input_count += 1
                
                try:
                    # Validate against schema if provided
                    if self.schema:
                        self.schema.validate_record(record)
                    
                    # Apply filters
                    if not self._apply_filters(record):
                        self.result.filtered_count += 1
                        continue
                    
                    # Apply transformations
                    processed = self._apply_transformations(record)
                    
                    output_data.append(processed)
                    self.result.output_count += 1
                    
                except Exception as e:
                    self.result.error_count += 1
                    self.logger.error(f"Error processing record: {e}")
                    
                    if self.processing_config.retry_attempts > 0:
                        # Retry logic could go here
                        pass
            
            self.result.elapsed_time = time.time() - start_time
            self.record_metric('records_per_second', 
                             self.result.input_count / self.result.elapsed_time)
            
            self.set_status(Status.COMPLETED)
            self.logger.info(
                f"Processing complete: {self.result.output_count}/{self.result.input_count} "
                f"records in {self.result.elapsed_time:.2f}s"
            )
            
        except Exception as e:
            self.set_status(Status.FAILED)
            raise ProcessingError(f"Processing failed: {e}", processor=self.__class__.__name__)
        
        return output_data
    
    def _apply_filters(self, record: Dict) -> bool:
        """Apply all filters to a record.
        
        Args:
            record: Record to filter
            
        Returns:
            True if record passes all filters
        """
        for filter_func in self._filters:
            if not filter_func(record):
                return False
        return True
    
    def _apply_transformations(self, record: Dict) -> Dict:
        """Apply all transformations to a record.
        
        Args:
            record: Record to transform
            
        Returns:
            Transformed record
        """
        result = record.copy()
        
        for transformer in self._transformers:
            result = transformer(result)
            transformer_name = transformer.__name__
            if transformer_name not in self.result.transformations_applied:
                self.result.transformations_applied.append(transformer_name)
        
        return result
    
    def get_capabilities(self) -> List[str]:
        """Get processor capabilities.
        
        Returns:
            List of capability identifiers
        """
        return [
            'filter',
            'transform',
            'validate',
            'batch_process',
            'stream_process'
        ]
    
    def process_batch(self, data: List[Dict], batch_size: Optional[int] = None) -> Iterator[List[Dict]]:
        """Process data in batches.
        
        Args:
            data: Input data
            batch_size: Size of each batch
            
        Yields:
            Processed batches
        """
        batch_size = batch_size or self.processing_config.batch_size
        
        for i in range(0, len(data), batch_size):
            batch = data[i:i + batch_size]
            processed = self.process(batch)
            yield processed
    
    def get_result(self) -> ProcessingResult:
        """Get the processing result.
        
        Returns:
            Processing result with metrics
        """
        return self.result


@register_processor(tags=["cleaning", "quality"])
class DataCleaner(BaseProcessor):
    """Processor specialized for data cleaning operations."""
    
    def __init__(self, remove_nulls: bool = True, 
                 remove_duplicates: bool = True,
                 trim_strings: bool = True):
        """Initialize data cleaner.
        
        Args:
            remove_nulls: Remove null values
            remove_duplicates: Remove duplicate records
            trim_strings: Trim whitespace from strings
        """
        super().__init__()
        self.remove_nulls = remove_nulls
        self.remove_duplicates = remove_duplicates
        self.trim_strings = trim_strings
        self._seen_records = set()
    
    def process(self, input_data: Union[List[Dict], Iterator[Dict]]) -> List[Dict]:
        """Clean input data.
        
        Args:
            input_data: Input data records
            
        Returns:
            Cleaned data records
        """
        self.set_status(Status.RUNNING)
        cleaned = []
        
        for record in input_data:
            # Remove nulls
            if self.remove_nulls:
                record = {k: v for k, v in record.items() if v is not None}
            
            # Trim strings
            if self.trim_strings:
                record = {
                    k: v.strip() if isinstance(v, str) else v
                    for k, v in record.items()
                }
            
            # Check for duplicates
            if self.remove_duplicates:
                record_hash = hash(frozenset(record.items()))
                if record_hash in self._seen_records:
                    continue
                self._seen_records.add(record_hash)
            
            cleaned.append(record)
        
        self.set_status(Status.COMPLETED)
        self.record_metric('records_cleaned', len(cleaned))
        
        return cleaned
    
    def get_capabilities(self) -> List[str]:
        """Get cleaner capabilities."""
        return ['remove_nulls', 'remove_duplicates', 'trim_strings', 'normalize']


@register_processor(tags=["validation", "quality"])
class DataValidator(BaseProcessor):
    """Processor for validating data against rules and schemas."""
    
    def __init__(self, schema: Optional[TableSchema] = None,
                 rules: Optional[List[Callable]] = None,
                 fail_on_error: bool = False):
        """Initialize data validator.
        
        Args:
            schema: Expected data schema
            rules: Validation rules
            fail_on_error: Raise exception on validation error
        """
        super().__init__()
        self.schema = schema
        self.rules = rules or []
        self.fail_on_error = fail_on_error
        self.validation_errors = []
    
    def process(self, input_data: Union[List[Dict], Iterator[Dict]]) -> List[Dict]:
        """Validate input data.
        
        Args:
            input_data: Input data records
            
        Returns:
            Valid data records
        """
        self.set_status(Status.RUNNING)
        self.validation_errors = []
        valid_records = []
        
        for idx, record in enumerate(input_data):
            errors = []
            
            # Validate against schema
            if self.schema:
                try:
                    self.schema.validate_record(record)
                except ValidationError as e:
                    errors.append(f"Schema validation: {e}")
            
            # Apply custom rules
            for rule in self.rules:
                try:
                    if not rule(record):
                        errors.append(f"Rule {rule.__name__} failed")
                except Exception as e:
                    errors.append(f"Rule {rule.__name__} error: {e}")
            
            if errors:
                self.validation_errors.append({
                    'record_index': idx,
                    'errors': errors
                })
                
                if self.fail_on_error:
                    raise ValidationError(f"Record {idx} validation failed: {errors}")
            else:
                valid_records.append(record)
        
        self.set_status(Status.COMPLETED)
        self.record_metric('valid_records', len(valid_records))
        self.record_metric('invalid_records', len(self.validation_errors))
        
        return valid_records
    
    def get_capabilities(self) -> List[str]:
        """Get validator capabilities."""
        return ['schema_validation', 'rule_validation', 'error_reporting']
    
    def get_validation_errors(self) -> List[Dict]:
        """Get validation errors from last run.
        
        Returns:
            List of validation errors
        """
        return self.validation_errors


class StreamProcessor(BaseProcessor):
    """Processor for streaming data processing."""
    
    def __init__(self, config: Optional[ProcessingConfig] = None,
                 window_size: int = 100):
        """Initialize stream processor.
        
        Args:
            config: Processing configuration
            window_size: Size of processing window
        """
        super().__init__(config.to_dict() if config else {})
        self.window_size = window_size
        self.window = []
        self.processed_count = 0
    
    def process(self, input_data: Iterator[Dict]) -> Iterator[Dict]:
        """Process streaming data.
        
        Args:
            input_data: Stream of input records
            
        Yields:
            Processed records
        """
        self.set_status(Status.RUNNING)
        
        for record in input_data:
            # Add to window
            self.window.append(record)
            
            # Process when window is full
            if len(self.window) >= self.window_size:
                processed = self._process_window()
                for p in processed:
                    yield p
                self.window = []
            
            self.processed_count += 1
        
        # Process remaining records
        if self.window:
            processed = self._process_window()
            for p in processed:
                yield p
        
        self.set_status(Status.COMPLETED)
        self.record_metric('total_processed', self.processed_count)
    
    def _process_window(self) -> List[Dict]:
        """Process current window of records.
        
        Returns:
            Processed records
        """
        # Apply window-based processing (aggregation, smoothing, etc.)
        processed = []
        
        for record in self.window:
            # Add window context
            record['window_size'] = len(self.window)
            record['window_position'] = self.window.index(record)
            processed.append(record)
        
        return processed
    
    def get_capabilities(self) -> List[str]:
        """Get stream processor capabilities."""
        return ['windowing', 'streaming', 'real_time']