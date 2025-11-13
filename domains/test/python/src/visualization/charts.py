"""
Chart generation utilities for the visualization module.

This module provides functionality for creating various types of
charts and visualizations from processed data.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union
import json
import logging

from core.base import BaseComponent
from core.exceptions import VisualizationError
from core.config import VisualizationConfig
from core.registry import register_component, ComponentType


class ChartType(Enum):
    """Supported chart types."""
    LINE = "line"
    BAR = "bar"
    SCATTER = "scatter"
    PIE = "pie"
    HISTOGRAM = "histogram"
    HEATMAP = "heatmap"
    BOX = "box"
    AREA = "area"
    BUBBLE = "bubble"
    SANKEY = "sankey"


@dataclass
class ChartData:
    """Data structure for chart visualization."""
    
    x_values: List[Any] = field(default_factory=list)
    y_values: List[Any] = field(default_factory=list)
    labels: List[str] = field(default_factory=list)
    series: Dict[str, List[Any]] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ChartStyle:
    """Styling configuration for charts."""
    
    theme: str = "modern"
    colors: List[str] = field(default_factory=list)
    font_family: str = "Arial"
    font_size: int = 12
    title_size: int = 16
    background_color: str = "#ffffff"
    grid_color: str = "#e0e0e0"
    show_grid: bool = True
    show_legend: bool = True
    width: int = 800
    height: int = 600


@dataclass
class ChartConfig:
    """Configuration for a chart."""
    
    chart_type: ChartType
    title: str = ""
    x_label: str = ""
    y_label: str = ""
    style: ChartStyle = field(default_factory=ChartStyle)
    interactive: bool = False
    annotations: List[Dict[str, Any]] = field(default_factory=list)


@register_component(ComponentType.VISUALIZER, tags=["charts", "plotting"])
class ChartGenerator(BaseComponent):
    """Main chart generator for creating visualizations."""
    
    def __init__(self, config: Optional[VisualizationConfig] = None):
        """Initialize chart generator.
        
        Args:
            config: Visualization configuration
        """
        super().__init__()
        self.viz_config = config or VisualizationConfig()
        self.charts: Dict[str, Dict] = {}
    
    def create_chart(self, data: ChartData, config: ChartConfig) -> Dict[str, Any]:
        """Create a chart from data.
        
        Args:
            data: Chart data
            config: Chart configuration
            
        Returns:
            Chart specification
        """
        self.logger.info(f"Creating {config.chart_type.value} chart: {config.title}")
        
        try:
            if config.chart_type == ChartType.LINE:
                chart = self._create_line_chart(data, config)
            elif config.chart_type == ChartType.BAR:
                chart = self._create_bar_chart(data, config)
            elif config.chart_type == ChartType.SCATTER:
                chart = self._create_scatter_chart(data, config)
            elif config.chart_type == ChartType.PIE:
                chart = self._create_pie_chart(data, config)
            elif config.chart_type == ChartType.HISTOGRAM:
                chart = self._create_histogram(data, config)
            else:
                raise VisualizationError(
                    f"Unsupported chart type: {config.chart_type.value}",
                    chart_type=config.chart_type.value
                )
            
            # Store chart
            chart_id = f"chart_{len(self.charts)}"
            self.charts[chart_id] = chart
            
            return chart
            
        except Exception as e:
            raise VisualizationError(f"Failed to create chart: {e}", chart_type=config.chart_type.value)
    
    def _create_line_chart(self, data: ChartData, config: ChartConfig) -> Dict[str, Any]:
        """Create a line chart specification.
        
        Args:
            data: Chart data
            config: Chart configuration
            
        Returns:
            Line chart specification
        """
        chart = {
            'type': 'line',
            'title': config.title,
            'axes': {
                'x': {'label': config.x_label, 'values': data.x_values},
                'y': {'label': config.y_label}
            },
            'series': [],
            'style': self._get_style_spec(config.style)
        }
        
        # Add series
        if data.series:
            for name, values in data.series.items():
                chart['series'].append({
                    'name': name,
                    'values': values,
                    'type': 'line'
                })
        else:
            chart['series'].append({
                'name': config.y_label or 'Value',
                'values': data.y_values,
                'type': 'line'
            })
        
        return chart
    
    def _create_bar_chart(self, data: ChartData, config: ChartConfig) -> Dict[str, Any]:
        """Create a bar chart specification.
        
        Args:
            data: Chart data
            config: Chart configuration
            
        Returns:
            Bar chart specification
        """
        chart = {
            'type': 'bar',
            'title': config.title,
            'axes': {
                'x': {'label': config.x_label, 'categories': data.labels or data.x_values},
                'y': {'label': config.y_label}
            },
            'series': [],
            'style': self._get_style_spec(config.style)
        }
        
        # Add series
        if data.series:
            for name, values in data.series.items():
                chart['series'].append({
                    'name': name,
                    'values': values,
                    'type': 'bar'
                })
        else:
            chart['series'].append({
                'name': config.y_label or 'Value',
                'values': data.y_values,
                'type': 'bar'
            })
        
        return chart
    
    def _create_scatter_chart(self, data: ChartData, config: ChartConfig) -> Dict[str, Any]:
        """Create a scatter plot specification.
        
        Args:
            data: Chart data
            config: Chart configuration
            
        Returns:
            Scatter plot specification
        """
        chart = {
            'type': 'scatter',
            'title': config.title,
            'axes': {
                'x': {'label': config.x_label},
                'y': {'label': config.y_label}
            },
            'series': [],
            'style': self._get_style_spec(config.style)
        }
        
        # Add points
        if data.series:
            for name, points in data.series.items():
                chart['series'].append({
                    'name': name,
                    'points': points,
                    'type': 'scatter'
                })
        else:
            # Combine x and y values into points
            points = list(zip(data.x_values, data.y_values))
            chart['series'].append({
                'name': 'Data',
                'points': points,
                'type': 'scatter'
            })
        
        return chart
    
    def _create_pie_chart(self, data: ChartData, config: ChartConfig) -> Dict[str, Any]:
        """Create a pie chart specification.
        
        Args:
            data: Chart data
            config: Chart configuration
            
        Returns:
            Pie chart specification
        """
        chart = {
            'type': 'pie',
            'title': config.title,
            'slices': [],
            'style': self._get_style_spec(config.style)
        }
        
        # Add slices
        for i, (label, value) in enumerate(zip(data.labels, data.y_values)):
            chart['slices'].append({
                'label': label,
                'value': value,
                'color': config.style.colors[i % len(config.style.colors)] if config.style.colors else None
            })
        
        return chart
    
    def _create_histogram(self, data: ChartData, config: ChartConfig) -> Dict[str, Any]:
        """Create a histogram specification.
        
        Args:
            data: Chart data
            config: Chart configuration
            
        Returns:
            Histogram specification
        """
        # Calculate histogram bins
        values = data.y_values if data.y_values else data.x_values
        num_bins = data.metadata.get('bins', 10)
        
        hist_data = self._calculate_histogram(values, num_bins)
        
        chart = {
            'type': 'histogram',
            'title': config.title,
            'axes': {
                'x': {'label': config.x_label or 'Value'},
                'y': {'label': config.y_label or 'Frequency'}
            },
            'bins': hist_data['bins'],
            'frequencies': hist_data['frequencies'],
            'style': self._get_style_spec(config.style)
        }
        
        return chart
    
    def _calculate_histogram(self, values: List[float], num_bins: int) -> Dict[str, List]:
        """Calculate histogram bins and frequencies.
        
        Args:
            values: Data values
            num_bins: Number of bins
            
        Returns:
            Histogram data
        """
        if not values:
            return {'bins': [], 'frequencies': []}
        
        min_val = min(values)
        max_val = max(values)
        bin_width = (max_val - min_val) / num_bins if max_val != min_val else 1
        
        bins = [min_val + i * bin_width for i in range(num_bins + 1)]
        frequencies = [0] * num_bins
        
        for value in values:
            bin_index = min(int((value - min_val) / bin_width), num_bins - 1)
            frequencies[bin_index] += 1
        
        return {'bins': bins[:-1], 'frequencies': frequencies}
    
    def _get_style_spec(self, style: ChartStyle) -> Dict[str, Any]:
        """Convert style object to specification.
        
        Args:
            style: Chart style
            
        Returns:
            Style specification
        """
        return {
            'theme': style.theme,
            'colors': style.colors or self.viz_config.color_palette,
            'font': {
                'family': style.font_family,
                'size': style.font_size,
                'titleSize': style.title_size
            },
            'background': style.background_color,
            'grid': {
                'show': style.show_grid,
                'color': style.grid_color
            },
            'legend': {
                'show': style.show_legend
            },
            'dimensions': {
                'width': style.width,
                'height': style.height
            }
        }
    
    def export_chart(self, chart_id: str, format: str, output_path: str) -> None:
        """Export a chart to file.
        
        Args:
            chart_id: Chart identifier
            format: Export format (png, svg, pdf, html)
            output_path: Output file path
        """
        if chart_id not in self.charts:
            raise VisualizationError(f"Chart not found: {chart_id}")
        
        chart = self.charts[chart_id]
        
        if format == 'json':
            # Export as JSON specification
            with open(output_path, 'w') as f:
                json.dump(chart, f, indent=2)
        elif format == 'html':
            # Export as HTML with embedded chart
            html = self._generate_html(chart)
            with open(output_path, 'w') as f:
                f.write(html)
        else:
            # Other formats would require actual rendering libraries
            raise VisualizationError(f"Export format not implemented: {format}", export_format=format)
        
        self.logger.info(f"Exported chart to {output_path}")
    
    def _generate_html(self, chart: Dict[str, Any]) -> str:
        """Generate HTML for a chart.
        
        Args:
            chart: Chart specification
            
        Returns:
            HTML string
        """
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>{chart.get('title', 'Chart')}</title>
            <style>
                body {{ font-family: {chart['style']['font']['family']}; }}
                .chart-container {{ 
                    width: {chart['style']['dimensions']['width']}px;
                    height: {chart['style']['dimensions']['height']}px;
                    margin: 20px auto;
                    border: 1px solid #ddd;
                    padding: 20px;
                }}
            </style>
        </head>
        <body>
            <div class="chart-container">
                <h2>{chart.get('title', 'Chart')}</h2>
                <pre>{json.dumps(chart, indent=2)}</pre>
            </div>
        </body>
        </html>
        """
        return html
    
    def initialize(self) -> None:
        """Initialize chart generator."""
        self.logger.info("Chart generator initialized")
    
    def cleanup(self) -> None:
        """Cleanup chart generator resources."""
        self.charts.clear()
    
    def validate(self) -> bool:
        """Validate chart generator configuration."""
        return True


