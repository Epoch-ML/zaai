"""
Component registry for the analytics platform.

This module provides a centralized registry for managing and discovering
platform components like processors, transformers, and visualizers.
"""

import inspect
import logging
from abc import ABC
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Type, TypeVar, Generic

from .base import BaseComponent, BaseProcessor, BaseTransformer
from .exceptions import PlatformError


T = TypeVar('T')


class ComponentType(Enum):
    """Types of components that can be registered."""
    PROCESSOR = "processor"
    TRANSFORMER = "transformer"
    INGESTER = "ingester"
    VISUALIZER = "visualizer"
    CONNECTOR = "connector"
    VALIDATOR = "validator"
    AGGREGATOR = "aggregator"
    EXPORTER = "exporter"


@dataclass
class ComponentMetadata:
    """Metadata for registered components."""
    
    name: str
    component_type: ComponentType
    class_type: Type
    module: str
    version: str = "1.0.0"
    description: str = ""
    author: str = ""
    tags: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    registered_at: datetime = field(default_factory=datetime.now)
    capabilities: List[str] = field(default_factory=list)
    config_schema: Optional[Dict] = None
    
    def matches_tags(self, tags: List[str]) -> bool:
        """Check if component matches any of the given tags.
        
        Args:
            tags: Tags to match against
            
        Returns:
            True if component has any of the tags
        """
        return any(tag in self.tags for tag in tags)
    
    def has_capability(self, capability: str) -> bool:
        """Check if component has a specific capability.
        
        Args:
            capability: Capability to check for
            
        Returns:
            True if component has the capability
        """
        return capability in self.capabilities


