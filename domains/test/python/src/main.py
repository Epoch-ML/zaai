"""
Main entry point for the Analytics Platform.

This module demonstrates the integration of all platform components
with cross-module imports and usage patterns.
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Dict, Any, Optional

# Core module imports
from core.base import Status, DataFormat
from core.config import ConfigManager, PlatformConfig, get_config
from core.exceptions import PlatformError, handle_platform_error
from core.validators import SchemaValidator
from core.registry import ComponentRegistry, get_registry, PluginLoader

# Ingestion module imports
from ingestion.sources import FileSource, DatabaseSource, APISource, SourceCredentials
from ingestion.connectors import SQLConnector, HTTPConnector
from ingestion.loader import DataLoader, BatchLoader
from ingestion.schema import detect_schema, TableSchema

# Processing module imports (to be created)
# from processing.processor import DataProcessor
# from processing.pipeline import Pipeline

# Visualization module imports (to be created)  
# from visualization.charts import ChartGenerator
# from visualization.reports import ReportBuilder


class AnalyticsPlatform:
    """Main platform class that orchestrates all components."""
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize the analytics platform.
        
        Args:
            config_path: Path to configuration file
        """
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # Initialize configuration
        self.config_manager = ConfigManager()
        if config_path:
            self.config_manager.load_from_file(config_path)
        self.config_manager.load_from_environment()
        
        self.config = self.config_manager.config
        
        # Initialize component registry
        self.registry = get_registry()
        
        # Initialize plugin loader
        self.plugin_loader = PluginLoader(self.registry)
        
        # Initialize main components
        self.data_loader = DataLoader(self.config.ingestion)
        self.connectors = {}
        self.sources = {}
        
        # Setup logging
        self._setup_logging()
        
        self.logger.info(f"Analytics Platform {self.config.version} initialized")
    
    def _setup_logging(self):
        """Configure platform logging."""
        level = getattr(logging, self.config.log_level)
        logging.basicConfig(
            level=level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    def load_plugins(self, plugin_dir: str) -> int:
        """Load plugins from a directory.
        
        Args:
            plugin_dir: Directory containing plugin modules
            
        Returns:
            Number of plugins loaded
        """
        self.logger.info(f"Loading plugins from {plugin_dir}")
        loaded = self.plugin_loader.load_directory(plugin_dir)
        self.logger.info(f"Loaded {loaded} plugins")
        return loaded
    
    def register_connector(self, name: str, connector_type: str, **kwargs) -> None:
        """Register a data connector.
        
        Args:
            name: Connector name
            connector_type: Type of connector
            **kwargs: Connector-specific arguments
        """
        if connector_type == "sql":
            connector = SQLConnector(**kwargs)
        elif connector_type == "http":
            connector = HTTPConnector(**kwargs)
        else:
            # Try to create from registry
            connector = self.registry.create(connector_type, **kwargs)
        
        self.connectors[name] = connector
        self.data_loader.register_connector(name, connector)
        self.logger.info(f"Registered {connector_type} connector: {name}")
    
    def ingest_file(self, file_path: str, format: Optional[str] = None) -> Dict[str, Any]:
        """Ingest data from a file.
        
        Args:
            file_path: Path to data file
            format: File format (auto-detected if not provided)
            
        Returns:
            Ingestion results
        """
        self.logger.info(f"Ingesting file: {file_path}")
        
        # Convert format string to enum if provided
        data_format = None
        if format:
            try:
                data_format = DataFormat[format.upper()]
            except KeyError:
                self.logger.warning(f"Unknown format {format}, will auto-detect")
        
        # Load the file
        result = self.data_loader.load_file(file_path, data_format)
        
        # Log results
        self.logger.info(
            f"Ingestion complete: {result.records_loaded} records loaded, "
            f"{result.records_failed} failed"
        )
        
        if result.errors:
            self.logger.warning(f"Ingestion errors: {result.errors[:5]}")
        
        return {
            'status': 'success' if result.success_rate > 90 else 'partial',
            'records_loaded': result.records_loaded,
            'records_failed': result.records_failed,
            'success_rate': result.success_rate,
            'elapsed_time': result.elapsed_time,
            'schema': result.metadata.get('detected_schema')
        }
    
    def ingest_database(self, connector_name: str, query: str = None,
                       table: str = None) -> Dict[str, Any]:
        """Ingest data from a database.
        
        Args:
            connector_name: Name of registered connector
            query: SQL query
            table: Table name
            
        Returns:
            Ingestion results
        """
        self.logger.info(f"Ingesting from database using {connector_name}")
        
        if connector_name not in self.connectors:
            raise PlatformError(f"Connector not found: {connector_name}")
        
        result = self.data_loader.load_database(connector_name, query, table)
        
        return {
            'status': 'success' if result.success_rate > 90 else 'partial',
            'records_loaded': result.records_loaded,
            'records_failed': result.records_failed,
            'success_rate': result.success_rate,
            'elapsed_time': result.elapsed_time
        }
    
    def process_data(self, source_name: str, processor_name: str,
                    **processor_kwargs) -> Dict[str, Any]:
        """Process data using a registered processor.
        
        Args:
            source_name: Name of data source
            processor_name: Name of processor
            **processor_kwargs: Processor arguments
            
        Returns:
            Processing results
        """
        self.logger.info(f"Processing data from {source_name} using {processor_name}")
        
        # Get processor from registry
        processor = self.registry.create(processor_name, **processor_kwargs)
        
        # This would use the actual processing module
        # For now, return mock results
        return {
            'status': 'success',
            'processor': processor_name,
            'source': source_name,
            'records_processed': 1000,
            'transformations_applied': ['clean', 'normalize', 'aggregate']
        }
    
    def generate_report(self, data_source: str, report_type: str,
                       output_path: str) -> Dict[str, Any]:
        """Generate a report from processed data.
        
        Args:
            data_source: Name of data source
            report_type: Type of report
            output_path: Path to save report
            
        Returns:
            Report generation results
        """
        self.logger.info(f"Generating {report_type} report for {data_source}")
        
        # This would use the actual visualization module
        # For now, return mock results
        return {
            'status': 'success',
            'report_type': report_type,
            'output_path': output_path,
            'pages': 5,
            'charts': 10,
            'tables': 3
        }
    
    def run_pipeline(self, pipeline_config: Dict[str, Any]) -> Dict[str, Any]:
        """Run a complete data processing pipeline.
        
        Args:
            pipeline_config: Pipeline configuration
            
        Returns:
            Pipeline execution results
        """
        self.logger.info("Running data processing pipeline")
        
        results = {
            'status': 'running',
            'steps': []
        }
        
        # Step 1: Ingestion
        if 'ingestion' in pipeline_config:
            ing_config = pipeline_config['ingestion']
            if ing_config['type'] == 'file':
                ing_result = self.ingest_file(
                    ing_config['path'],
                    ing_config.get('format')
                )
                results['steps'].append({'name': 'ingestion', 'result': ing_result})
        
        # Step 2: Processing
        if 'processing' in pipeline_config:
            proc_config = pipeline_config['processing']
            proc_result = self.process_data(
                proc_config['source'],
                proc_config['processor']
            )
            results['steps'].append({'name': 'processing', 'result': proc_result})
        
        # Step 3: Visualization
        if 'visualization' in pipeline_config:
            viz_config = pipeline_config['visualization']
            viz_result = self.generate_report(
                viz_config['source'],
                viz_config['type'],
                viz_config['output']
            )
            results['steps'].append({'name': 'visualization', 'result': viz_result})
        
        results['status'] = 'complete'
        return results
    
    def shutdown(self):
        """Shutdown the platform and cleanup resources."""
        self.logger.info("Shutting down Analytics Platform")
        
        # Cleanup data loader
        self.data_loader.cleanup()
        
        # Cleanup connectors
        for connector in self.connectors.values():
            try:
                connector.cleanup()
            except Exception as e:
                self.logger.error(f"Error cleaning up connector: {e}")
        
        self.logger.info("Shutdown complete")


def main():
    """Main entry point for command-line usage."""
    parser = argparse.ArgumentParser(
        description="Analytics Platform - Comprehensive data analysis system"
    )
    
    parser.add_argument(
        '--config', '-c',
        help='Path to configuration file',
        default=None
    )
    
    parser.add_argument(
        '--command',
        choices=['ingest', 'process', 'report', 'pipeline'],
        required=True,
        help='Command to execute'
    )
    
    parser.add_argument(
        '--input', '-i',
        help='Input file or source',
        required=False
    )
    
    parser.add_argument(
        '--output', '-o',
        help='Output file or destination',
        required=False
    )
    
    parser.add_argument(
        '--format', '-f',
        help='Data format',
        choices=['json', 'csv', 'xml', 'parquet'],
        required=False
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose logging'
    )
    
    args = parser.parse_args()
    
    # Initialize platform
    platform = AnalyticsPlatform(args.config)
    
    # Set verbose logging if requested
    if args.verbose:
        platform.config_manager.override('log_level', 'DEBUG')
        platform._setup_logging()
    
    try:
        # Execute command
        if args.command == 'ingest':
            if not args.input:
                print("Error: --input required for ingest command")
                sys.exit(1)
            
            result = platform.ingest_file(args.input, args.format)
            print(f"Ingestion complete: {result}")
        
        elif args.command == 'process':
            if not args.input:
                print("Error: --input required for process command")
                sys.exit(1)
            
            result = platform.process_data(args.input, 'default_processor')
            print(f"Processing complete: {result}")
        
        elif args.command == 'report':
            if not args.input or not args.output:
                print("Error: --input and --output required for report command")
                sys.exit(1)
            
            result = platform.generate_report(args.input, 'summary', args.output)
            print(f"Report generated: {result}")
        
        elif args.command == 'pipeline':
            # Run a default pipeline
            pipeline_config = {
                'ingestion': {
                    'type': 'file',
                    'path': args.input,
                    'format': args.format
                },
                'processing': {
                    'source': 'ingested_data',
                    'processor': 'default_processor'
                },
                'visualization': {
                    'source': 'processed_data',
                    'type': 'summary',
                    'output': args.output or 'report.pdf'
                }
            }
            
            result = platform.run_pipeline(pipeline_config)
            print(f"Pipeline complete: {result}")
    
    except PlatformError as e:
        print(f"Platform error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)
    finally:
        platform.shutdown()


if __name__ == "__main__":
    main()