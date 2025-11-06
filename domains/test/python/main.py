#!/usr/bin/env python3
"""
Main application entry point for data analysis pipeline.

This module orchestrates the data processing workflow, combining
various processing steps and utility functions to analyze datasets.
"""

import argparse
import logging
from typing import Dict, List, Optional
from pathlib import Path

from data_processor import DataProcessor, ProcessingConfig
from utils import setup_logging, validate_input, Timer, format_results


class DataPipeline:
    """Main pipeline for orchestrating data analysis tasks."""
    
    def __init__(self, config: ProcessingConfig):
        """Initialize the data pipeline with configuration.
        
        Args:
            config: Processing configuration object
        """
        self.config = config
        self.processor = DataProcessor(config)
        self.logger = logging.getLogger(__name__)
        self.results_cache: Dict[str, any] = {}
    
    def run(self, input_path: Path, output_path: Optional[Path] = None) -> Dict:
        """Execute the complete data processing pipeline.
        
        Args:
            input_path: Path to input data file
            output_path: Optional path for output results
            
        Returns:
            Dictionary containing processing results and metrics
        """
        self.logger.info(f"Starting pipeline for {input_path}")
        
        # Validate input
        if not validate_input(input_path):
            raise ValueError(f"Invalid input file: {input_path}")
        
        with Timer() as timer:
            # Load and process data
            data = self.processor.load_data(input_path)
            processed = self.processor.process(data)
            
            # Analyze results
            analysis = self.processor.analyze(processed)
            
            # Cache results
            self.results_cache[str(input_path)] = analysis
        
        # Format and save results
        results = format_results(analysis, timer.elapsed)
        
        if output_path:
            self._save_results(results, output_path)
        
        self.logger.info(f"Pipeline completed in {timer.elapsed:.2f} seconds")
        return results
    
    def _save_results(self, results: Dict, output_path: Path) -> None:
        """Save processing results to file.
        
        Args:
            results: Results dictionary to save
            output_path: Path where results should be saved
        """
        import json
        
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)
        
        self.logger.info(f"Results saved to {output_path}")
    
    def get_cached_results(self, input_path: Path) -> Optional[Dict]:
        """Retrieve cached results for a given input.
        
        Args:
            input_path: Path to check for cached results
            
        Returns:
            Cached results if available, None otherwise
        """
        return self.results_cache.get(str(input_path))


def main():
    """Main entry point for command-line execution."""
    parser = argparse.ArgumentParser(
        description="Data processing pipeline for analysis tasks"
    )
    parser.add_argument("input", help="Path to input data file")
    parser.add_argument("-o", "--output", help="Path for output results")
    parser.add_argument("--config", help="Path to configuration file")
    parser.add_argument("-v", "--verbose", action="store_true", 
                       help="Enable verbose logging")
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(verbose=args.verbose)
    
    # Load configuration
    if args.config:
        config = ProcessingConfig.from_file(args.config)
    else:
        config = ProcessingConfig()
    
    # Run pipeline
    pipeline = DataPipeline(config)
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else None
    
    try:
        results = pipeline.run(input_path, output_path)
        print(f"Processing completed successfully!")
        print(f"Summary: {results.get('summary', 'N/A')}")
    except Exception as e:
        logging.error(f"Pipeline failed: {e}")
        raise


if __name__ == "__main__":
    main()