class ComponentRegistry:
    """Registry for managing platform components."""
    
    _instance = None
    
    def __new__(cls):
        """Ensure singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize component registry."""
        if not hasattr(self, '_initialized'):
            self._components: Dict[str, ComponentMetadata] = {}
            self._type_index: Dict[ComponentType, List[str]] = defaultdict(list)
            self._tag_index: Dict[str, List[str]] = defaultdict(list)
            self._factories: Dict[str, Callable] = {}
            self.logger = logging.getLogger(__name__)
            self._initialized = True
    
    def register(self, name: str, component_type: ComponentType,
                 class_type: Type, factory: Optional[Callable] = None,
                 metadata: Optional[Dict[str, Any]] = None) -> None:
        """Register a component in the registry.
        
        Args:
            name: Unique component name
            component_type: Type of component
            class_type: Component class
            factory: Optional factory function
            metadata: Additional metadata
            
        Raises:
            PlatformError: If component is already registered
        """
        if name in self._components:
            raise PlatformError(f"Component '{name}' is already registered")
        
        # Extract metadata from class if available
        module = inspect.getmodule(class_type)
        module_name = module.__name__ if module else "unknown"
        
        # Create component metadata
        component_meta = ComponentMetadata(
            name=name,
            component_type=component_type,
            class_type=class_type,
            module=module_name,
            description=class_type.__doc__ or "",
        )
        
        # Add additional metadata if provided
        if metadata:
            for key, value in metadata.items():
                if hasattr(component_meta, key):
                    setattr(component_meta, key, value)
        
        # Extract capabilities if component has them
        if hasattr(class_type, 'get_capabilities'):
            try:
                instance = class_type()
                component_meta.capabilities = instance.get_capabilities()
            except:
                pass  # Ignore if instantiation fails
        
        # Register component
        self._components[name] = component_meta
        self._type_index[component_type].append(name)
        
        # Update tag index
        for tag in component_meta.tags:
            self._tag_index[tag].append(name)
        
        # Register factory if provided
        if factory:
            self._factories[name] = factory
        
        self.logger.info(f"Registered {component_type.value} component: {name}")
    
    def unregister(self, name: str) -> None:
        """Unregister a component from the registry.
        
        Args:
            name: Component name to unregister
            
        Raises:
            PlatformError: If component is not registered
        """
        if name not in self._components:
            raise PlatformError(f"Component '{name}' is not registered")
        
        component = self._components[name]
        
        # Remove from type index
        self._type_index[component.component_type].remove(name)
        
        # Remove from tag index
        for tag in component.tags:
            self._tag_index[tag].remove(name)
        
        # Remove factory if exists
        if name in self._factories:
            del self._factories[name]
        
        # Remove component
        del self._components[name]
        
        self.logger.info(f"Unregistered component: {name}")
    
    def get(self, name: str) -> ComponentMetadata:
        """Get component metadata by name.
        
        Args:
            name: Component name
            
        Returns:
            Component metadata
            
        Raises:
            PlatformError: If component is not found
        """
        if name not in self._components:
            raise PlatformError(f"Component '{name}' not found")
        
        return self._components[name]
    
    def create(self, name: str, **kwargs) -> Any:
        """Create an instance of a registered component.
        
        Args:
            name: Component name
            **kwargs: Arguments for component creation
            
        Returns:
            Component instance
            
        Raises:
            PlatformError: If component cannot be created
        """
        if name not in self._components:
            raise PlatformError(f"Component '{name}' not found")
        
        component = self._components[name]
        
        # Use factory if available
        if name in self._factories:
            try:
                return self._factories[name](**kwargs)
            except Exception as e:
                raise PlatformError(f"Failed to create '{name}' using factory: {e}")
        
        # Otherwise instantiate class directly
        try:
            return component.class_type(**kwargs)
        except Exception as e:
            raise PlatformError(f"Failed to create '{name}': {e}")
    
    def list_components(self, component_type: Optional[ComponentType] = None,
                       tags: Optional[List[str]] = None) -> List[str]:
        """List registered components.
        
        Args:
            component_type: Filter by component type
            tags: Filter by tags
            
        Returns:
            List of component names
        """
        if component_type:
            components = self._type_index.get(component_type, [])
        else:
            components = list(self._components.keys())
        
        if tags:
            components = [
                name for name in components
                if self._components[name].matches_tags(tags)
            ]
        
        return components
    
    def get_by_type(self, component_type: ComponentType) -> List[ComponentMetadata]:
        """Get all components of a specific type.
        
        Args:
            component_type: Type to filter by
            
        Returns:
            List of component metadata
        """
        names = self._type_index.get(component_type, [])
        return [self._components[name] for name in names]
    
    def get_by_capability(self, capability: str) -> List[ComponentMetadata]:
        """Get components with a specific capability.
        
        Args:
            capability: Capability to search for
            
        Returns:
            List of component metadata
        """
        return [
            component for component in self._components.values()
            if component.has_capability(capability)
        ]
    
    def search(self, query: str) -> List[ComponentMetadata]:
        """Search for components by name, description, or tags.
        
        Args:
            query: Search query
            
        Returns:
            List of matching component metadata
        """
        query = query.lower()
        results = []
        
        for name, component in self._components.items():
            if (query in name.lower() or
                query in component.description.lower() or
                any(query in tag.lower() for tag in component.tags)):
                results.append(component)
        
        return results
    
    def get_dependencies(self, name: str, recursive: bool = True) -> List[str]:
        """Get component dependencies.
        
        Args:
            name: Component name
            recursive: If True, get dependencies recursively
            
        Returns:
            List of dependency component names
        """
        if name not in self._components:
            raise PlatformError(f"Component '{name}' not found")
        
        component = self._components[name]
        dependencies = set(component.dependencies)
        
        if recursive:
            for dep in list(dependencies):
                if dep in self._components:
                    sub_deps = self.get_dependencies(dep, recursive=True)
                    dependencies.update(sub_deps)
        
        return list(dependencies)
    
    def validate_dependencies(self, name: str) -> bool:
        """Validate that all dependencies are registered.
        
        Args:
            name: Component name
            
        Returns:
            True if all dependencies are satisfied
        """
        dependencies = self.get_dependencies(name, recursive=False)
        
        for dep in dependencies:
            if dep not in self._components:
                self.logger.warning(f"Missing dependency '{dep}' for component '{name}'")
                return False
        
        return True
    
    def clear(self) -> None:
        """Clear all registered components."""
        self._components.clear()
        self._type_index.clear()
        self._tag_index.clear()
        self._factories.clear()
        self.logger.info("Registry cleared")


