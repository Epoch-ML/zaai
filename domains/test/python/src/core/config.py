"""
Configuration management for the analytics platform.

This module handles loading, validation, and management of platform
configuration from various sources.
"""

import json
import os
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import logging

from .exceptions import ConfigurationError
from .validators import SchemaValidator, ValidationRule


class ConfigSource(Enum):
    """Configuration source types."""
    FILE = "file"
    ENVIRONMENT = "environment"
    DEFAULT = "default"
    RUNTIME = "runtime"


@dataclass
class ProcessingConfig:
    """Configuration for data processing operations."""
    
    max_workers: int = 4
    batch_size: int = 1000
    timeout_seconds: float = 300.0
    retry_attempts: int = 3
    retry_delay: float = 1.0
    enable_caching: bool = True
    cache_ttl_seconds: int = 3600
    memory_limit_mb: int = 1024
    temp_directory: str = "/tmp/analytics"
    
    def validate(self) -> bool:
        """Validate configuration values.
        
        Returns:
            True if configuration is valid
            
        Raises:
            ConfigurationError: If configuration is invalid
        """
        if self.max_workers <= 0:
            raise ConfigurationError("max_workers must be positive", "max_workers")
        
        if self.batch_size <= 0:
            raise ConfigurationError("batch_size must be positive", "batch_size")
        
        if self.timeout_seconds <= 0:
            raise ConfigurationError("timeout_seconds must be positive", "timeout_seconds")
        
        if self.memory_limit_mb <= 0:
            raise ConfigurationError("memory_limit_mb must be positive", "memory_limit_mb")
        
        return True


@dataclass
class IngestionConfig:
    """Configuration for data ingestion."""
    
    supported_formats: List[str] = field(default_factory=lambda: ["json", "csv", "parquet"])
    max_file_size_mb: int = 100
    encoding: str = "utf-8"
    delimiter: str = ","
    compression: Optional[str] = None
    validate_schema: bool = True
    parse_dates: bool = True
    chunk_size: int = 10000
    connection_timeout: float = 30.0
    read_timeout: float = 60.0
    
    def validate(self) -> bool:
        """Validate configuration values.
        
        Returns:
            True if configuration is valid
        """
        if self.max_file_size_mb <= 0:
            raise ConfigurationError("max_file_size_mb must be positive", "max_file_size_mb")
        
        if self.chunk_size <= 0:
            raise ConfigurationError("chunk_size must be positive", "chunk_size")
        
        return True


@dataclass
class VisualizationConfig:
    """Configuration for data visualization."""
    
    default_theme: str = "modern"
    available_themes: List[str] = field(default_factory=lambda: ["modern", "classic", "dark"])
    export_formats: List[str] = field(default_factory=lambda: ["pdf", "html", "png", "svg"])
    default_width: int = 800
    default_height: int = 600
    dpi: int = 96
    font_family: str = "Arial"
    font_size: int = 12
    color_palette: List[str] = field(default_factory=lambda: [
        "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
        "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
    ])
    
    def validate(self) -> bool:
        """Validate configuration values.
        
        Returns:
            True if configuration is valid
        """
        if self.default_theme not in self.available_themes:
            raise ConfigurationError(
                f"default_theme must be one of {self.available_themes}",
                "default_theme"
            )
        
        if self.default_width <= 0 or self.default_height <= 0:
            raise ConfigurationError("Dimensions must be positive", "dimensions")
        
        return True


