"""
Processing pipeline management for the processing module.

This module provides pipeline orchestration for chaining multiple
processing steps together in a configurable workflow.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Union
from enum import Enum
import time
import logging
from concurrent.futures import ThreadPoolExecutor, Future

from core.base import BaseComponent, Status, Observable
from core.exceptions import PipelineError, ProcessingError
from core.config import ProcessingConfig
from core.registry import get_registry
from .processor import DataProcessor, ProcessingResult
from .transformers import BaseTransformer


class StepType(Enum):
    """Types of pipeline steps."""
    INGESTION = "ingestion"
    VALIDATION = "validation"
    TRANSFORMATION = "transformation"
    AGGREGATION = "aggregation"
    OUTPUT = "output"
    CUSTOM = "custom"


@dataclass
class PipelineStep:
    """Represents a single step in the pipeline."""
    
    name: str
    step_type: StepType
    processor: Union[str, Callable, BaseComponent]
    config: Dict[str, Any] = field(default_factory=dict)
    dependencies: List[str] = field(default_factory=list)
    condition: Optional[Callable] = None
    retry_on_failure: bool = False
    max_retries: int = 3
    timeout_seconds: Optional[float] = None
    
    def __post_init__(self):
        """Post-initialization processing."""
        if isinstance(self.step_type, str):
            self.step_type = StepType(self.step_type)


@dataclass
class StepResult:
    """Result of executing a pipeline step."""
    
    step_name: str
    status: Status
    output_data: Any = None
    error: Optional[str] = None
    elapsed_time: float = 0.0
    records_processed: int = 0
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PipelineResult:
    """Result of executing an entire pipeline."""
    
    pipeline_name: str
    status: Status
    steps_completed: int = 0
    total_steps: int = 0
    step_results: List[StepResult] = field(default_factory=list)
    total_elapsed_time: float = 0.0
    errors: List[str] = field(default_factory=list)
    
    @property
    def success_rate(self) -> float:
        """Calculate pipeline success rate."""
        if self.total_steps == 0:
            return 0.0
        return (self.steps_completed / self.total_steps) * 100


class Pipeline(BaseComponent, Observable):
    """Main pipeline orchestrator for data processing workflows."""
    
    def __init__(self, name: str, config: Optional[ProcessingConfig] = None):
        """Initialize pipeline.
        
        Args:
            name: Pipeline name
            config: Processing configuration
        """
        BaseComponent.__init__(self)
        Observable.__init__(self)
        
        self.name = name
        self.config = config or ProcessingConfig()
        self.steps: List[PipelineStep] = []
        self.step_index: Dict[str, PipelineStep] = {}
        self.data_store: Dict[str, Any] = {}
        self.result = PipelineResult(pipeline_name=name, status=Status.PENDING)
        self._executor = None
    
    def add_step(self, step: PipelineStep) -> None:
        """Add a step to the pipeline.
        
        Args:
            step: Pipeline step to add
        """
        if step.name in self.step_index:
            raise PipelineError(f"Step '{step.name}' already exists in pipeline")
        
        self.steps.append(step)
        self.step_index[step.name] = step
        self.logger.info(f"Added step '{step.name}' to pipeline")
    
    def remove_step(self, step_name: str) -> None:
        """Remove a step from the pipeline.
        
        Args:
            step_name: Name of step to remove
        """
        if step_name not in self.step_index:
            raise PipelineError(f"Step '{step_name}' not found in pipeline")
        
        step = self.step_index[step_name]
        self.steps.remove(step)
        del self.step_index[step_name]
        self.logger.info(f"Removed step '{step_name}' from pipeline")
    
    def validate(self) -> bool:
        """Validate pipeline configuration.
        
        Returns:
            True if pipeline is valid
        """
        # Check for circular dependencies
        for step in self.steps:
            if self._has_circular_dependency(step.name, set()):
                raise PipelineError(f"Circular dependency detected for step '{step.name}'")
        
        # Check all dependencies exist
        for step in self.steps:
            for dep in step.dependencies:
                if dep not in self.step_index:
                    raise PipelineError(
                        f"Step '{step.name}' depends on non-existent step '{dep}'"
                    )
        
        return True
    
    def _has_circular_dependency(self, step_name: str, visited: set) -> bool:
        """Check for circular dependencies.
        
        Args:
            step_name: Step to check
            visited: Set of visited steps
            
        Returns:
            True if circular dependency exists
        """
        if step_name in visited:
            return True
        
        visited.add(step_name)
        
        if step_name in self.step_index:
            step = self.step_index[step_name]
            for dep in step.dependencies:
                if self._has_circular_dependency(dep, visited.copy()):
                    return True
        
        return False
    
    def execute(self, input_data: Any = None) -> PipelineResult:
        """Execute the pipeline.
        
        Args:
            input_data: Initial input data
            
        Returns:
            Pipeline execution result
        """
        self.logger.info(f"Starting pipeline execution: {self.name}")
        start_time = time.time()
        
        self.result = PipelineResult(
            pipeline_name=self.name,
            status=Status.RUNNING,
            total_steps=len(self.steps)
        )
        
        # Validate pipeline
        try:
            self.validate()
        except PipelineError as e:
            self.result.status = Status.FAILED
            self.result.errors.append(str(e))
            return self.result
        
        # Initialize executor for parallel steps
        with ThreadPoolExecutor(max_workers=self.config.max_workers) as executor:
            self._executor = executor
            
            # Store initial data
            if input_data is not None:
                self.data_store['input'] = input_data
            
            # Execute steps in dependency order
            executed_steps = set()
            
            while len(executed_steps) < len(self.steps):
                # Find steps ready to execute
                ready_steps = self._get_ready_steps(executed_steps)
                
                if not ready_steps:
                    self.logger.error("No steps ready to execute - possible deadlock")
                    self.result.status = Status.FAILED
                    self.result.errors.append("Pipeline deadlock detected")
                    break
                
                # Execute ready steps
                futures = {}
                for step in ready_steps:
                    if step.condition and not step.condition(self.data_store):
                        # Skip step if condition not met
                        self.logger.info(f"Skipping step '{step.name}' - condition not met")
                        executed_steps.add(step.name)
                        continue
                    
                    future = executor.submit(self._execute_step, step)
                    futures[future] = step
                
                # Wait for steps to complete
                for future in futures:
                    step = futures[future]
                    try:
                        step_result = future.result(timeout=step.timeout_seconds)
                        self.result.step_results.append(step_result)
                        
                        if step_result.status == Status.COMPLETED:
                            self.result.steps_completed += 1
                            self.data_store[step.name] = step_result.output_data
                        else:
                            self.logger.warning(f"Step '{step.name}' failed")
                            
                        executed_steps.add(step.name)
                        
                    except Exception as e:
                        self.logger.error(f"Step '{step.name}' failed with exception: {e}")
                        self.result.errors.append(f"Step '{step.name}': {str(e)}")
                        executed_steps.add(step.name)
        
        # Finalize result
        self.result.total_elapsed_time = time.time() - start_time
        
        if self.result.steps_completed == self.result.total_steps:
            self.result.status = Status.COMPLETED
        elif self.result.steps_completed > 0:
            self.result.status = Status.COMPLETED  # Partial success
        else:
            self.result.status = Status.FAILED
        
        self.logger.info(
            f"Pipeline execution complete: {self.result.steps_completed}/{self.result.total_steps} "
            f"steps in {self.result.total_elapsed_time:.2f}s"
        )
        
        # Notify observers
        self.notify('pipeline_complete', self.result)
        
        return self.result
    
    def _get_ready_steps(self, executed: set) -> List[PipelineStep]:
        """Get steps ready to execute.
        
        Args:
            executed: Set of already executed step names
            
        Returns:
            List of steps ready to execute
        """
        ready = []
        
        for step in self.steps:
            if step.name in executed:
                continue
            
            # Check if all dependencies are satisfied
            if all(dep in executed for dep in step.dependencies):
                ready.append(step)
        
        return ready
    
    def _execute_step(self, step: PipelineStep) -> StepResult:
        """Execute a single pipeline step.
        
        Args:
            step: Step to execute
            
        Returns:
            Step execution result
        """
        self.logger.info(f"Executing step: {step.name}")
        start_time = time.time()
        
        result = StepResult(
            step_name=step.name,
            status=Status.RUNNING
        )
        
        # Get input data from dependencies
        input_data = self._get_step_input(step)
        
        # Execute step with retries
        attempts = 0
        max_attempts = step.max_retries if step.retry_on_failure else 1
        
        while attempts < max_attempts:
            try:
                # Create processor instance
                processor = self._create_processor(step)
                
                # Execute processor
                if hasattr(processor, 'process'):
                    output = processor.process(input_data)
                elif callable(processor):
                    output = processor(input_data)
                else:
                    raise ProcessingError(f"Invalid processor for step '{step.name}'")
                
                # Update result
                result.output_data = output
                result.status = Status.COMPLETED
                
                # Get metrics if available
                if hasattr(processor, 'get_metrics'):
                    result.metrics = processor.get_metrics()
                
                if hasattr(processor, 'result') and hasattr(processor.result, 'input_count'):
                    result.records_processed = processor.result.input_count
                
                break
                
            except Exception as e:
                attempts += 1
                self.logger.warning(
                    f"Step '{step.name}' attempt {attempts}/{max_attempts} failed: {e}"
                )
                
                if attempts >= max_attempts:
                    result.status = Status.FAILED
                    result.error = str(e)
                else:
                    time.sleep(1)  # Brief delay before retry
        
        result.elapsed_time = time.time() - start_time
        
        # Notify observers
        self.notify('step_complete', result)
        
        return result
    
    def _get_step_input(self, step: PipelineStep) -> Any:
        """Get input data for a step from its dependencies.
        
        Args:
            step: Step requiring input
            
        Returns:
            Input data for the step
        """
        if not step.dependencies:
            # Use initial input or None
            return self.data_store.get('input')
        
        if len(step.dependencies) == 1:
            # Single dependency - use its output directly
            return self.data_store.get(step.dependencies[0])
        
        # Multiple dependencies - combine outputs
        combined = {}
        for dep in step.dependencies:
            if dep in self.data_store:
                combined[dep] = self.data_store[dep]
        
        return combined
    
    def _create_processor(self, step: PipelineStep) -> Any:
        """Create processor instance for a step.
        
        Args:
            step: Step requiring processor
            
        Returns:
            Processor instance
        """
        if isinstance(step.processor, str):
            # Create from registry
            registry = get_registry()
            return registry.create(step.processor, **step.config)
        elif callable(step.processor):
            # Use callable directly
            return step.processor
        elif isinstance(step.processor, BaseComponent):
            # Use existing instance
            return step.processor
        else:
            raise PipelineError(f"Invalid processor type for step '{step.name}'")
    
    def initialize(self) -> None:
        """Initialize the pipeline."""
        self.logger.info(f"Initializing pipeline: {self.name}")
        self.data_store.clear()
    
    def cleanup(self) -> None:
        """Cleanup pipeline resources."""
        self.logger.info(f"Cleaning up pipeline: {self.name}")
        self.data_store.clear()
        if self._executor:
            self._executor.shutdown(wait=False)


class ParallelPipeline(Pipeline):
    """Pipeline that executes independent steps in parallel."""
    
    def __init__(self, name: str, config: Optional[ProcessingConfig] = None):
        """Initialize parallel pipeline.
        
        Args:
            name: Pipeline name
            config: Processing configuration
        """
        super().__init__(name, config)
        self.parallel_groups = []
    
    def add_parallel_group(self, steps: List[PipelineStep]) -> None:
        """Add a group of steps to execute in parallel.
        
        Args:
            steps: Steps to execute in parallel
        """
        # Verify no dependencies between parallel steps
        step_names = {step.name for step in steps}
        
        for step in steps:
            conflicting = set(step.dependencies) & step_names
            if conflicting:
                raise PipelineError(
                    f"Step '{step.name}' has dependencies on parallel steps: {conflicting}"
                )
        
        self.parallel_groups.append(steps)
        
        # Add steps to main pipeline
        for step in steps:
            self.add_step(step)


def create_pipeline_from_config(config: Dict[str, Any]) -> Pipeline:
    """Create a pipeline from configuration.
    
    Args:
        config: Pipeline configuration
        
    Returns:
        Configured pipeline
    """
    name = config.get('name', 'pipeline')
    pipeline = Pipeline(name)
    
    # Add steps from configuration
    for step_config in config.get('steps', []):
        step = PipelineStep(
            name=step_config['name'],
            step_type=StepType(step_config.get('type', 'custom')),
            processor=step_config['processor'],
            config=step_config.get('config', {}),
            dependencies=step_config.get('dependencies', [])
        )
        pipeline.add_step(step)
    
    return pipeline