"""
Data processing module for handling various data transformations.

This module provides the core data processing functionality including
loading, cleaning, transformation, and analysis operations.
"""

import re
import statistics
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple, Optional, Union
from collections import Counter, defaultdict
from pathlib import Path
import logging


@dataclass
class ProcessingConfig:
    """Configuration for data processing operations."""
    
    max_items: int = 10000
    batch_size: int = 100
    enable_caching: bool = True
    normalize: bool = True
    remove_outliers: bool = False
    outlier_threshold: float = 3.0
    encoding: str = "utf-8"
    processors: List[str] = field(default_factory=lambda: ["clean", "transform"])
    
    @classmethod
    def from_file(cls, path: Union[str, Path]) -> 'ProcessingConfig':
        """Load configuration from a JSON or YAML file.
        
        Args:
            path: Path to configuration file
            
        Returns:
            ProcessingConfig instance
        """
        import json
        
        with open(path, 'r') as f:
            data = json.load(f)
        
        return cls(**data)
    
    def validate(self) -> bool:
        """Validate configuration parameters.
        
        Returns:
            True if configuration is valid
            
        Raises:
            ValueError: If configuration contains invalid parameters
        """
        if self.max_items <= 0:
            raise ValueError("max_items must be positive")
        
        if self.batch_size <= 0:
            raise ValueError("batch_size must be positive")
        
        if self.outlier_threshold <= 0:
            raise ValueError("outlier_threshold must be positive")
        
        valid_processors = {"clean", "transform", "aggregate", "filter"}
        invalid = set(self.processors) - valid_processors
        if invalid:
            raise ValueError(f"Invalid processors: {invalid}")
        
        return True