# Decorators for automatic registration

def register_component(component_type: ComponentType, name: Optional[str] = None,
                      **metadata):
    """Decorator for registering components.
    
    Args:
        component_type: Type of component
        name: Optional component name (uses class name if not provided)
        **metadata: Additional metadata
    """
    def decorator(cls: Type) -> Type:
        registry = ComponentRegistry()
        component_name = name or cls.__name__
        
        registry.register(
            name=component_name,
            component_type=component_type,
            class_type=cls,
            metadata=metadata
        )
        
        # Add registration info to class
        cls._registry_name = component_name
        cls._registry_type = component_type
        
        return cls
    
    return decorator


def register_processor(name: Optional[str] = None, **metadata):
    """Decorator for registering processors.
    
    Args:
        name: Optional processor name
        **metadata: Additional metadata
    """
    return register_component(ComponentType.PROCESSOR, name, **metadata)


def register_transformer(name: Optional[str] = None, **metadata):
    """Decorator for registering transformers.
    
    Args:
        name: Optional transformer name
        **metadata: Additional metadata
    """
    return register_component(ComponentType.TRANSFORMER, name, **metadata)


# Plugin system for dynamic loading

class PluginLoader:
    """Loader for dynamically loading component plugins."""
    
    def __init__(self, registry: Optional[ComponentRegistry] = None):
        """Initialize plugin loader.
        
        Args:
            registry: Component registry to use
        """
        self.registry = registry or ComponentRegistry()
        self.logger = logging.getLogger(__name__)
    
    def load_module(self, module_path: str) -> int:
        """Load components from a Python module.
        
        Args:
            module_path: Path to module (e.g., 'mypackage.processors')
            
        Returns:
            Number of components loaded
        """
        try:
            import importlib
            module = importlib.import_module(module_path)
            
            loaded = 0
            
            # Find all classes in the module
            for name, obj in inspect.getmembers(module, inspect.isclass):
                # Check if class has registry metadata
                if hasattr(obj, '_registry_name') and hasattr(obj, '_registry_type'):
                    # Component is already registered via decorator
                    loaded += 1
                # Check if it's a subclass of known base classes
                elif issubclass(obj, BaseProcessor) and obj != BaseProcessor:
                    self.registry.register(
                        name=name,
                        component_type=ComponentType.PROCESSOR,
                        class_type=obj
                    )
                    loaded += 1
                elif issubclass(obj, BaseTransformer) and obj != BaseTransformer:
                    self.registry.register(
                        name=name,
                        component_type=ComponentType.TRANSFORMER,
                        class_type=obj
                    )
                    loaded += 1
            
            self.logger.info(f"Loaded {loaded} components from {module_path}")
            return loaded
            
        except ImportError as e:
            self.logger.error(f"Failed to load module {module_path}: {e}")
            return 0
    
    def load_directory(self, directory: str) -> int:
        """Load components from all Python files in a directory.
        
        Args:
            directory: Directory path
            
        Returns:
            Total number of components loaded
        """
        from pathlib import Path
        
        total = 0
        path = Path(directory)
        
        if not path.exists() or not path.is_dir():
            self.logger.error(f"Invalid directory: {directory}")
            return 0
        
        # Load all Python files
        for py_file in path.glob("*.py"):
            if py_file.name.startswith("_"):
                continue  # Skip private modules
            
            # Convert file path to module path
            module_name = py_file.stem
            module_path = f"{path.name}.{module_name}"
            
            total += self.load_module(module_path)
        
        return total


# Global registry instance
_global_registry = ComponentRegistry()


def get_registry() -> ComponentRegistry:
    """Get the global component registry.
    
    Returns:
        Global ComponentRegistry instance
    """
    return _global_registry