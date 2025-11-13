"""
Data export utilities for the visualization module.

This module provides functionality for exporting data and visualizations
to various formats for distribution and sharing.
"""

import csv
import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import logging

from core.base import BaseComponent
from core.exceptions import VisualizationError
from core.config import VisualizationConfig
from core.registry import register_component, ComponentType


class ExportFormat(Enum):
    """Supported export formats."""
    CSV = "csv"
    JSON = "json"
    EXCEL = "excel"
    HTML = "html"
    PDF = "pdf"
    PNG = "png"
    SVG = "svg"
    XML = "xml"
    MARKDOWN = "markdown"
    LATEX = "latex"


@dataclass
class ExportOptions:
    """Options for data export."""
    
    format: ExportFormat
    include_headers: bool = True
    include_metadata: bool = False
    compression: Optional[str] = None
    encoding: str = "utf-8"
    delimiter: str = ","
    quote_char: str = '"'
    escape_char: str = "\\"
    line_terminator: str = "\n"
    custom_options: Dict[str, Any] = None
    
    def __post_init__(self):
        """Initialize custom options."""
        if self.custom_options is None:
            self.custom_options = {}


@register_component(ComponentType.EXPORTER, tags=["export", "output"])
class DataExporter(BaseComponent):
    """Main exporter for data and visualizations."""
    
    def __init__(self, config: Optional[VisualizationConfig] = None):
        """Initialize data exporter.
        
        Args:
            config: Visualization configuration
        """
        super().__init__()
        self.viz_config = config or VisualizationConfig()
        self.exporters = self._initialize_exporters()
    
    def _initialize_exporters(self) -> Dict[ExportFormat, callable]:
        """Initialize format-specific exporters.
        
        Returns:
            Dictionary of format to exporter function
        """
        return {
            ExportFormat.CSV: self._export_csv,
            ExportFormat.JSON: self._export_json,
            ExportFormat.HTML: self._export_html,
            ExportFormat.XML: self._export_xml,
            ExportFormat.MARKDOWN: self._export_markdown,
        }
    
    def export(self, data: Any, output_path: Union[str, Path],
              options: Optional[ExportOptions] = None) -> None:
        """Export data to file.
        
        Args:
            data: Data to export
            output_path: Output file path
            options: Export options
        """
        output_path = Path(output_path)
        
        # Determine format from extension if not provided
        if options is None:
            ext = output_path.suffix.lower()[1:]  # Remove the dot
            try:
                format = ExportFormat(ext)
            except ValueError:
                raise VisualizationError(f"Unknown export format: {ext}")
            options = ExportOptions(format=format)
        
        # Get appropriate exporter
        if options.format not in self.exporters:
            raise VisualizationError(
                f"No exporter for format: {options.format.value}",
                export_format=options.format.value
            )
        
        exporter = self.exporters[options.format]
        
        # Create output directory if needed
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Export data
        try:
            exporter(data, output_path, options)
            self.logger.info(f"Exported data to {output_path}")
        except Exception as e:
            raise VisualizationError(
                f"Export failed: {e}",
                export_format=options.format.value
            )
    
    def _export_csv(self, data: Union[List[Dict], List[List]], 
                   output_path: Path, options: ExportOptions) -> None:
        """Export data to CSV format.
        
        Args:
            data: Data to export (list of dicts or list of lists)
            output_path: Output file path
            options: Export options
        """
        with open(output_path, 'w', newline='', encoding=options.encoding) as f:
            if not data:
                return
            
            if isinstance(data[0], dict):
                # Export list of dictionaries
                headers = list(data[0].keys())
                writer = csv.DictWriter(
                    f,
                    fieldnames=headers,
                    delimiter=options.delimiter,
                    quotechar=options.quote_char,
                    escapechar=options.escape_char,
                    lineterminator=options.line_terminator
                )
                
                if options.include_headers:
                    writer.writeheader()
                
                for row in data:
                    writer.writerow(row)
            else:
                # Export list of lists
                writer = csv.writer(
                    f,
                    delimiter=options.delimiter,
                    quotechar=options.quote_char,
                    escapechar=options.escape_char,
                    lineterminator=options.line_terminator
                )
                
                for row in data:
                    writer.writerow(row)
    
    def _export_json(self, data: Any, output_path: Path, 
                    options: ExportOptions) -> None:
        """Export data to JSON format.
        
        Args:
            data: Data to export
            output_path: Output file path
            options: Export options
        """
        with open(output_path, 'w', encoding=options.encoding) as f:
            json_data = data
            
            if options.include_metadata:
                json_data = {
                    'metadata': {
                        'exported_at': str(Path.ctime(output_path)),
                        'format': 'json',
                        'encoding': options.encoding
                    },
                    'data': data
                }
            
            json.dump(
                json_data,
                f,
                indent=2,
                ensure_ascii=False if options.encoding == 'utf-8' else True
            )
    
    def _export_html(self, data: Any, output_path: Path,
                    options: ExportOptions) -> None:
        """Export data to HTML format.
        
        Args:
            data: Data to export
            output_path: Output file path
            options: Export options
        """
        html_parts = [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8">',
            '<title>Data Export</title>',
            '<style>',
            self._get_export_styles(),
            '</style>',
            '</head>',
            '<body>',
            '<div class="container">'
        ]
        
        if isinstance(data, list) and data and isinstance(data[0], dict):
            # Export as table
            html_parts.append('<table>')
            
            # Headers
            if options.include_headers:
                html_parts.append('<thead><tr>')
                for header in data[0].keys():
                    html_parts.append(f'<th>{header}</th>')
                html_parts.append('</tr></thead>')
            
            # Body
            html_parts.append('<tbody>')
            for row in data:
                html_parts.append('<tr>')
                for value in row.values():
                    html_parts.append(f'<td>{value}</td>')
                html_parts.append('</tr>')
            html_parts.append('</tbody>')
            
            html_parts.append('</table>')
        else:
            # Export as preformatted JSON
            html_parts.append('<pre>')
            html_parts.append(json.dumps(data, indent=2))
            html_parts.append('</pre>')
        
        html_parts.extend([
            '</div>',
            '</body>',
            '</html>'
        ])
        
        with open(output_path, 'w', encoding=options.encoding) as f:
            f.write('\n'.join(html_parts))
    
    def _export_xml(self, data: Any, output_path: Path,
                   options: ExportOptions) -> None:
        """Export data to XML format.
        
        Args:
            data: Data to export
            output_path: Output file path
            options: Export options
        """
        import xml.etree.ElementTree as ET
        
        root = ET.Element('data')
        
        if options.include_metadata:
            metadata = ET.SubElement(root, 'metadata')
            ET.SubElement(metadata, 'format').text = 'xml'
            ET.SubElement(metadata, 'encoding').text = options.encoding
        
        if isinstance(data, list):
            items = ET.SubElement(root, 'items')
            for item in data:
                item_elem = ET.SubElement(items, 'item')
                self._dict_to_xml(item, item_elem)
        elif isinstance(data, dict):
            self._dict_to_xml(data, root)
        else:
            ET.SubElement(root, 'value').text = str(data)
        
        tree = ET.ElementTree(root)
        tree.write(output_path, encoding=options.encoding, xml_declaration=True)
    
    def _dict_to_xml(self, data: Dict, parent: Any) -> None:
        """Convert dictionary to XML elements.
        
        Args:
            data: Dictionary data
            parent: Parent XML element
        """
        import xml.etree.ElementTree as ET
        
        for key, value in data.items():
            # Sanitize key for XML element name
            key = str(key).replace(' ', '_').replace('-', '_')
            
            if isinstance(value, dict):
                elem = ET.SubElement(parent, key)
                self._dict_to_xml(value, elem)
            elif isinstance(value, list):
                elem = ET.SubElement(parent, key)
                for item in value:
                    if isinstance(item, dict):
                        item_elem = ET.SubElement(elem, 'item')
                        self._dict_to_xml(item, item_elem)
                    else:
                        ET.SubElement(elem, 'item').text = str(item)
            else:
                ET.SubElement(parent, key).text = str(value)
    
    def _export_markdown(self, data: Any, output_path: Path,
                        options: ExportOptions) -> None:
        """Export data to Markdown format.
        
        Args:
            data: Data to export
            output_path: Output file path
            options: Export options
        """
        md_parts = ['# Data Export\n']
        
        if options.include_metadata:
            md_parts.append('## Metadata\n')
            md_parts.append(f'- Format: markdown')
            md_parts.append(f'- Encoding: {options.encoding}\n')
        
        if isinstance(data, list) and data and isinstance(data[0], dict):
            # Export as table
            md_parts.append('## Data\n')
            
            headers = list(data[0].keys())
            md_parts.append('| ' + ' | '.join(headers) + ' |')
            md_parts.append('| ' + ' | '.join(['---'] * len(headers)) + ' |')
            
            for row in data:
                values = [str(row.get(h, '')) for h in headers]
                md_parts.append('| ' + ' | '.join(values) + ' |')
        else:
            # Export as code block
            md_parts.append('## Data\n')
            md_parts.append('```json')
            md_parts.append(json.dumps(data, indent=2))
            md_parts.append('```')
        
        with open(output_path, 'w', encoding=options.encoding) as f:
            f.write('\n'.join(md_parts))
    
    def _get_export_styles(self) -> str:
        """Get CSS styles for HTML export.
        
        Returns:
            CSS styles
        """
        return """
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background: #4CAF50;
            color: white;
        }
        tr:nth-child(even) {
            background: #f2f2f2;
        }
        pre {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 3px;
            overflow-x: auto;
        }
        """
    
    def batch_export(self, datasets: Dict[str, Any], output_dir: Union[str, Path],
                    format: ExportFormat) -> None:
        """Export multiple datasets to separate files.
        
        Args:
            datasets: Dictionary of name to data
            output_dir: Output directory
            format: Export format
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        for name, data in datasets.items():
            output_path = output_dir / f"{name}.{format.value}"
            options = ExportOptions(format=format)
            self.export(data, output_path, options)
        
        self.logger.info(f"Batch exported {len(datasets)} files to {output_dir}")
    
    def initialize(self) -> None:
        """Initialize data exporter."""
        self.logger.info("Data exporter initialized")
    
    def cleanup(self) -> None:
        """Cleanup exporter resources."""
        pass
    
    def validate(self) -> bool:
        """Validate exporter configuration."""
        return True


# Utility export functions

def export_to_csv(data: List[Dict], output_path: str) -> None:
    """Export data to CSV file.
    
    Args:
        data: Data to export
        output_path: Output file path
    """
    exporter = DataExporter()
    options = ExportOptions(format=ExportFormat.CSV)
    exporter.export(data, output_path, options)


def export_to_json(data: Any, output_path: str, pretty: bool = True) -> None:
    """Export data to JSON file.
    
    Args:
        data: Data to export
        output_path: Output file path
        pretty: Pretty print JSON
    """
    exporter = DataExporter()
    options = ExportOptions(format=ExportFormat.JSON)
    exporter.export(data, output_path, options)


def export_to_html(data: Any, output_path: str) -> None:
    """Export data to HTML file.
    
    Args:
        data: Data to export
        output_path: Output file path
    """
    exporter = DataExporter()
    options = ExportOptions(format=ExportFormat.HTML)
    exporter.export(data, output_path, options)