class ChartBuilder:
    """Builder for constructing charts with fluent interface."""
    
    def __init__(self, chart_type: ChartType):
        """Initialize chart builder.
        
        Args:
            chart_type: Type of chart to build
        """
        self.config = ChartConfig(chart_type=chart_type)
        self.data = ChartData()
        self.logger = logging.getLogger(__name__)
    
    def title(self, title: str) -> 'ChartBuilder':
        """Set chart title.
        
        Args:
            title: Chart title
            
        Returns:
            Self for chaining
        """
        self.config.title = title
        return self
    
    def x_axis(self, label: str, values: List[Any] = None) -> 'ChartBuilder':
        """Configure X axis.
        
        Args:
            label: Axis label
            values: Axis values
            
        Returns:
            Self for chaining
        """
        self.config.x_label = label
        if values:
            self.data.x_values = values
        return self
    
    def y_axis(self, label: str, values: List[Any] = None) -> 'ChartBuilder':
        """Configure Y axis.
        
        Args:
            label: Axis label
            values: Axis values
            
        Returns:
            Self for chaining
        """
        self.config.y_label = label
        if values:
            self.data.y_values = values
        return self
    
    def add_series(self, name: str, values: List[Any]) -> 'ChartBuilder':
        """Add a data series.
        
        Args:
            name: Series name
            values: Series values
            
        Returns:
            Self for chaining
        """
        self.data.series[name] = values
        return self
    
    def style(self, **kwargs) -> 'ChartBuilder':
        """Configure chart style.
        
        Args:
            **kwargs: Style parameters
            
        Returns:
            Self for chaining
        """
        for key, value in kwargs.items():
            if hasattr(self.config.style, key):
                setattr(self.config.style, key, value)
        return self
    
    def build(self) -> Tuple[ChartData, ChartConfig]:
        """Build the chart.
        
        Returns:
            Tuple of chart data and configuration
        """
        return self.data, self.config


