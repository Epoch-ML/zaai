"""
Data aggregation functions for the processing module.

This module provides various aggregation operations for summarizing
and consolidating data during processing.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
import statistics
import logging

from core.base import BaseProcessor
from core.exceptions import ProcessingError
from core.registry import register_processor


@dataclass
class AggregationResult:
    """Result of an aggregation operation."""
    
    groups: int = 0
    total_records: int = 0
    aggregations: Dict[str, Any] = field(default_factory=dict)
    group_sizes: Dict[str, int] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@register_processor(tags=["aggregation", "grouping"])
class DataAggregator(BaseProcessor):
    """Main aggregator for grouping and summarizing data."""
    
    def __init__(self, group_by: Optional[List[str]] = None,
                 aggregations: Optional[Dict[str, List[str]]] = None):
        """Initialize data aggregator.
        
        Args:
            group_by: Fields to group by
            aggregations: Dict of field to list of aggregation functions
        """
        super().__init__()
        self.group_by = group_by or []
        self.aggregations = aggregations or {}
        self.result = AggregationResult()
    
    def process(self, input_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process and aggregate input data.
        
        Args:
            input_data: Input records
            
        Returns:
            Aggregated records
        """
        if not self.group_by:
            # No grouping, aggregate all records
            return [self._aggregate_all(input_data)]
        
        # Group records
        groups = self._group_records(input_data)
        
        # Aggregate each group
        results = []
        for group_key, records in groups.items():
            agg_record = self._aggregate_group(group_key, records)
            results.append(agg_record)
        
        # Update result metadata
        self.result.groups = len(groups)
        self.result.total_records = len(input_data)
        self.result.group_sizes = {str(k): len(v) for k, v in groups.items()}
        
        return results
    
    def _group_records(self, records: List[Dict]) -> Dict[Tuple, List[Dict]]:
        """Group records by specified fields.
        
        Args:
            records: Records to group
            
        Returns:
            Dictionary of group key to list of records
        """
        groups = defaultdict(list)
        
        for record in records:
            group_key = tuple(record.get(field) for field in self.group_by)
            groups[group_key].append(record)
        
        return groups
    
    def _aggregate_group(self, group_key: Tuple, records: List[Dict]) -> Dict[str, Any]:
        """Aggregate a single group of records.
        
        Args:
            group_key: Group identifier
            records: Records in the group
            
        Returns:
            Aggregated record
        """
        result = {}
        
        # Add group by fields
        for i, field in enumerate(self.group_by):
            result[field] = group_key[i]
        
        # Apply aggregations
        for field, agg_funcs in self.aggregations.items():
            values = [r.get(field) for r in records 
                     if field in r and r.get(field) is not None]
            
            for func in agg_funcs:
                agg_value = self._apply_aggregation(func, values)
                result[f"{field}_{func}"] = agg_value
        
        # Add group size
        result['_group_size'] = len(records)
        
        return result
    
    def _aggregate_all(self, records: List[Dict]) -> Dict[str, Any]:
        """Aggregate all records without grouping.
        
        Args:
            records: All records
            
        Returns:
            Single aggregated record
        """
        result = {}
        
        for field, agg_funcs in self.aggregations.items():
            values = [r.get(field) for r in records 
                     if field in r and r.get(field) is not None]
            
            for func in agg_funcs:
                agg_value = self._apply_aggregation(func, values)
                result[f"{field}_{func}"] = agg_value
        
        result['_total_records'] = len(records)
        return result
    
    def _apply_aggregation(self, func: str, values: List[Any]) -> Any:
        """Apply an aggregation function to values.
        
        Args:
            func: Aggregation function name
            values: Values to aggregate
            
        Returns:
            Aggregated value
        """
        if not values:
            return None
        
        try:
            if func == "sum":
                return sum(values)
            elif func == "mean" or func == "avg":
                return statistics.mean(values)
            elif func == "median":
                return statistics.median(values)
            elif func == "mode":
                return statistics.mode(values)
            elif func == "min":
                return min(values)
            elif func == "max":
                return max(values)
            elif func == "count":
                return len(values)
            elif func == "distinct":
                return len(set(values))
            elif func == "std":
                return statistics.stdev(values) if len(values) > 1 else 0
            elif func == "variance":
                return statistics.variance(values) if len(values) > 1 else 0
            elif func == "first":
                return values[0] if values else None
            elif func == "last":
                return values[-1] if values else None
            elif func == "list":
                return values
            elif func == "set":
                return list(set(values))
            else:
                self.logger.warning(f"Unknown aggregation function: {func}")
                return None
                
        except Exception as e:
            self.logger.error(f"Aggregation {func} failed: {e}")
            return None
    
    def get_capabilities(self) -> List[str]:
        """Get aggregator capabilities."""
        return [
            'group_by', 'sum', 'mean', 'median', 'mode',
            'min', 'max', 'count', 'distinct', 'std', 'variance'
        ]


