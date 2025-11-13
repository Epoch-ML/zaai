"""
Schema detection and validation for ingested data.

This module provides functionality to detect, validate, and enforce
schemas on ingested data.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Union, Type
import json
import logging

from core.exceptions import SchemaError, ValidationError
from core.validators import BaseValidator, TypeValidator, SchemaValidator


class DataType(Enum):
    """Supported data types in schemas."""
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    DATETIME = "datetime"
    DATE = "date"
    TIME = "time"
    OBJECT = "object"
    ARRAY = "array"
    NULL = "null"
    UNKNOWN = "unknown"


@dataclass
class FieldSchema:
    """Schema definition for a single field."""
    
    name: str
    data_type: DataType
    nullable: bool = True
    unique: bool = False
    primary_key: bool = False
    foreign_key: Optional[str] = None
    default: Any = None
    min_value: Optional[Union[int, float]] = None
    max_value: Optional[Union[int, float]] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    pattern: Optional[str] = None
    enum_values: Optional[List[Any]] = None
    description: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def validate_value(self, value: Any) -> bool:
        """Validate a value against this field schema.
        
        Args:
            value: Value to validate
            
        Returns:
            True if value is valid
            
        Raises:
            ValidationError: If value is invalid
        """
        # Check null values
        if value is None:
            if not self.nullable:
                raise ValidationError(f"Field '{self.name}' cannot be null")
            return True
        
        # Check data type
        if not self._check_type(value):
            raise ValidationError(
                f"Field '{self.name}' expected type {self.data_type.value}, "
                f"got {type(value).__name__}"
            )
        
        # Check numeric constraints
        if self.data_type in [DataType.INTEGER, DataType.FLOAT]:
            if self.min_value is not None and value < self.min_value:
                raise ValidationError(
                    f"Field '{self.name}' value {value} is below minimum {self.min_value}"
                )
            if self.max_value is not None and value > self.max_value:
                raise ValidationError(
                    f"Field '{self.name}' value {value} is above maximum {self.max_value}"
                )
        
        # Check string constraints
        if self.data_type == DataType.STRING:
            if self.min_length is not None and len(value) < self.min_length:
                raise ValidationError(
                    f"Field '{self.name}' length {len(value)} is below minimum {self.min_length}"
                )
            if self.max_length is not None and len(value) > self.max_length:
                raise ValidationError(
                    f"Field '{self.name}' length {len(value)} is above maximum {self.max_length}"
                )
            
            if self.pattern:
                import re
                if not re.match(self.pattern, value):
                    raise ValidationError(
                        f"Field '{self.name}' value does not match pattern {self.pattern}"
                    )
        
        # Check enum values
        if self.enum_values and value not in self.enum_values:
            raise ValidationError(
                f"Field '{self.name}' value {value} not in allowed values: {self.enum_values}"
            )
        
        return True
    
    def _check_type(self, value: Any) -> bool:
        """Check if value matches expected type.
        
        Args:
            value: Value to check
            
        Returns:
            True if type matches
        """
        type_checks = {
            DataType.STRING: lambda v: isinstance(v, str),
            DataType.INTEGER: lambda v: isinstance(v, int) and not isinstance(v, bool),
            DataType.FLOAT: lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
            DataType.BOOLEAN: lambda v: isinstance(v, bool),
            DataType.OBJECT: lambda v: isinstance(v, dict),
            DataType.ARRAY: lambda v: isinstance(v, list),
            DataType.DATETIME: lambda v: isinstance(v, str),  # Simplified check
            DataType.DATE: lambda v: isinstance(v, str),
            DataType.TIME: lambda v: isinstance(v, str),
        }
        
        checker = type_checks.get(self.data_type)
        return checker(value) if checker else True


@dataclass
class TableSchema:
    """Schema definition for a table/collection."""
    
    name: str
    fields: List[FieldSchema]
    primary_key: Optional[List[str]] = None
    foreign_keys: Optional[Dict[str, str]] = None
    indexes: Optional[List[List[str]]] = None
    constraints: Optional[List[str]] = None
    description: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """Post-initialization processing."""
        # Build field index for quick lookup
        self._field_index = {field.name: field for field in self.fields}
        
        # Auto-detect primary key if not specified
        if not self.primary_key:
            pk_fields = [f.name for f in self.fields if f.primary_key]
            if pk_fields:
                self.primary_key = pk_fields
    
    def get_field(self, name: str) -> Optional[FieldSchema]:
        """Get field schema by name.
        
        Args:
            name: Field name
            
        Returns:
            Field schema or None
        """
        return self._field_index.get(name)
    
    def validate_record(self, record: Dict[str, Any]) -> bool:
        """Validate a record against this schema.
        
        Args:
            record: Record to validate
            
        Returns:
            True if record is valid
            
        Raises:
            ValidationError: If record is invalid
        """
        # Check for required fields
        record_fields = set(record.keys())
        schema_fields = set(self._field_index.keys())
        
        # Check for missing required fields
        required_fields = {f.name for f in self.fields if not f.nullable and f.default is None}
        missing = required_fields - record_fields
        if missing:
            raise ValidationError(f"Missing required fields: {missing}")
        
        # Check for unexpected fields (optional, could be configurable)
        unexpected = record_fields - schema_fields
        if unexpected:
            logging.warning(f"Unexpected fields in record: {unexpected}")
        
        # Validate each field
        for field_name, value in record.items():
            if field_name in self._field_index:
                field_schema = self._field_index[field_name]
                field_schema.validate_value(value)
        
        return True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert schema to dictionary representation.
        
        Returns:
            Schema as dictionary
        """
        return {
            'name': self.name,
            'fields': [
                {
                    'name': f.name,
                    'type': f.data_type.value,
                    'nullable': f.nullable,
                    'constraints': {
                        k: v for k, v in {
                            'unique': f.unique,
                            'primary_key': f.primary_key,
                            'foreign_key': f.foreign_key,
                            'min_value': f.min_value,
                            'max_value': f.max_value,
                            'min_length': f.min_length,
                            'max_length': f.max_length,
                            'pattern': f.pattern,
                            'enum': f.enum_values
                        }.items() if v
                    }
                }
                for f in self.fields
            ],
            'primary_key': self.primary_key,
            'foreign_keys': self.foreign_keys,
            'indexes': self.indexes
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TableSchema':
        """Create schema from dictionary.
        
        Args:
            data: Schema dictionary
            
        Returns:
            TableSchema instance
        """
        fields = []
        for field_data in data.get('fields', []):
            constraints = field_data.get('constraints', {})
            field = FieldSchema(
                name=field_data['name'],
                data_type=DataType(field_data['type']),
                nullable=field_data.get('nullable', True),
                unique=constraints.get('unique', False),
                primary_key=constraints.get('primary_key', False),
                foreign_key=constraints.get('foreign_key'),
                min_value=constraints.get('min_value'),
                max_value=constraints.get('max_value'),
                min_length=constraints.get('min_length'),
                max_length=constraints.get('max_length'),
                pattern=constraints.get('pattern'),
                enum_values=constraints.get('enum')
            )
            fields.append(field)
        
        return cls(
            name=data['name'],
            fields=fields,
            primary_key=data.get('primary_key'),
            foreign_keys=data.get('foreign_keys'),
            indexes=data.get('indexes')
        )


def detect_data_type(value: Any) -> DataType:
    """Detect the data type of a value.
    
    Args:
        value: Value to analyze
        
    Returns:
        Detected data type
    """
    if value is None:
        return DataType.NULL
    elif isinstance(value, bool):
        return DataType.BOOLEAN
    elif isinstance(value, int):
        return DataType.INTEGER
    elif isinstance(value, float):
        return DataType.FLOAT
    elif isinstance(value, str):
        # Try to detect datetime/date patterns
        import re
        if re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', value):
            return DataType.DATETIME
        elif re.match(r'^\d{4}-\d{2}-\d{2}$', value):
            return DataType.DATE
        elif re.match(r'^\d{2}:\d{2}:\d{2}$', value):
            return DataType.TIME
        else:
            return DataType.STRING
    elif isinstance(value, dict):
        return DataType.OBJECT
    elif isinstance(value, list):
        return DataType.ARRAY
    else:
        return DataType.UNKNOWN


def detect_schema(records: List[Dict[str, Any]], 
                  sample_size: Optional[int] = None) -> Dict[str, Any]:
    """Detect schema from sample records.
    
    Args:
        records: Sample records
        sample_size: Maximum number of records to analyze
        
    Returns:
        Detected schema dictionary
    """
    if not records:
        return {'fields': [], 'record_count': 0}
    
    # Limit sample size if specified
    if sample_size:
        records = records[:sample_size]
    
    # Collect field information
    field_info = {}
    
    for record in records:
        for field_name, value in record.items():
            if field_name not in field_info:
                field_info[field_name] = {
                    'types': [],
                    'nullable': False,
                    'values': set(),
                    'min': None,
                    'max': None,
                    'min_length': None,
                    'max_length': None
                }
            
            info = field_info[field_name]
            
            # Track data types
            data_type = detect_data_type(value)
            info['types'].append(data_type)
            
            # Track null values
            if value is None:
                info['nullable'] = True
            else:
                # Track unique values (for potential enum detection)
                if len(info['values']) < 100:  # Limit to avoid memory issues
                    info['values'].add(value)
                
                # Track numeric ranges
                if isinstance(value, (int, float)):
                    if info['min'] is None or value < info['min']:
                        info['min'] = value
                    if info['max'] is None or value > info['max']:
                        info['max'] = value
                
                # Track string lengths
                if isinstance(value, str):
                    length = len(value)
                    if info['min_length'] is None or length < info['min_length']:
                        info['min_length'] = length
                    if info['max_length'] is None or length > info['max_length']:
                        info['max_length'] = length
    
    # Build schema from collected information
    fields = []
    
    for field_name, info in field_info.items():
        # Determine primary data type (most common non-null type)
        type_counts = {}
        for dt in info['types']:
            if dt != DataType.NULL:
                type_counts[dt] = type_counts.get(dt, 0) + 1
        
        if type_counts:
            primary_type = max(type_counts, key=type_counts.get)
        else:
            primary_type = DataType.STRING  # Default
        
        field_schema = {
            'name': field_name,
            'type': primary_type.value,
            'nullable': info['nullable']
        }
        
        # Add constraints if detected
        if info['values'] and len(info['values']) < 10:
            # Potential enum field
            field_schema['enum'] = list(info['values'])
        
        if primary_type in [DataType.INTEGER, DataType.FLOAT]:
            if info['min'] is not None:
                field_schema['min_value'] = info['min']
            if info['max'] is not None:
                field_schema['max_value'] = info['max']
        
        if primary_type == DataType.STRING:
            if info['min_length'] is not None:
                field_schema['min_length'] = info['min_length']
            if info['max_length'] is not None:
                field_schema['max_length'] = info['max_length']
        
        fields.append(field_schema)
    
    return {
        'fields': fields,
        'record_count': len(records),
        'detected': True
    }


class SchemaEvolution:
    """Handles schema evolution and compatibility."""
    
    def __init__(self):
        """Initialize schema evolution handler."""
        self.logger = logging.getLogger(__name__)
    
    def compare_schemas(self, old_schema: TableSchema, 
                       new_schema: TableSchema) -> Dict[str, Any]:
        """Compare two schemas and identify differences.
        
        Args:
            old_schema: Previous schema version
            new_schema: New schema version
            
        Returns:
            Dictionary describing differences
        """
        differences = {
            'compatible': True,
            'added_fields': [],
            'removed_fields': [],
            'modified_fields': [],
            'type_changes': []
        }
        
        old_fields = {f.name: f for f in old_schema.fields}
        new_fields = {f.name: f for f in new_schema.fields}
        
        # Find added fields
        for name in new_fields:
            if name not in old_fields:
                differences['added_fields'].append(name)
        
        # Find removed fields
        for name in old_fields:
            if name not in new_fields:
                differences['removed_fields'].append(name)
                # Removed required fields break compatibility
                if not old_fields[name].nullable:
                    differences['compatible'] = False
        
        # Find modified fields
        for name in old_fields:
            if name in new_fields:
                old_field = old_fields[name]
                new_field = new_fields[name]
                
                if old_field.data_type != new_field.data_type:
                    differences['type_changes'].append({
                        'field': name,
                        'old_type': old_field.data_type.value,
                        'new_type': new_field.data_type.value
                    })
                    # Type changes usually break compatibility
                    differences['compatible'] = False
                
                # Check other modifications
                modifications = []
                if old_field.nullable != new_field.nullable:
                    modifications.append('nullable')
                    if not new_field.nullable and old_field.nullable:
                        differences['compatible'] = False
                
                if modifications:
                    differences['modified_fields'].append({
                        'field': name,
                        'modifications': modifications
                    })
        
        return differences