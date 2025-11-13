"""
Data parsers for various file formats.

This module provides parsers to convert different file formats
into standardized dictionary records for processing.
"""

import csv
import json
from abc import ABC, abstractmethod
from typing import Any, Dict, Iterator, List, TextIO, BinaryIO, Union
import logging

from core.base import DataFormat
from core.exceptions import DataIngestionError
from core.config import IngestionConfig
from core.registry import register_component, ComponentType


class BaseParser(ABC):
    """Abstract base class for data parsers."""
    
    def __init__(self, format: DataFormat):
        """Initialize parser.
        
        Args:
            format: Data format this parser handles
        """
        self.format = format
        self.logger = logging.getLogger(self.__class__.__name__)
    
    @abstractmethod
    def parse(self, file_obj: Union[TextIO, BinaryIO], 
              config: IngestionConfig) -> Iterator[Dict[str, Any]]:
        """Parse file and yield records.
        
        Args:
            file_obj: File object to parse
            config: Ingestion configuration
            
        Yields:
            Parsed records as dictionaries
        """
        pass
    
    @abstractmethod
    def can_parse(self, file_obj: Union[TextIO, BinaryIO]) -> bool:
        """Check if parser can handle the file.
        
        Args:
            file_obj: File object to check
            
        Returns:
            True if parser can handle the file
        """
        pass


@register_component(ComponentType.TRANSFORMER, tags=["parser", "json"])
class JSONParser(BaseParser):
    """Parser for JSON files."""
    
    def __init__(self):
        """Initialize JSON parser."""
        super().__init__(DataFormat.JSON)
    
    def parse(self, file_obj: TextIO, config: IngestionConfig) -> Iterator[Dict[str, Any]]:
        """Parse JSON file.
        
        Args:
            file_obj: JSON file object
            config: Ingestion configuration
            
        Yields:
            Parsed records
        """
        try:
            data = json.load(file_obj)
            
            # Handle different JSON structures
            if isinstance(data, list):
                # Array of objects
                for record in data:
                    if isinstance(record, dict):
                        yield record
                    else:
                        yield {'value': record}
            elif isinstance(data, dict):
                # Single object or nested structure
                if self._looks_like_records(data):
                    # Nested records
                    for key, value in data.items():
                        if isinstance(value, dict):
                            value['_key'] = key
                            yield value
                        elif isinstance(value, list):
                            for item in value:
                                if isinstance(item, dict):
                                    item['_parent'] = key
                                    yield item
                else:
                    # Single record
                    yield data
            else:
                # Primitive value
                yield {'value': data}
                
        except json.JSONDecodeError as e:
            raise DataIngestionError(f"Failed to parse JSON: {e}", format="json")
    
    def can_parse(self, file_obj: Union[TextIO, BinaryIO]) -> bool:
        """Check if file is valid JSON.
        
        Args:
            file_obj: File object to check
            
        Returns:
            True if file is valid JSON
        """
        try:
            position = file_obj.tell()
            json.load(file_obj)
            file_obj.seek(position)
            return True
        except:
            file_obj.seek(0)
            return False
    
    def _looks_like_records(self, data: Dict) -> bool:
        """Check if dictionary looks like it contains records.
        
        Args:
            data: Dictionary to check
            
        Returns:
            True if dictionary appears to contain records
        """
        # Simple heuristic: if all values are dicts or lists, probably records
        return all(isinstance(v, (dict, list)) for v in data.values())


