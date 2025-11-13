"""
Data transformation utilities for the processing module.

This module provides various transformers for converting, reshaping,
and enriching data during processing.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Union
import re
import json
import logging
from datetime import datetime

from core.base import BaseTransformer, DataFormat
from core.exceptions import TransformationError
from core.registry import register_transformer
from ingestion.schema import DataType, detect_data_type


@register_transformer(tags=["type", "conversion"])
class TypeTransformer(BaseTransformer):
    """Transformer for data type conversions."""
    
    def __init__(self, type_mapping: Dict[str, DataType]):
        """Initialize type transformer.
        
        Args:
            type_mapping: Mapping of field names to target types
        """
        super().__init__("TypeTransformer")
        self.type_mapping = type_mapping
    
    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform data types according to mapping.
        
        Args:
            data: Input data record
            
        Returns:
            Record with transformed types
        """
        transformed = data.copy()
        
        for field, target_type in self.type_mapping.items():
            if field in transformed:
                value = transformed[field]
                
                try:
                    if target_type == DataType.STRING:
                        transformed[field] = str(value)
                    elif target_type == DataType.INTEGER:
                        transformed[field] = int(value)
                    elif target_type == DataType.FLOAT:
                        transformed[field] = float(value)
                    elif target_type == DataType.BOOLEAN:
                        transformed[field] = bool(value)
                    elif target_type == DataType.DATETIME:
                        if isinstance(value, str):
                            transformed[field] = datetime.fromisoformat(value)
                        elif isinstance(value, (int, float)):
                            transformed[field] = datetime.fromtimestamp(value)
                except (ValueError, TypeError) as e:
                    raise TransformationError(
                        f"Failed to convert {field} to {target_type.value}: {e}",
                        transformer=self.name,
                        input_type=type(value).__name__,
                        output_type=target_type.value
                    )
        
        return transformed
    
    def can_transform(self, data: Any) -> bool:
        """Check if transformer can handle the data.
        
        Args:
            data: Data to check
            
        Returns:
            True if data is a dictionary
        """
        return isinstance(data, dict)


@register_transformer(tags=["normalization", "scaling"])
class NormalizationTransformer(BaseTransformer):
    """Transformer for normalizing numeric values."""
    
    def __init__(self, fields: List[str], method: str = "minmax"):
        """Initialize normalization transformer.
        
        Args:
            fields: Fields to normalize
            method: Normalization method (minmax, zscore, etc.)
        """
        super().__init__("NormalizationTransformer")
        self.fields = fields
        self.method = method
        self.stats = {}
    
    def fit(self, data: List[Dict[str, Any]]) -> None:
        """Fit transformer to data to learn statistics.
        
        Args:
            data: Training data
        """
        # Calculate statistics for each field
        for field in self.fields:
            values = [r.get(field) for r in data if field in r and isinstance(r.get(field), (int, float))]
            
            if values:
                self.stats[field] = {
                    'min': min(values),
                    'max': max(values),
                    'mean': sum(values) / len(values),
                    'std': self._calculate_std(values)
                }
    
    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Apply normalization to data.
        
        Args:
            data: Input data record
            
        Returns:
            Record with normalized values
        """
        transformed = data.copy()
        
        for field in self.fields:
            if field in transformed and field in self.stats:
                value = transformed[field]
                
                if isinstance(value, (int, float)):
                    if self.method == "minmax":
                        # Min-Max normalization: (x - min) / (max - min)
                        min_val = self.stats[field]['min']
                        max_val = self.stats[field]['max']
                        
                        if max_val != min_val:
                            transformed[field] = (value - min_val) / (max_val - min_val)
                    
                    elif self.method == "zscore":
                        # Z-score normalization: (x - mean) / std
                        mean = self.stats[field]['mean']
                        std = self.stats[field]['std']
                        
                        if std != 0:
                            transformed[field] = (value - mean) / std
        
        return transformed
    
    def can_transform(self, data: Any) -> bool:
        """Check if transformer can handle the data."""
        return isinstance(data, dict)
    
    def _calculate_std(self, values: List[float]) -> float:
        """Calculate standard deviation.
        
        Args:
            values: List of numeric values
            
        Returns:
            Standard deviation
        """
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        return variance ** 0.5


@register_transformer(tags=["text", "string"])
class TextTransformer(BaseTransformer):
    """Transformer for text processing operations."""
    
    def __init__(self, operations: List[str] = None):
        """Initialize text transformer.
        
        Args:
            operations: List of operations to apply (lower, upper, trim, etc.)
        """
        super().__init__("TextTransformer")
        self.operations = operations or ["lower", "trim"]
    
    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Apply text transformations.
        
        Args:
            data: Input data record
            
        Returns:
            Record with transformed text fields
        """
        transformed = data.copy()
        
        for key, value in transformed.items():
            if isinstance(value, str):
                for op in self.operations:
                    if op == "lower":
                        value = value.lower()
                    elif op == "upper":
                        value = value.upper()
                    elif op == "trim":
                        value = value.strip()
                    elif op == "normalize_whitespace":
                        value = re.sub(r'\s+', ' ', value)
                    elif op == "remove_punctuation":
                        value = re.sub(r'[^\w\s]', '', value)
                    elif op == "snake_case":
                        value = re.sub(r'[\s\-]+', '_', value.lower())
                
                transformed[key] = value
        
        return transformed
    
    def can_transform(self, data: Any) -> bool:
        """Check if transformer can handle the data."""
        return isinstance(data, dict)


