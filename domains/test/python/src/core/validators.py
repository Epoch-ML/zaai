"""
Validation utilities for the analytics platform.

This module provides validators for data types, schemas, configurations,
and other platform components.
"""

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Type, Union
from pathlib import Path

from .exceptions import ValidationError, SchemaError


@dataclass
class ValidationRule:
    """Represents a validation rule."""
    
    name: str
    validator: Callable[[Any], bool]
    error_message: str
    required: bool = True
    
    def validate(self, value: Any) -> bool:
        """Apply the validation rule.
        
        Args:
            value: Value to validate
            
        Returns:
            True if validation passes
            
        Raises:
            ValidationError: If validation fails
        """
        if value is None and not self.required:
            return True
        
        if value is None and self.required:
            raise ValidationError(f"{self.name}: Value is required")
        
        try:
            result = self.validator(value)
            if not result:
                raise ValidationError(f"{self.name}: {self.error_message}")
            return True
        except Exception as e:
            if isinstance(e, ValidationError):
                raise
            raise ValidationError(f"{self.name}: Validation failed - {str(e)}")


class BaseValidator(ABC):
    """Abstract base class for validators."""
    
    def __init__(self, strict: bool = False):
        """Initialize validator.
        
        Args:
            strict: If True, raise exceptions on validation failure
        """
        self.strict = strict
        self.errors: List[str] = []
    
    @abstractmethod
    def validate(self, value: Any) -> bool:
        """Validate a value.
        
        Args:
            value: Value to validate
            
        Returns:
            True if validation passes
        """
        pass
    
    def __call__(self, value: Any) -> bool:
        """Make validator callable.
        
        Args:
            value: Value to validate
            
        Returns:
            True if validation passes
        """
        return self.validate(value)
    
    def add_error(self, error: str) -> None:
        """Add a validation error.
        
        Args:
            error: Error message
        """
        self.errors.append(error)
        if self.strict:
            raise ValidationError(error)
    
    def clear_errors(self) -> None:
        """Clear all validation errors."""
        self.errors.clear()
    
    def get_errors(self) -> List[str]:
        """Get list of validation errors.
        
        Returns:
            List of error messages
        """
        return self.errors.copy()


class TypeValidator(BaseValidator):
    """Validator for checking data types."""
    
    def __init__(self, expected_type: Type, strict: bool = False):
        """Initialize type validator.
        
        Args:
            expected_type: Expected data type
            strict: If True, raise exceptions on validation failure
        """
        super().__init__(strict)
        self.expected_type = expected_type
    
    def validate(self, value: Any) -> bool:
        """Validate that value matches expected type.
        
        Args:
            value: Value to validate
            
        Returns:
            True if type matches
        """
        if not isinstance(value, self.expected_type):
            self.add_error(
                f"Expected type {self.expected_type.__name__}, "
                f"got {type(value).__name__}"
            )
            return False
        return True


class RangeValidator(BaseValidator):
    """Validator for numeric ranges."""
    
    def __init__(self, min_value: Optional[float] = None,
                 max_value: Optional[float] = None, strict: bool = False):
        """Initialize range validator.
        
        Args:
            min_value: Minimum allowed value
            max_value: Maximum allowed value
            strict: If True, raise exceptions on validation failure
        """
        super().__init__(strict)
        self.min_value = min_value
        self.max_value = max_value
    
    def validate(self, value: Any) -> bool:
        """Validate that value is within range.
        
        Args:
            value: Value to validate
            
        Returns:
            True if value is within range
        """
        if not isinstance(value, (int, float)):
            self.add_error(f"Value must be numeric, got {type(value).__name__}")
            return False
        
        if self.min_value is not None and value < self.min_value:
            self.add_error(f"Value {value} is below minimum {self.min_value}")
            return False
        
        if self.max_value is not None and value > self.max_value:
            self.add_error(f"Value {value} is above maximum {self.max_value}")
            return False
        
        return True


class PatternValidator(BaseValidator):
    """Validator for string patterns using regex."""
    
    def __init__(self, pattern: str, strict: bool = False):
        """Initialize pattern validator.
        
        Args:
            pattern: Regular expression pattern
            strict: If True, raise exceptions on validation failure
        """
        super().__init__(strict)
        self.pattern = re.compile(pattern)
    
    def validate(self, value: Any) -> bool:
        """Validate that value matches pattern.
        
        Args:
            value: Value to validate
            
        Returns:
            True if value matches pattern
        """
        if not isinstance(value, str):
            self.add_error(f"Value must be string, got {type(value).__name__}")
            return False
        
        if not self.pattern.match(value):
            self.add_error(f"Value '{value}' does not match pattern {self.pattern.pattern}")
            return False
        
        return True