@register_component(ComponentType.TRANSFORMER, tags=["parser", "csv"])
class CSVParser(BaseParser):
    """Parser for CSV files."""
    
    def __init__(self):
        """Initialize CSV parser."""
        super().__init__(DataFormat.CSV)
    
    def parse(self, file_obj: TextIO, config: IngestionConfig) -> Iterator[Dict[str, Any]]:
        """Parse CSV file.
        
        Args:
            file_obj: CSV file object
            config: Ingestion configuration
            
        Yields:
            Parsed records
        """
        delimiter = config.delimiter
        
        try:
            # Detect dialect if needed
            sample = file_obj.read(1024)
            file_obj.seek(0)
            
            sniffer = csv.Sniffer()
            try:
                dialect = sniffer.sniff(sample)
                delimiter = dialect.delimiter
            except:
                pass  # Use default delimiter
            
            reader = csv.DictReader(file_obj, delimiter=delimiter)
            
            for row in reader:
                # Convert numeric strings if possible
                processed_row = {}
                for key, value in row.items():
                    if value:
                        # Try to parse as number
                        try:
                            if '.' in value:
                                processed_row[key] = float(value)
                            else:
                                processed_row[key] = int(value)
                        except ValueError:
                            processed_row[key] = value
                    else:
                        processed_row[key] = None
                
                yield processed_row
                
        except csv.Error as e:
            raise DataIngestionError(f"Failed to parse CSV: {e}", format="csv")
    
    def can_parse(self, file_obj: Union[TextIO, BinaryIO]) -> bool:
        """Check if file is valid CSV.
        
        Args:
            file_obj: File object to check
            
        Returns:
            True if file appears to be CSV
        """
        try:
            position = file_obj.tell()
            sample = file_obj.read(1024)
            file_obj.seek(position)
            
            # Simple check for CSV-like structure
            lines = sample.split('\n')
            if len(lines) < 2:
                return False
            
            # Check if consistent number of delimiters
            delimiter_counts = [line.count(',') for line in lines[:5] if line]
            if delimiter_counts and all(c == delimiter_counts[0] for c in delimiter_counts):
                return True
            
            # Check for other common delimiters
            for delim in ['\t', '|', ';']:
                counts = [line.count(delim) for line in lines[:5] if line]
                if counts and all(c == counts[0] for c in counts) and counts[0] > 0:
                    return True
            
            return False
            
        except:
            return False


@register_component(ComponentType.TRANSFORMER, tags=["parser", "xml"])
class XMLParser(BaseParser):
    """Parser for XML files."""
    
    def __init__(self):
        """Initialize XML parser."""
        super().__init__(DataFormat.XML)
    
    def parse(self, file_obj: TextIO, config: IngestionConfig) -> Iterator[Dict[str, Any]]:
        """Parse XML file.
        
        Args:
            file_obj: XML file object
            config: Ingestion configuration
            
        Yields:
            Parsed records
        """
        import xml.etree.ElementTree as ET
        
        try:
            tree = ET.parse(file_obj)
            root = tree.getroot()
            
            # Convert XML elements to dictionaries
            for element in root:
                record = self._element_to_dict(element)
                yield record
                
        except ET.ParseError as e:
            raise DataIngestionError(f"Failed to parse XML: {e}", format="xml")
    
    def _element_to_dict(self, element) -> Dict[str, Any]:
        """Convert XML element to dictionary.
        
        Args:
            element: XML element
            
        Returns:
            Dictionary representation
        """
        result = {}
        
        # Add attributes
        if element.attrib:
            result.update(element.attrib)
        
        # Add text content
        if element.text and element.text.strip():
            result['_text'] = element.text.strip()
        
        # Add child elements
        for child in element:
            child_data = self._element_to_dict(child)
            
            if child.tag in result:
                # Multiple children with same tag
                if not isinstance(result[child.tag], list):
                    result[child.tag] = [result[child.tag]]
                result[child.tag].append(child_data)
            else:
                result[child.tag] = child_data
        
        # If only text content, return it directly
        if len(result) == 1 and '_text' in result:
            return result['_text']
        
        return result
    
    def can_parse(self, file_obj: Union[TextIO, BinaryIO]) -> bool:
        """Check if file is valid XML.
        
        Args:
            file_obj: File object to check
            
        Returns:
            True if file is valid XML
        """
        import xml.etree.ElementTree as ET
        
        try:
            position = file_obj.tell()
            ET.parse(file_obj)
            file_obj.seek(position)
            return True
        except:
            file_obj.seek(0)
            return False