@register_transformer(tags=["aggregation", "grouping"])
class AggregationTransformer(BaseTransformer):
    """Transformer for aggregating multiple records."""
    
    def __init__(self, group_by: List[str], aggregations: Dict[str, str]):
        """Initialize aggregation transformer.
        
        Args:
            group_by: Fields to group by
            aggregations: Aggregation functions per field (sum, mean, count, etc.)
        """
        super().__init__("AggregationTransformer")
        self.group_by = group_by
        self.aggregations = aggregations
        self.groups = {}
    
    def accumulate(self, record: Dict[str, Any]) -> None:
        """Accumulate a record for aggregation.
        
        Args:
            record: Record to accumulate
        """
        # Create group key
        group_key = tuple(record.get(field) for field in self.group_by)
        
        if group_key not in self.groups:
            self.groups[group_key] = {
                'records': [],
                'count': 0
            }
        
        self.groups[group_key]['records'].append(record)
        self.groups[group_key]['count'] += 1
    
    def transform(self, data: Any) -> List[Dict[str, Any]]:
        """Transform accumulated groups into aggregated records.
        
        Args:
            data: Ignored (uses accumulated data)
            
        Returns:
            List of aggregated records
        """
        results = []
        
        for group_key, group_data in self.groups.items():
            result = {}
            
            # Add group by fields
            for i, field in enumerate(self.group_by):
                result[field] = group_key[i]
            
            # Calculate aggregations
            for field, agg_func in self.aggregations.items():
                values = [r.get(field) for r in group_data['records'] 
                         if field in r and r.get(field) is not None]
                
                if agg_func == "sum":
                    result[f"{field}_sum"] = sum(values) if values else 0
                elif agg_func == "mean":
                    result[f"{field}_mean"] = sum(values) / len(values) if values else 0
                elif agg_func == "count":
                    result[f"{field}_count"] = len(values)
                elif agg_func == "min":
                    result[f"{field}_min"] = min(values) if values else None
                elif agg_func == "max":
                    result[f"{field}_max"] = max(values) if values else None
                elif agg_func == "list":
                    result[f"{field}_list"] = values
            
            results.append(result)
        
        return results
    
    def can_transform(self, data: Any) -> bool:
        """Check if transformer can handle the data."""
        return True  # Aggregation works on accumulated data


