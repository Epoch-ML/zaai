"""
Report generation and building for the visualization module.

This module provides functionality for creating comprehensive reports
that combine multiple visualizations, tables, and text.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union
import json
import logging

from core.base import BaseComponent, Metadata
from core.exceptions import VisualizationError
from core.config import VisualizationConfig
from core.registry import register_component, ComponentType
from .charts import ChartData, ChartConfig, ChartGenerator
from processing.aggregators import AggregationResult


class ReportFormat(Enum):
    """Supported report formats."""
    HTML = "html"
    PDF = "pdf"
    MARKDOWN = "markdown"
    DOCX = "docx"
    JSON = "json"


class SectionType(Enum):
    """Types of report sections."""
    TITLE = "title"
    SUMMARY = "summary"
    TEXT = "text"
    CHART = "chart"
    TABLE = "table"
    METRICS = "metrics"
    PAGEBREAK = "pagebreak"


@dataclass
class ReportSection:
    """Represents a section in a report."""
    
    section_type: SectionType
    title: Optional[str] = None
    content: Any = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    style: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ReportTemplate:
    """Template for report generation."""
    
    name: str
    title: str
    author: str = ""
    created_date: Optional[datetime] = None
    sections: List[ReportSection] = field(default_factory=list)
    style: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """Initialize default values."""
        if self.created_date is None:
            self.created_date = datetime.now()


@register_component(ComponentType.VISUALIZER, tags=["reports", "documentation"])
class ReportBuilder(BaseComponent):
    """Builder for creating comprehensive reports."""
    
    def __init__(self, config: Optional[VisualizationConfig] = None):
        """Initialize report builder.
        
        Args:
            config: Visualization configuration
        """
        super().__init__()
        self.viz_config = config or VisualizationConfig()
        self.templates: Dict[str, ReportTemplate] = {}
        self.current_report: Optional[ReportTemplate] = None
        self.chart_generator = ChartGenerator(config)
    
    def create_report(self, title: str, author: str = "") -> ReportTemplate:
        """Create a new report.
        
        Args:
            title: Report title
            author: Report author
            
        Returns:
            Report template
        """
        report = ReportTemplate(
            name=f"report_{len(self.templates)}",
            title=title,
            author=author
        )
        
        self.current_report = report
        self.templates[report.name] = report
        
        self.logger.info(f"Created report: {title}")
        return report
    
    def add_title(self, text: str, level: int = 1) -> None:
        """Add a title section.
        
        Args:
            text: Title text
            level: Heading level (1-6)
        """
        if not self.current_report:
            raise VisualizationError("No active report")
        
        section = ReportSection(
            section_type=SectionType.TITLE,
            title=text,
            metadata={'level': level}
        )
        
        self.current_report.sections.append(section)
    
    def add_summary(self, summary_data: Dict[str, Any]) -> None:
        """Add an executive summary section.
        
        Args:
            summary_data: Summary data dictionary
        """
        if not self.current_report:
            raise VisualizationError("No active report")
        
        section = ReportSection(
            section_type=SectionType.SUMMARY,
            title="Executive Summary",
            content=summary_data
        )
        
        self.current_report.sections.append(section)
    
    def add_text(self, text: str, formatting: Optional[Dict] = None) -> None:
        """Add a text section.
        
        Args:
            text: Text content
            formatting: Optional text formatting
        """
        if not self.current_report:
            raise VisualizationError("No active report")
        
        section = ReportSection(
            section_type=SectionType.TEXT,
            content=text,
            style=formatting or {}
        )
        
        self.current_report.sections.append(section)
    
    def add_chart(self, chart_data: ChartData, chart_config: ChartConfig,
                  caption: Optional[str] = None) -> None:
        """Add a chart section.
        
        Args:
            chart_data: Chart data
            chart_config: Chart configuration
            caption: Optional chart caption
        """
        if not self.current_report:
            raise VisualizationError("No active report")
        
        # Generate chart
        chart = self.chart_generator.create_chart(chart_data, chart_config)
        
        section = ReportSection(
            section_type=SectionType.CHART,
            title=chart_config.title,
            content=chart,
            metadata={'caption': caption} if caption else {}
        )
        
        self.current_report.sections.append(section)
    
    def add_table(self, data: List[Dict[str, Any]], title: Optional[str] = None,
                  headers: Optional[List[str]] = None) -> None:
        """Add a table section.
        
        Args:
            data: Table data as list of dictionaries
            title: Optional table title
            headers: Optional custom headers
        """
        if not self.current_report:
            raise VisualizationError("No active report")
        
        # Extract headers if not provided
        if not headers and data:
            headers = list(data[0].keys())
        
        table_spec = {
            'headers': headers,
            'rows': data,
            'title': title
        }
        
        section = ReportSection(
            section_type=SectionType.TABLE,
            title=title,
            content=table_spec
        )
        
        self.current_report.sections.append(section)
    
    def add_metrics(self, metrics: Dict[str, Any], title: str = "Key Metrics") -> None:
        """Add a metrics section.
        
        Args:
            metrics: Dictionary of metric values
            title: Section title
        """
        if not self.current_report:
            raise VisualizationError("No active report")
        
        section = ReportSection(
            section_type=SectionType.METRICS,
            title=title,
            content=metrics
        )
        
        self.current_report.sections.append(section)
    
    def add_page_break(self) -> None:
        """Add a page break."""
        if not self.current_report:
            raise VisualizationError("No active report")
        
        section = ReportSection(section_type=SectionType.PAGEBREAK)
        self.current_report.sections.append(section)
    
    def generate_report(self, report_name: Optional[str] = None,
                       format: ReportFormat = ReportFormat.HTML) -> str:
        """Generate report in specified format.
        
        Args:
            report_name: Report to generate (uses current if None)
            format: Output format
            
        Returns:
            Generated report content
        """
        if report_name:
            if report_name not in self.templates:
                raise VisualizationError(f"Report not found: {report_name}")
            report = self.templates[report_name]
        else:
            if not self.current_report:
                raise VisualizationError("No report to generate")
            report = self.current_report
        
        self.logger.info(f"Generating {format.value} report: {report.title}")
        
        if format == ReportFormat.HTML:
            return self._generate_html(report)
        elif format == ReportFormat.MARKDOWN:
            return self._generate_markdown(report)
        elif format == ReportFormat.JSON:
            return self._generate_json(report)
        else:
            raise VisualizationError(f"Format not implemented: {format.value}")
    
    def _generate_html(self, report: ReportTemplate) -> str:
        """Generate HTML report.
        
        Args:
            report: Report template
            
        Returns:
            HTML string
        """
        html_parts = [
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            f'<title>{report.title}</title>',
            '<style>',
            self._get_html_styles(),
            '</style>',
            '</head>',
            '<body>',
            '<div class="report-container">'
        ]
        
        # Add report header
        html_parts.extend([
            f'<h1 class="report-title">{report.title}</h1>',
            f'<div class="report-meta">',
            f'<span>Author: {report.author}</span>',
            f'<span>Date: {report.created_date.strftime("%Y-%m-%d")}</span>',
            '</div>'
        ])
        
        # Add sections
        for section in report.sections:
            html_parts.append(self._render_html_section(section))
        
        html_parts.extend([
            '</div>',
            '</body>',
            '</html>'
        ])
        
        return '\n'.join(html_parts)
    
    def _render_html_section(self, section: ReportSection) -> str:
        """Render a report section as HTML.
        
        Args:
            section: Report section
            
        Returns:
            HTML string
        """
        if section.section_type == SectionType.TITLE:
            level = section.metadata.get('level', 2)
            return f'<h{level}>{section.title}</h{level}>'
        
        elif section.section_type == SectionType.SUMMARY:
            html = '<div class="summary">'
            html += f'<h2>{section.title}</h2>'
            html += '<ul>'
            for key, value in section.content.items():
                html += f'<li><strong>{key}:</strong> {value}</li>'
            html += '</ul>'
            html += '</div>'
            return html
        
        elif section.section_type == SectionType.TEXT:
            return f'<p class="text">{section.content}</p>'
        
        elif section.section_type == SectionType.CHART:
            html = '<div class="chart">'
            if section.title:
                html += f'<h3>{section.title}</h3>'
            html += f'<pre>{json.dumps(section.content, indent=2)}</pre>'
            if section.metadata.get('caption'):
                html += f'<p class="caption">{section.metadata["caption"]}</p>'
            html += '</div>'
            return html
        
        elif section.section_type == SectionType.TABLE:
            html = '<div class="table-container">'
            if section.title:
                html += f'<h3>{section.title}</h3>'
            html += '<table>'
            
            # Headers
            if section.content['headers']:
                html += '<thead><tr>'
                for header in section.content['headers']:
                    html += f'<th>{header}</th>'
                html += '</tr></thead>'
            
            # Rows
            html += '<tbody>'
            for row in section.content['rows']:
                html += '<tr>'
                for header in section.content['headers']:
                    html += f'<td>{row.get(header, "")}</td>'
                html += '</tr>'
            html += '</tbody>'
            
            html += '</table>'
            html += '</div>'
            return html
        
        elif section.section_type == SectionType.METRICS:
            html = '<div class="metrics">'
            html += f'<h3>{section.title}</h3>'
            html += '<div class="metrics-grid">'
            for key, value in section.content.items():
                html += f'<div class="metric"><span class="metric-label">{key}:</span> '
                html += f'<span class="metric-value">{value}</span></div>'
            html += '</div>'
            html += '</div>'
            return html
        
        elif section.section_type == SectionType.PAGEBREAK:
            return '<div class="pagebreak"></div>'
        
        return ''
    
    def _get_html_styles(self) -> str:
        """Get HTML stylesheet.
        
        Returns:
            CSS styles
        """
        return """
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .report-container {
            background: white;
            padding: 40px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .report-title {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }
        .report-meta {
            color: #666;
            margin: 20px 0;
            display: flex;
            justify-content: space-between;
        }
        .summary {
            background: #f8f9fa;
            padding: 20px;
            border-left: 4px solid #3498db;
            margin: 20px 0;
        }
        .chart {
            margin: 30px 0;
            padding: 20px;
            border: 1px solid #ddd;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background: #f4f4f4;
            font-weight: bold;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .metric {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
        }
        .metric-label {
            font-weight: bold;
            color: #666;
        }
        .metric-value {
            font-size: 1.2em;
            color: #2c3e50;
        }
        .pagebreak {
            page-break-after: always;
        }
        """
    
    def _generate_markdown(self, report: ReportTemplate) -> str:
        """Generate Markdown report.
        
        Args:
            report: Report template
            
        Returns:
            Markdown string
        """
        md_parts = [
            f'# {report.title}',
            '',
            f'**Author:** {report.author}  ',
            f'**Date:** {report.created_date.strftime("%Y-%m-%d")}',
            '',
            '---',
            ''
        ]
        
        for section in report.sections:
            md_parts.append(self._render_markdown_section(section))
            md_parts.append('')
        
        return '\n'.join(md_parts)
    
    def _render_markdown_section(self, section: ReportSection) -> str:
        """Render a report section as Markdown.
        
        Args:
            section: Report section
            
        Returns:
            Markdown string
        """
        if section.section_type == SectionType.TITLE:
            level = section.metadata.get('level', 2)
            return '#' * level + ' ' + section.title
        
        elif section.section_type == SectionType.SUMMARY:
            md = f'## {section.title}\n\n'
            for key, value in section.content.items():
                md += f'- **{key}:** {value}\n'
            return md
        
        elif section.section_type == SectionType.TEXT:
            return section.content
        
        elif section.section_type == SectionType.CHART:
            md = ''
            if section.title:
                md += f'### {section.title}\n\n'
            md += '```json\n'
            md += json.dumps(section.content, indent=2)
            md += '\n```'
            if section.metadata.get('caption'):
                md += f'\n\n*{section.metadata["caption"]}*'
            return md
        
        elif section.section_type == SectionType.TABLE:
            md = ''
            if section.title:
                md += f'### {section.title}\n\n'
            
            headers = section.content['headers']
            md += '| ' + ' | '.join(headers) + ' |\n'
            md += '| ' + ' | '.join(['---'] * len(headers)) + ' |\n'
            
            for row in section.content['rows']:
                values = [str(row.get(h, '')) for h in headers]
                md += '| ' + ' | '.join(values) + ' |\n'
            
            return md
        
        elif section.section_type == SectionType.METRICS:
            md = f'### {section.title}\n\n'
            for key, value in section.content.items():
                md += f'- **{key}:** {value}\n'
            return md
        
        elif section.section_type == SectionType.PAGEBREAK:
            return '---'
        
        return ''
    
    def _generate_json(self, report: ReportTemplate) -> str:
        """Generate JSON report.
        
        Args:
            report: Report template
            
        Returns:
            JSON string
        """
        report_dict = {
            'title': report.title,
            'author': report.author,
            'created_date': report.created_date.isoformat(),
            'sections': []
        }
        
        for section in report.sections:
            section_dict = {
                'type': section.section_type.value,
                'title': section.title,
                'content': section.content,
                'metadata': section.metadata
            }
            report_dict['sections'].append(section_dict)
        
        return json.dumps(report_dict, indent=2)
    
    def export_report(self, output_path: str, report_name: Optional[str] = None,
                     format: Optional[ReportFormat] = None) -> None:
        """Export report to file.
        
        Args:
            output_path: Output file path
            report_name: Report to export (uses current if None)
            format: Export format (inferred from path if None)
        """
        # Infer format from file extension if not provided
        if format is None:
            ext = output_path.split('.')[-1].lower()
            try:
                format = ReportFormat(ext)
            except ValueError:
                format = ReportFormat.HTML
        
        # Generate report
        content = self.generate_report(report_name, format)
        
        # Write to file
        with open(output_path, 'w') as f:
            f.write(content)
        
        self.logger.info(f"Exported report to {output_path}")
    
    def initialize(self) -> None:
        """Initialize report builder."""
        self.logger.info("Report builder initialized")
    
    def cleanup(self) -> None:
        """Cleanup report builder resources."""
        self.templates.clear()
        self.current_report = None
    
    def validate(self) -> bool:
        """Validate report builder configuration."""
        return True


# Utility functions for creating common reports

def create_summary_report(data: Dict[str, Any], title: str = "Data Summary Report") -> str:
    """Create a summary report from data.
    
    Args:
        data: Data to summarize
        title: Report title
        
    Returns:
        HTML report
    """
    builder = ReportBuilder()
    builder.create_report(title)
    
    # Add summary section
    if 'summary' in data:
        builder.add_summary(data['summary'])
    
    # Add metrics
    if 'metrics' in data:
        builder.add_metrics(data['metrics'])
    
    # Add charts
    if 'charts' in data:
        for chart_spec in data['charts']:
            # Create chart from specification
            pass  # Would need actual chart data
    
    # Add tables
    if 'tables' in data:
        for table_spec in data['tables']:
            builder.add_table(
                table_spec['data'],
                table_spec.get('title'),
                table_spec.get('headers')
            )
    
    return builder.generate_report(format=ReportFormat.HTML)