class WindowAggregator(BaseProcessor):
    """Aggregator for sliding window operations."""
    
    def __init__(self, window_size: int, step_size: int = 1,
                 aggregations: Optional[Dict[str, List[str]]] = None):
        """Initialize window aggregator.
        
        Args:
            window_size: Size of the window
            step_size: Step between windows
            aggregations: Aggregation functions to apply
        """
        super().__init__()
        self.window_size = window_size
        self.step_size = step_size
        self.aggregations = aggregations or {}
    
    def process(self, input_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Apply sliding window aggregation.
        
        Args:
            input_data: Input records
            
        Returns:
            Windowed aggregation results
        """
        results = []
        
        for i in range(0, len(input_data) - self.window_size + 1, self.step_size):
            window = input_data[i:i + self.window_size]
            
            agg_record = {
                'window_start': i,
                'window_end': i + self.window_size,
                'window_size': len(window)
            }
            
            # Apply aggregations to window
            for field, agg_funcs in self.aggregations.items():
                values = [r.get(field) for r in window 
                         if field in r and r.get(field) is not None]
                
                for func in agg_funcs:
                    agg_value = self._apply_aggregation(func, values)
                    agg_record[f"{field}_{func}"] = agg_value
            
            results.append(agg_record)
        
        return results
    
    def _apply_aggregation(self, func: str, values: List[Any]) -> Any:
        """Apply aggregation function (reuse from DataAggregator)."""
        aggregator = DataAggregator()
        return aggregator._apply_aggregation(func, values)
    
    def get_capabilities(self) -> List[str]:
        """Get window aggregator capabilities."""
        return ['sliding_window', 'rolling_aggregation']


class TimeSeriesAggregator(BaseProcessor):
    """Aggregator for time-series data."""
    
    def __init__(self, time_field: str, interval: str,
                 aggregations: Optional[Dict[str, List[str]]] = None):
        """Initialize time series aggregator.
        
        Args:
            time_field: Field containing timestamp
            interval: Time interval for grouping (hour, day, week, month)
            aggregations: Aggregation functions to apply
        """
        super().__init__()
        self.time_field = time_field
        self.interval = interval
        self.aggregations = aggregations or {}
    
    def process(self, input_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Aggregate data by time intervals.
        
        Args:
            input_data: Input records with timestamps
            
        Returns:
            Time-aggregated records
        """
        # Group by time interval
        time_groups = self._group_by_time(input_data)
        
        # Aggregate each time group
        results = []
        for time_key, records in time_groups.items():
            agg_record = {
                'time_interval': time_key,
                'interval_type': self.interval,
                'record_count': len(records)
            }
            
            # Apply aggregations
            for field, agg_funcs in self.aggregations.items():
                values = [r.get(field) for r in records 
                         if field in r and r.get(field) is not None]
                
                for func in agg_funcs:
                    aggregator = DataAggregator()
                    agg_value = aggregator._apply_aggregation(func, values)
                    agg_record[f"{field}_{func}"] = agg_value
            
            results.append(agg_record)
        
        return sorted(results, key=lambda x: x['time_interval'])
    
    def _group_by_time(self, records: List[Dict]) -> Dict[str, List[Dict]]:
        """Group records by time interval.
        
        Args:
            records: Records with timestamps
            
        Returns:
            Dictionary of time key to records
        """
        from datetime import datetime
        
        groups = defaultdict(list)
        
        for record in records:
            if self.time_field not in record:
                continue
            
            timestamp = record[self.time_field]
            
            # Parse timestamp if string
            if isinstance(timestamp, str):
                try:
                    timestamp = datetime.fromisoformat(timestamp)
                except:
                    continue
            
            # Create time key based on interval
            if self.interval == "hour":
                time_key = timestamp.strftime("%Y-%m-%d %H:00")
            elif self.interval == "day":
                time_key = timestamp.strftime("%Y-%m-%d")
            elif self.interval == "week":
                time_key = timestamp.strftime("%Y-W%U")
            elif self.interval == "month":
                time_key = timestamp.strftime("%Y-%m")
            elif self.interval == "year":
                time_key = timestamp.strftime("%Y")
            else:
                time_key = str(timestamp)
            
            groups[time_key].append(record)
        
        return groups
    
    def get_capabilities(self) -> List[str]:
        """Get time series aggregator capabilities."""
        return ['time_grouping', 'temporal_aggregation', 'interval_based']


class PivotAggregator(BaseProcessor):
    """Aggregator for pivot table operations."""
    
    def __init__(self, index: List[str], columns: str, values: str,
                 agg_func: str = "sum"):
        """Initialize pivot aggregator.
        
        Args:
            index: Fields to use as index
            columns: Field to pivot into columns
            values: Field containing values
            agg_func: Aggregation function
        """
        super().__init__()
        self.index = index
        self.columns = columns
        self.values = values
        self.agg_func = agg_func
    
    def process(self, input_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create pivot table from data.
        
        Args:
            input_data: Input records
            
        Returns:
            Pivoted records
        """
        # Build pivot structure
        pivot_data = defaultdict(lambda: defaultdict(list))
        
        for record in input_data:
            # Create index key
            index_key = tuple(record.get(field) for field in self.index)
            
            # Get column and value
            column_val = record.get(self.columns)
            value_val = record.get(self.values)
            
            if column_val is not None and value_val is not None:
                pivot_data[index_key][column_val].append(value_val)
        
        # Create pivot records
        results = []
        aggregator = DataAggregator()
        
        for index_key, columns in pivot_data.items():
            result = {}
            
            # Add index fields
            for i, field in enumerate(self.index):
                result[field] = index_key[i]
            
            # Add pivoted columns
            for column_val, values in columns.items():
                agg_value = aggregator._apply_aggregation(self.agg_func, values)
                result[str(column_val)] = agg_value
            
            results.append(result)
        
        return results
    
    def get_capabilities(self) -> List[str]:
        """Get pivot aggregator capabilities."""
        return ['pivot_table', 'cross_tabulation']


# Utility aggregation functions

def calculate_percentiles(values: List[Union[int, float]], 
                         percentiles: List[int] = None) -> Dict[str, float]:
    """Calculate percentiles for numeric values.
    
    Args:
        values: Numeric values
        percentiles: Percentiles to calculate (default: [25, 50, 75])
        
    Returns:
        Dictionary of percentile values
    """
    if not values:
        return {}
    
    if percentiles is None:
        percentiles = [25, 50, 75]
    
    sorted_values = sorted(values)
    result = {}
    
    for p in percentiles:
        index = (len(sorted_values) - 1) * p / 100
        lower = int(index)
        upper = lower + 1
        
        if upper >= len(sorted_values):
            result[f"p{p}"] = sorted_values[lower]
        else:
            weight = index - lower
            result[f"p{p}"] = sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight
    
    return result


def calculate_histogram(values: List[Union[int, float]], 
                       bins: int = 10) -> Dict[str, Any]:
    """Calculate histogram for numeric values.
    
    Args:
        values: Numeric values
        bins: Number of bins
        
    Returns:
        Histogram data
    """
    if not values:
        return {'bins': [], 'counts': []}
    
    min_val = min(values)
    max_val = max(values)
    bin_width = (max_val - min_val) / bins if max_val != min_val else 1
    
    # Create bins
    bin_edges = [min_val + i * bin_width for i in range(bins + 1)]
    bin_counts = [0] * bins
    
    # Count values in each bin
    for value in values:
        bin_index = min(int((value - min_val) / bin_width), bins - 1)
        bin_counts[bin_index] += 1
    
    return {
        'bins': bin_edges[:-1],
        'counts': bin_counts,
        'bin_width': bin_width
    }


def calculate_correlation(x_values: List[float], y_values: List[float]) -> float:
    """Calculate correlation between two numeric series.
    
    Args:
        x_values: First series
        y_values: Second series
        
    Returns:
        Correlation coefficient
    """
    if len(x_values) != len(y_values) or len(x_values) < 2:
        return 0.0
    
    n = len(x_values)
    sum_x = sum(x_values)
    sum_y = sum(y_values)
    sum_xy = sum(x * y for x, y in zip(x_values, y_values))
    sum_x2 = sum(x ** 2 for x in x_values)
    sum_y2 = sum(y ** 2 for y in y_values)
    
    numerator = n * sum_xy - sum_x * sum_y
    denominator = ((n * sum_x2 - sum_x ** 2) * (n * sum_y2 - sum_y ** 2)) ** 0.5
    
    if denominator == 0:
        return 0.0
    
    return numerator / denominator