class DataProcessor:
    """Main class for processing data with various transformations."""
    
    def __init__(self, config: ProcessingConfig):
        """Initialize processor with configuration.
        
        Args:
            config: Processing configuration
        """
        self.config = config
        self.config.validate()
        self.logger = logging.getLogger(__name__)
        self._cache: Dict[str, Any] = {}
        self._statistics: Dict[str, float] = {}
    
    def load_data(self, path: Path) -> List[Dict]:
        """Load data from file.
        
        Args:
            path: Path to data file
            
        Returns:
            List of data records
        """
        self.logger.info(f"Loading data from {path}")
        
        # Simulate data loading with various formats
        if path.suffix == ".json":
            import json
            with open(path, 'r', encoding=self.config.encoding) as f:
                data = json.load(f)
        elif path.suffix == ".csv":
            # Simplified CSV loading
            data = []
            with open(path, 'r', encoding=self.config.encoding) as f:
                lines = f.readlines()
                headers = lines[0].strip().split(',')
                for line in lines[1:]:
                    values = line.strip().split(',')
                    data.append(dict(zip(headers, values)))
        else:
            # Default text processing
            with open(path, 'r', encoding=self.config.encoding) as f:
                data = [{"text": line.strip()} for line in f if line.strip()]
        
        # Limit to max_items
        if len(data) > self.config.max_items:
            self.logger.warning(f"Truncating data to {self.config.max_items} items")
            data = data[:self.config.max_items]
        
        return data
    
    def process(self, data: List[Dict]) -> List[Dict]:
        """Apply configured processing steps to data.
        
        Args:
            data: Input data records
            
        Returns:
            Processed data records
        """
        result = data
        
        for processor_name in self.config.processors:
            if processor_name == "clean":
                result = self._clean_data(result)
            elif processor_name == "transform":
                result = self._transform_data(result)
            elif processor_name == "aggregate":
                result = self._aggregate_data(result)
            elif processor_name == "filter":
                result = self._filter_data(result)
        
        return result
    
    def _clean_data(self, data: List[Dict]) -> List[Dict]:
        """Clean data by removing invalid entries and normalizing.
        
        Args:
            data: Input data records
            
        Returns:
            Cleaned data records
        """
        self.logger.debug("Cleaning data")
        cleaned = []
        
        for record in data:
            # Remove None values
            cleaned_record = {k: v for k, v in record.items() if v is not None}
            
            # Normalize text fields
            if self.config.normalize:
                for key, value in cleaned_record.items():
                    if isinstance(value, str):
                        # Remove extra whitespace and normalize
                        cleaned_record[key] = re.sub(r'\s+', ' ', value.strip())
            
            if cleaned_record:
                cleaned.append(cleaned_record)
        
        return cleaned
    
    def _transform_data(self, data: List[Dict]) -> List[Dict]:
        """Transform data with various operations.
        
        Args:
            data: Input data records
            
        Returns:
            Transformed data records
        """
        self.logger.debug("Transforming data")
        transformed = []
        
        for record in data:
            new_record = record.copy()
            
            # Add computed fields
            if 'text' in record:
                new_record['word_count'] = len(record['text'].split())
                new_record['char_count'] = len(record['text'])
            
            # Convert numeric strings
            for key, value in record.items():
                if isinstance(value, str) and value.replace('.', '').replace('-', '').isdigit():
                    try:
                        new_record[key] = float(value) if '.' in value else int(value)
                    except ValueError:
                        pass
            
            transformed.append(new_record)
        
        return transformed
    
    def _aggregate_data(self, data: List[Dict]) -> List[Dict]:
        """Aggregate data by grouping and summarizing.
        
        Args:
            data: Input data records
            
        Returns:
            Aggregated data records
        """
        self.logger.debug("Aggregating data")
        
        # Group by available keys
        groups = defaultdict(list)
        
        for record in data:
            # Use first string key as grouping key
            group_key = None
            for key, value in record.items():
                if isinstance(value, str):
                    group_key = value[:10]  # Use prefix for grouping
                    break
            
            if group_key:
                groups[group_key].append(record)
        
        # Create aggregated records
        aggregated = []
        for group_key, records in groups.items():
            agg_record = {
                'group': group_key,
                'count': len(records),
                'records': records[:5]  # Keep sample of records
            }
            
            # Calculate numeric aggregates
            numeric_fields = defaultdict(list)
            for record in records:
                for key, value in record.items():
                    if isinstance(value, (int, float)):
                        numeric_fields[key].append(value)
            
            for field, values in numeric_fields.items():
                if values:
                    agg_record[f'{field}_mean'] = statistics.mean(values)
                    agg_record[f'{field}_sum'] = sum(values)
            
            aggregated.append(agg_record)
        
        return aggregated
    
    def _filter_data(self, data: List[Dict]) -> List[Dict]:
        """Filter data based on conditions.
        
        Args:
            data: Input data records
            
        Returns:
            Filtered data records
        """
        self.logger.debug("Filtering data")
        
        if not self.config.remove_outliers:
            return data
        
        # Calculate statistics for numeric fields
        numeric_stats = defaultdict(list)
        
        for record in data:
            for key, value in record.items():
                if isinstance(value, (int, float)):
                    numeric_stats[key].append(value)
        
        # Calculate outlier bounds
        bounds = {}
        for field, values in numeric_stats.items():
            if len(values) > 1:
                mean = statistics.mean(values)
                stdev = statistics.stdev(values)
                lower = mean - (self.config.outlier_threshold * stdev)
                upper = mean + (self.config.outlier_threshold * stdev)
                bounds[field] = (lower, upper)
        
        # Filter outliers
        filtered = []
        for record in data:
            is_outlier = False
            
            for field, (lower, upper) in bounds.items():
                if field in record:
                    value = record[field]
                    if isinstance(value, (int, float)):
                        if value < lower or value > upper:
                            is_outlier = True
                            break
            
            if not is_outlier:
                filtered.append(record)
        
        removed = len(data) - len(filtered)
        if removed > 0:
            self.logger.info(f"Removed {removed} outliers")
        
        return filtered
    
    def analyze(self, data: List[Dict]) -> Dict[str, Any]:
        """Analyze processed data and generate statistics.
        
        Args:
            data: Processed data records
            
        Returns:
            Analysis results and statistics
        """
        self.logger.info("Analyzing data")
        
        analysis = {
            'total_records': len(data),
            'field_counts': Counter(),
            'field_types': defaultdict(set),
            'statistics': {},
            'samples': data[:3] if data else []
        }
        
        # Analyze fields
        for record in data:
            for key, value in record.items():
                analysis['field_counts'][key] += 1
                analysis['field_types'][key].add(type(value).__name__)
        
        # Convert sets to lists for serialization
        analysis['field_types'] = {
            k: list(v) for k, v in analysis['field_types'].items()
        }
        
        # Calculate statistics for numeric fields
        numeric_data = defaultdict(list)
        
        for record in data:
            for key, value in record.items():
                if isinstance(value, (int, float)):
                    numeric_data[key].append(value)
        
        for field, values in numeric_data.items():
            if values:
                analysis['statistics'][field] = {
                    'mean': statistics.mean(values),
                    'median': statistics.median(values),
                    'min': min(values),
                    'max': max(values),
                    'count': len(values)
                }
                
                if len(values) > 1:
                    analysis['statistics'][field]['stdev'] = statistics.stdev(values)
        
        # Store in cache if enabled
        if self.config.enable_caching:
            cache_key = f"analysis_{id(data)}"
            self._cache[cache_key] = analysis
        
        return analysis
    
    def get_statistics(self) -> Dict[str, float]:
        """Get processing statistics.
        
        Returns:
            Dictionary of processing statistics
        """
        return self._statistics.copy()