# Utility functions for common chart types

def create_line_chart(x_values: List[Any], y_values: List[Any],
                     title: str = "", x_label: str = "", y_label: str = "") -> Dict[str, Any]:
    """Create a simple line chart.
    
    Args:
        x_values: X axis values
        y_values: Y axis values
        title: Chart title
        x_label: X axis label
        y_label: Y axis label
        
    Returns:
        Chart specification
    """
    builder = ChartBuilder(ChartType.LINE)
    data, config = (builder
                    .title(title)
                    .x_axis(x_label, x_values)
                    .y_axis(y_label, y_values)
                    .build())
    
    generator = ChartGenerator()
    return generator.create_chart(data, config)


def create_bar_chart(categories: List[str], values: List[float],
                    title: str = "", x_label: str = "", y_label: str = "") -> Dict[str, Any]:
    """Create a simple bar chart.
    
    Args:
        categories: Category labels
        values: Bar values
        title: Chart title
        x_label: X axis label
        y_label: Y axis label
        
    Returns:
        Chart specification
    """
    data = ChartData(labels=categories, y_values=values)
    config = ChartConfig(
        chart_type=ChartType.BAR,
        title=title,
        x_label=x_label,
        y_label=y_label
    )
    
    generator = ChartGenerator()
    return generator.create_chart(data, config)


def create_pie_chart(labels: List[str], values: List[float], title: str = "") -> Dict[str, Any]:
    """Create a simple pie chart.
    
    Args:
        labels: Slice labels
        values: Slice values
        title: Chart title
        
    Returns:
        Chart specification
    """
    data = ChartData(labels=labels, y_values=values)
    config = ChartConfig(chart_type=ChartType.PIE, title=title)
    
    generator = ChartGenerator()
    return generator.create_chart(data, config)