@register_transformer(tags=["enrichment", "enhancement"])
class EnrichmentTransformer(BaseTransformer):
    """Transformer for enriching data with additional fields."""
    
    def __init__(self, enrichments: Dict[str, Callable]):
        """Initialize enrichment transformer.
        
        Args:
            enrichments: Dictionary of field name to function that generates value
        """
        super().__init__("EnrichmentTransformer")
        self.enrichments = enrichments
    
    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich data with additional fields.
        
        Args:
            data: Input data record
            
        Returns:
            Enriched record
        """
        enriched = data.copy()
        
        for field_name, func in self.enrichments.items():
            try:
                enriched[field_name] = func(data)
            except Exception as e:
                self.logger.warning(f"Failed to enrich field {field_name}: {e}")
                enriched[field_name] = None
        
        return enriched
    
    def can_transform(self, data: Any) -> bool:
        """Check if transformer can handle the data."""
        return isinstance(data, dict)


@register_transformer(tags=["pivoting", "reshaping"])
class PivotTransformer(BaseTransformer):
    """Transformer for pivoting data from long to wide format."""
    
    def __init__(self, index: str, columns: str, values: str):
        """Initialize pivot transformer.
        
        Args:
            index: Field to use as index
            columns: Field to pivot into columns
            values: Field containing values
        """
        super().__init__("PivotTransformer")
        self.index = index
        self.columns = columns
        self.values = values
        self.pivot_data = {}
    
    def accumulate(self, record: Dict[str, Any]) -> None:
        """Accumulate records for pivoting.
        
        Args:
            record: Record to accumulate
        """
        index_val = record.get(self.index)
        column_val = record.get(self.columns)
        value_val = record.get(self.values)
        
        if index_val not in self.pivot_data:
            self.pivot_data[index_val] = {}
        
        self.pivot_data[index_val][column_val] = value_val
    
    def transform(self, data: Any) -> List[Dict[str, Any]]:
        """Transform accumulated data into pivoted format.
        
        Args:
            data: Ignored (uses accumulated data)
            
        Returns:
            List of pivoted records
        """
        results = []
        
        for index_val, columns in self.pivot_data.items():
            result = {self.index: index_val}
            result.update(columns)
            results.append(result)
        
        return results
    
    def can_transform(self, data: Any) -> bool:
        """Check if transformer can handle the data."""
        return True


class CompositeTransformer(BaseTransformer):
    """Transformer that combines multiple transformers."""
    
    def __init__(self, transformers: List[BaseTransformer]):
        """Initialize composite transformer.
        
        Args:
            transformers: List of transformers to apply in sequence
        """
        super().__init__("CompositeTransformer")
        self.transformers = transformers
    
    def transform(self, data: Any) -> Any:
        """Apply all transformers in sequence.
        
        Args:
            data: Input data
            
        Returns:
            Transformed data
        """
        result = data
        
        for transformer in self.transformers:
            if transformer.can_transform(result):
                result = transformer.transform(result)
            else:
                self.logger.warning(
                    f"Transformer {transformer.name} cannot handle data, skipping"
                )
        
        return result
    
    def can_transform(self, data: Any) -> bool:
        """Check if any transformer can handle the data.
        
        Args:
            data: Data to check
            
        Returns:
            True if at least one transformer can handle it
        """
        return any(t.can_transform(data) for t in self.transformers)


# Utility transformation functions

def create_field_mapper(mapping: Dict[str, str]) -> Callable:
    """Create a field mapping function.
    
    Args:
        mapping: Old field name to new field name mapping
        
    Returns:
        Transformation function
    """
    def mapper(record: Dict) -> Dict:
        result = {}
        for old_name, value in record.items():
            new_name = mapping.get(old_name, old_name)
            result[new_name] = value
        return result
    
    return mapper


def create_field_filter(fields: List[str], keep: bool = True) -> Callable:
    """Create a field filtering function.
    
    Args:
        fields: Fields to filter
        keep: If True, keep only these fields; if False, remove these fields
        
    Returns:
        Transformation function
    """
    def filter_func(record: Dict) -> Dict:
        if keep:
            return {k: v for k, v in record.items() if k in fields}
        else:
            return {k: v for k, v in record.items() if k not in fields}
    
    return filter_func


def create_value_mapper(field: str, mapping: Dict[Any, Any]) -> Callable:
    """Create a value mapping function for a specific field.
    
    Args:
        field: Field to map values for
        mapping: Old value to new value mapping
        
    Returns:
        Transformation function
    """
    def mapper(record: Dict) -> Dict:
        result = record.copy()
        if field in result:
            result[field] = mapping.get(result[field], result[field])
        return result
    
    return mapper