class SchemaValidator(BaseValidator):
    """Validator for dictionary schemas."""
    
    def __init__(self, schema: Dict[str, Union[Type, ValidationRule]], 
                 strict: bool = False):
        """Initialize schema validator.
        
        Args:
            schema: Dictionary defining expected structure
            strict: If True, raise exceptions on validation failure
        """
        super().__init__(strict)
        self.schema = schema
    
    def validate(self, value: Any) -> bool:
        """Validate that value matches schema.
        
        Args:
            value: Value to validate
            
        Returns:
            True if value matches schema
        """
        if not isinstance(value, dict):
            self.add_error(f"Value must be dictionary, got {type(value).__name__}")
            return False
        
        valid = True
        
        # Check required fields
        for field, rule in self.schema.items():
            if isinstance(rule, ValidationRule):
                if rule.required and field not in value:
                    self.add_error(f"Required field '{field}' is missing")
                    valid = False
                elif field in value:
                    try:
                        rule.validate(value[field])
                    except ValidationError as e:
                        self.add_error(f"Field '{field}': {str(e)}")
                        valid = False
            elif isinstance(rule, type):
                if field not in value:
                    self.add_error(f"Required field '{field}' is missing")
                    valid = False
                elif not isinstance(value[field], rule):
                    self.add_error(
                        f"Field '{field}' expected type {rule.__name__}, "
                        f"got {type(value[field]).__name__}"
                    )
                    valid = False
        
        # Check for unexpected fields in strict mode
        if self.strict:
            unexpected = set(value.keys()) - set(self.schema.keys())
            if unexpected:
                self.add_error(f"Unexpected fields: {unexpected}")
                valid = False
        
        return valid


class FileValidator(BaseValidator):
    """Validator for file paths and properties."""
    
    def __init__(self, must_exist: bool = True, 
                 allowed_extensions: Optional[List[str]] = None,
                 max_size_bytes: Optional[int] = None, strict: bool = False):
        """Initialize file validator.
        
        Args:
            must_exist: If True, file must exist
            allowed_extensions: List of allowed file extensions
            max_size_bytes: Maximum file size in bytes
            strict: If True, raise exceptions on validation failure
        """
        super().__init__(strict)
        self.must_exist = must_exist
        self.allowed_extensions = allowed_extensions
        self.max_size_bytes = max_size_bytes
    
    def validate(self, value: Any) -> bool:
        """Validate file path.
        
        Args:
            value: File path to validate
            
        Returns:
            True if file path is valid
        """
        if isinstance(value, str):
            path = Path(value)
        elif isinstance(value, Path):
            path = value
        else:
            self.add_error(f"Value must be string or Path, got {type(value).__name__}")
            return False
        
        if self.must_exist and not path.exists():
            self.add_error(f"File does not exist: {path}")
            return False
        
        if path.exists() and not path.is_file():
            self.add_error(f"Path is not a file: {path}")
            return False
        
        if self.allowed_extensions:
            if path.suffix not in self.allowed_extensions:
                self.add_error(
                    f"File extension '{path.suffix}' not in allowed "
                    f"extensions: {self.allowed_extensions}"
                )
                return False
        
        if self.max_size_bytes and path.exists():
            size = path.stat().st_size
            if size > self.max_size_bytes:
                self.add_error(
                    f"File size {size} bytes exceeds maximum "
                    f"{self.max_size_bytes} bytes"
                )
                return False
        
        return True


class CompositeValidator(BaseValidator):
    """Validator that combines multiple validators."""
    
    def __init__(self, validators: List[BaseValidator], 
                 require_all: bool = True, strict: bool = False):
        """Initialize composite validator.
        
        Args:
            validators: List of validators to apply
            require_all: If True, all validators must pass
            strict: If True, raise exceptions on validation failure
        """
        super().__init__(strict)
        self.validators = validators
        self.require_all = require_all
    
    def validate(self, value: Any) -> bool:
        """Validate using all sub-validators.
        
        Args:
            value: Value to validate
            
        Returns:
            True if validation passes
        """
        results = []
        
        for validator in self.validators:
            try:
                result = validator.validate(value)
                results.append(result)
                if not result:
                    self.errors.extend(validator.get_errors())
                    if self.require_all:
                        return False
            except ValidationError as e:
                self.add_error(str(e))
                if self.require_all:
                    return False
        
        if self.require_all:
            return all(results)
        else:
            return any(results)


# Utility functions for common validations

def validate_email(email: str) -> bool:
    """Validate email address format.
    
    Args:
        email: Email address to validate
        
    Returns:
        True if email format is valid
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_url(url: str) -> bool:
    """Validate URL format.
    
    Args:
        url: URL to validate
        
    Returns:
        True if URL format is valid
    """
    pattern = r'^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)$'
    return bool(re.match(pattern, url))


def validate_json_schema(data: Dict, schema: Dict) -> bool:
    """Validate data against JSON schema.
    
    Args:
        data: Data to validate
        schema: JSON schema definition
        
    Returns:
        True if data matches schema
    """
    # Simplified JSON schema validation
    validator = SchemaValidator(schema, strict=True)
    return validator.validate(data)