@register_component(ComponentType.TRANSFORMER, tags=["parser", "parquet"])
class ParquetParser(BaseParser):
    """Parser for Parquet files."""
    
    def __init__(self):
        """Initialize Parquet parser."""
        super().__init__(DataFormat.PARQUET)
    
    def parse(self, file_obj: BinaryIO, config: IngestionConfig) -> Iterator[Dict[str, Any]]:
        """Parse Parquet file.
        
        Args:
            file_obj: Parquet file object
            config: Ingestion configuration
            
        Yields:
            Parsed records
        """
        # In production, would use pyarrow or fastparquet
        # Mock implementation
        self.logger.info("Parsing Parquet file (mock implementation)")
        
        for i in range(10):
            yield {
                'id': i,
                'value': f'parquet_data_{i}',
                'timestamp': '2024-01-01T00:00:00Z'
            }
    
    def can_parse(self, file_obj: Union[TextIO, BinaryIO]) -> bool:
        """Check if file is valid Parquet.
        
        Args:
            file_obj: File object to check
            
        Returns:
            True if file appears to be Parquet
        """
        # Check for Parquet magic bytes
        try:
            position = file_obj.tell()
            magic = file_obj.read(4)
            file_obj.seek(position)
            return magic == b'PAR1'
        except:
            return False


class TextParser(BaseParser):
    """Parser for plain text files."""
    
    def __init__(self):
        """Initialize text parser."""
        super().__init__(DataFormat.TEXT)
    
    def parse(self, file_obj: TextIO, config: IngestionConfig) -> Iterator[Dict[str, Any]]:
        """Parse text file.
        
        Args:
            file_obj: Text file object
            config: Ingestion configuration
            
        Yields:
            Parsed records (one per line)
        """
        for line_num, line in enumerate(file_obj, 1):
            line = line.strip()
            if line:  # Skip empty lines
                yield {
                    'line_number': line_num,
                    'text': line,
                    'length': len(line)
                }
    
    def can_parse(self, file_obj: Union[TextIO, BinaryIO]) -> bool:
        """Check if file is text.
        
        Args:
            file_obj: File object to check
            
        Returns:
            True (text parser can handle any text file)
        """
        return True


# Parser registry and factory

_PARSERS = {
    DataFormat.JSON: JSONParser,
    DataFormat.CSV: CSVParser,
    DataFormat.XML: XMLParser,
    DataFormat.PARQUET: ParquetParser,
    DataFormat.TEXT: TextParser,
}


def get_parser(format: DataFormat) -> BaseParser:
    """Get parser for a specific format.
    
    Args:
        format: Data format
        
    Returns:
        Parser instance
        
    Raises:
        DataIngestionError: If no parser available for format
    """
    parser_class = _PARSERS.get(format)
    
    if not parser_class:
        raise DataIngestionError(
            f"No parser available for format: {format.value}",
            format=format.value
        )
    
    return parser_class()


def detect_format(file_obj: Union[TextIO, BinaryIO]) -> DataFormat:
    """Detect file format from content.
    
    Args:
        file_obj: File object
        
    Returns:
        Detected data format
    """
    # Try each parser's can_parse method
    for format, parser_class in _PARSERS.items():
        if format == DataFormat.TEXT:
            continue  # Text is fallback
        
        parser = parser_class()
        if parser.can_parse(file_obj):
            return format
    
    # Default to text
    return DataFormat.TEXT


class CompositeParser(BaseParser):
    """Parser that combines multiple parsers."""
    
    def __init__(self, parsers: List[BaseParser]):
        """Initialize composite parser.
        
        Args:
            parsers: List of parsers to try
        """
        super().__init__(DataFormat.TEXT)  # Default format
        self.parsers = parsers
    
    def parse(self, file_obj: Union[TextIO, BinaryIO], 
              config: IngestionConfig) -> Iterator[Dict[str, Any]]:
        """Parse file using the first compatible parser.
        
        Args:
            file_obj: File object
            config: Ingestion configuration
            
        Yields:
            Parsed records
        """
        for parser in self.parsers:
            if parser.can_parse(file_obj):
                self.logger.info(f"Using {parser.__class__.__name__} to parse file")
                yield from parser.parse(file_obj, config)
                return
        
        raise DataIngestionError("No suitable parser found for file")
    
    def can_parse(self, file_obj: Union[TextIO, BinaryIO]) -> bool:
        """Check if any parser can handle the file.
        
        Args:
            file_obj: File object
            
        Returns:
            True if any parser can handle the file
        """
        return any(parser.can_parse(file_obj) for parser in self.parsers)