@dataclass
class PlatformConfig:
    """Main platform configuration."""
    
    name: str = "Analytics Platform"
    version: str = "1.0.0"
    environment: str = "development"
    debug: bool = False
    log_level: str = "INFO"
    data_directory: str = "./data"
    output_directory: str = "./output"
    
    # Sub-configurations
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)
    ingestion: IngestionConfig = field(default_factory=IngestionConfig)
    visualization: VisualizationConfig = field(default_factory=VisualizationConfig)
    
    # Metadata
    config_sources: List[ConfigSource] = field(default_factory=list)
    
    def validate(self) -> bool:
        """Validate all configuration sections.
        
        Returns:
            True if all configuration is valid
        """
        # Validate main config
        valid_log_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if self.log_level not in valid_log_levels:
            raise ConfigurationError(
                f"log_level must be one of {valid_log_levels}",
                "log_level"
            )
        
        # Validate sub-configurations
        self.processing.validate()
        self.ingestion.validate()
        self.visualization.validate()
        
        return True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary.
        
        Returns:
            Configuration as dictionary
        """
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PlatformConfig':
        """Create configuration from dictionary.
        
        Args:
            data: Configuration dictionary
            
        Returns:
            PlatformConfig instance
        """
        # Extract sub-configurations
        processing_data = data.pop('processing', {})
        ingestion_data = data.pop('ingestion', {})
        visualization_data = data.pop('visualization', {})
        
        # Remove metadata fields
        data.pop('config_sources', None)
        
        # Create sub-configurations
        processing = ProcessingConfig(**processing_data)
        ingestion = IngestionConfig(**ingestion_data)
        visualization = VisualizationConfig(**visualization_data)
        
        # Create main configuration
        return cls(
            **data,
            processing=processing,
            ingestion=ingestion,
            visualization=visualization
        )


class ConfigManager:
    """Manager for loading and managing configuration."""
    
    def __init__(self, config: Optional[PlatformConfig] = None):
        """Initialize configuration manager.
        
        Args:
            config: Initial configuration
        """
        self.config = config or PlatformConfig()
        self.logger = logging.getLogger(__name__)
        self._overrides: Dict[str, Any] = {}
    
    def load_from_file(self, path: Union[str, Path]) -> None:
        """Load configuration from file.
        
        Args:
            path: Path to configuration file
            
        Raises:
            ConfigurationError: If file cannot be loaded
        """
        path = Path(path)
        
        if not path.exists():
            raise ConfigurationError(f"Configuration file not found: {path}")
        
        try:
            with open(path, 'r') as f:
                if path.suffix == '.json':
                    data = json.load(f)
                elif path.suffix in ['.yaml', '.yml']:
                    # Simplified YAML loading (would use pyyaml in production)
                    import yaml
                    data = yaml.safe_load(f)
                else:
                    raise ConfigurationError(f"Unsupported file format: {path.suffix}")
            
            self.config = PlatformConfig.from_dict(data)
            self.config.config_sources.append(ConfigSource.FILE)
            self.logger.info(f"Configuration loaded from {path}")
            
        except json.JSONDecodeError as e:
            raise ConfigurationError(f"Invalid JSON in {path}: {e}")
        except Exception as e:
            raise ConfigurationError(f"Failed to load configuration from {path}: {e}")
    
    def load_from_environment(self, prefix: str = "ANALYTICS_") -> None:
        """Load configuration from environment variables.
        
        Args:
            prefix: Prefix for environment variables
        """
        env_config = {}
        
        for key, value in os.environ.items():
            if key.startswith(prefix):
                # Remove prefix and convert to lowercase
                config_key = key[len(prefix):].lower()
                
                # Convert underscores to dots for nested config
                config_key = config_key.replace('_', '.')
                
                # Try to parse value as JSON
                try:
                    parsed_value = json.loads(value)
                except (json.JSONDecodeError, TypeError):
                    parsed_value = value
                
                # Set nested configuration value
                self._set_nested_value(env_config, config_key, parsed_value)
        
        if env_config:
            # Merge with existing configuration
            self._merge_config(env_config)
            self.config.config_sources.append(ConfigSource.ENVIRONMENT)
            self.logger.info("Configuration loaded from environment variables")
    
    def _set_nested_value(self, config: Dict, key: str, value: Any) -> None:
        """Set a nested configuration value.
        
        Args:
            config: Configuration dictionary
            key: Dot-separated key path
            value: Value to set
        """
        keys = key.split('.')
        current = config
        
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            current = current[k]
        
        current[keys[-1]] = value
    
    def _merge_config(self, updates: Dict[str, Any]) -> None:
        """Merge configuration updates.
        
        Args:
            updates: Configuration updates to merge
        """
        current = self.config.to_dict()
        
        # Deep merge updates into current configuration
        def deep_merge(base: Dict, update: Dict) -> Dict:
            for key, value in update.items():
                if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                    deep_merge(base[key], value)
                else:
                    base[key] = value
            return base
        
        merged = deep_merge(current, updates)
        self.config = PlatformConfig.from_dict(merged)
    
    def override(self, key: str, value: Any) -> None:
        """Override a configuration value at runtime.
        
        Args:
            key: Configuration key (dot-separated for nested)
            value: New value
        """
        self._overrides[key] = value
        override_dict = {}
        self._set_nested_value(override_dict, key, value)
        self._merge_config(override_dict)
        
        if ConfigSource.RUNTIME not in self.config.config_sources:
            self.config.config_sources.append(ConfigSource.RUNTIME)
        
        self.logger.debug(f"Configuration override: {key} = {value}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get a configuration value.
        
        Args:
            key: Configuration key (dot-separated for nested)
            default: Default value if key not found
            
        Returns:
            Configuration value
        """
        keys = key.split('.')
        current = self.config.to_dict()
        
        try:
            for k in keys:
                current = current[k]
            return current
        except (KeyError, TypeError):
            return default
    
    def validate(self) -> bool:
        """Validate the current configuration.
        
        Returns:
            True if configuration is valid
        """
        return self.config.validate()
    
    def save_to_file(self, path: Union[str, Path]) -> None:
        """Save configuration to file.
        
        Args:
            path: Path to save configuration
        """
        path = Path(path)
        
        with open(path, 'w') as f:
            if path.suffix == '.json':
                json.dump(self.config.to_dict(), f, indent=2)
            else:
                # Default to JSON format
                json.dump(self.config.to_dict(), f, indent=2)
        
        self.logger.info(f"Configuration saved to {path}")


# Global configuration instance
_global_config = ConfigManager()


def get_config() -> PlatformConfig:
    """Get global configuration instance.
    
    Returns:
        Global PlatformConfig instance
    """
    return _global_config.config


def configure(**kwargs) -> None:
    """Configure global settings.
    
    Args:
        **kwargs: Configuration overrides
    """
    for key, value in kwargs.items():
        _global_config.override(key, value)