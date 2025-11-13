"""
Visualization templates for the visualization module.

This module provides reusable templates for common visualization patterns
and dashboard layouts.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Union
import json
import logging

from core.base import BaseComponent
from core.exceptions import VisualizationError
from core.config import VisualizationConfig
from .charts import ChartType, ChartConfig, ChartStyle
from .reports import ReportTemplate, ReportSection, SectionType


class TemplateType(Enum):
    """Types of visualization templates."""
    DASHBOARD = "dashboard"
    REPORT = "report"
    INFOGRAPHIC = "infographic"
    PRESENTATION = "presentation"
    ANALYSIS = "analysis"


class LayoutType(Enum):
    """Layout types for templates."""
    SINGLE = "single"
    GRID = "grid"
    COLUMNS = "columns"
    ROWS = "rows"
    TABS = "tabs"


@dataclass
class TemplateElement:
    """Element within a template."""
    
    element_type: str
    position: Dict[str, int]  # x, y, width, height
    config: Dict[str, Any] = field(default_factory=dict)
    data_source: Optional[str] = None
    style: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DashboardTemplate:
    """Template for dashboard layouts."""
    
    name: str
    title: str
    layout: LayoutType
    elements: List[TemplateElement] = field(default_factory=list)
    refresh_interval: Optional[int] = None
    filters: List[Dict[str, Any]] = field(default_factory=list)
    style: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class TemplateLibrary(BaseComponent):
    """Library of reusable visualization templates."""
    
    def __init__(self, config: Optional[VisualizationConfig] = None):
        """Initialize template library.
        
        Args:
            config: Visualization configuration
        """
        super().__init__()
        self.viz_config = config or VisualizationConfig()
        self.templates: Dict[str, Any] = {}
        self._load_default_templates()
    
    def _load_default_templates(self) -> None:
        """Load default templates."""
        # Executive Dashboard
        self.templates['executive_dashboard'] = self._create_executive_dashboard()
        
        # Sales Report
        self.templates['sales_report'] = self._create_sales_report_template()
        
        # Analytics Dashboard
        self.templates['analytics_dashboard'] = self._create_analytics_dashboard()
        
        # Performance Report
        self.templates['performance_report'] = self._create_performance_report()
        
        self.logger.info(f"Loaded {len(self.templates)} default templates")
    
    def _create_executive_dashboard(self) -> DashboardTemplate:
        """Create executive dashboard template.
        
        Returns:
            Dashboard template
        """
        dashboard = DashboardTemplate(
            name="executive_dashboard",
            title="Executive Dashboard",
            layout=LayoutType.GRID
        )
        
        # KPI Cards
        dashboard.elements.append(TemplateElement(
            element_type="kpi_card",
            position={"x": 0, "y": 0, "width": 3, "height": 2},
            config={
                "title": "Revenue",
                "value_field": "revenue",
                "format": "currency",
                "comparison_field": "prev_revenue"
            },
            data_source="metrics"
        ))
        
        dashboard.elements.append(TemplateElement(
            element_type="kpi_card",
            position={"x": 3, "y": 0, "width": 3, "height": 2},
            config={
                "title": "Customers",
                "value_field": "customer_count",
                "format": "number",
                "comparison_field": "prev_customers"
            },
            data_source="metrics"
        ))
        
        dashboard.elements.append(TemplateElement(
            element_type="kpi_card",
            position={"x": 6, "y": 0, "width": 3, "height": 2},
            config={
                "title": "Growth Rate",
                "value_field": "growth_rate",
                "format": "percentage",
                "comparison_field": "prev_growth"
            },
            data_source="metrics"
        ))
        
        dashboard.elements.append(TemplateElement(
            element_type="kpi_card",
            position={"x": 9, "y": 0, "width": 3, "height": 2},
            config={
                "title": "Profit Margin",
                "value_field": "profit_margin",
                "format": "percentage",
                "comparison_field": "prev_margin"
            },
            data_source="metrics"
        ))
        
        # Charts
        dashboard.elements.append(TemplateElement(
            element_type="chart",
            position={"x": 0, "y": 2, "width": 6, "height": 4},
            config={
                "chart_type": ChartType.LINE.value,
                "title": "Revenue Trend",
                "x_field": "date",
                "y_field": "revenue"
            },
            data_source="time_series"
        ))
        
        dashboard.elements.append(TemplateElement(
            element_type="chart",
            position={"x": 6, "y": 2, "width": 6, "height": 4},
            config={
                "chart_type": ChartType.BAR.value,
                "title": "Sales by Region",
                "x_field": "region",
                "y_field": "sales"
            },
            data_source="regional_data"
        ))
        
        dashboard.elements.append(TemplateElement(
            element_type="chart",
            position={"x": 0, "y": 6, "width": 4, "height": 4},
            config={
                "chart_type": ChartType.PIE.value,
                "title": "Market Share",
                "label_field": "competitor",
                "value_field": "share"
            },
            data_source="market_data"
        ))
        
        dashboard.elements.append(TemplateElement(
            element_type="table",
            position={"x": 4, "y": 6, "width": 8, "height": 4},
            config={
                "title": "Top Products",
                "columns": ["product", "sales", "growth", "margin"],
                "sortable": True,
                "filterable": True
            },
            data_source="product_data"
        ))
        
        return dashboard
    
    def _create_sales_report_template(self) -> ReportTemplate:
        """Create sales report template.
        
        Returns:
            Report template
        """
        report = ReportTemplate(
            name="sales_report",
            title="Monthly Sales Report",
            author="Sales Analytics Team"
        )
        
        # Title section
        report.sections.append(ReportSection(
            section_type=SectionType.TITLE,
            title="Monthly Sales Report",
            metadata={"level": 1}
        ))
        
        # Executive summary
        report.sections.append(ReportSection(
            section_type=SectionType.SUMMARY,
            title="Executive Summary",
            content={
                "total_sales": "${total_sales}",
                "growth": "{growth}%",
                "top_product": "{top_product}",
                "top_region": "{top_region}"
            }
        ))
        
        # Key metrics
        report.sections.append(ReportSection(
            section_type=SectionType.METRICS,
            title="Key Performance Indicators",
            content={
                "Revenue": "${revenue}",
                "Units Sold": "{units}",
                "Average Order Value": "${aov}",
                "Customer Acquisition": "{new_customers}",
                "Conversion Rate": "{conversion}%"
            }
        ))
        
        # Charts
        report.sections.append(ReportSection(
            section_type=SectionType.CHART,
            title="Sales Trend",
            content={
                "type": "line",
                "data_source": "monthly_sales"
            }
        ))
        
        report.sections.append(ReportSection(
            section_type=SectionType.CHART,
            title="Regional Performance",
            content={
                "type": "bar",
                "data_source": "regional_sales"
            }
        ))
        
        # Table
        report.sections.append(ReportSection(
            section_type=SectionType.TABLE,
            title="Product Performance",
            content={
                "data_source": "product_sales",
                "columns": ["Product", "Units", "Revenue", "Growth"]
            }
        ))
        
        return report
    
    def _create_analytics_dashboard(self) -> DashboardTemplate:
        """Create analytics dashboard template.
        
        Returns:
            Dashboard template
        """
        dashboard = DashboardTemplate(
            name="analytics_dashboard",
            title="Analytics Dashboard",
            layout=LayoutType.TABS,
            refresh_interval=300  # 5 minutes
        )
        
        # Filters
        dashboard.filters = [
            {
                "name": "date_range",
                "type": "date_range",
                "default": "last_30_days"
            },
            {
                "name": "segment",
                "type": "dropdown",
                "options": ["All", "Enterprise", "SMB", "Consumer"],
                "default": "All"
            }
        ]
        
        # Tab 1: Overview
        dashboard.elements.append(TemplateElement(
            element_type="tab",
            position={"tab": 0},
            config={"name": "Overview", "icon": "chart-bar"},
            data_source="overview"
        ))
        
        # Tab 2: User Analytics
        dashboard.elements.append(TemplateElement(
            element_type="tab",
            position={"tab": 1},
            config={"name": "Users", "icon": "users"},
            data_source="user_analytics"
        ))
        
        # Tab 3: Performance
        dashboard.elements.append(TemplateElement(
            element_type="tab",
            position={"tab": 2},
            config={"name": "Performance", "icon": "tachometer"},
            data_source="performance"
        ))
        
        return dashboard
    
    def _create_performance_report(self) -> ReportTemplate:
        """Create performance report template.
        
        Returns:
            Report template
        """
        report = ReportTemplate(
            name="performance_report",
            title="System Performance Report",
            author="Engineering Team"
        )
        
        # Sections
        report.sections = [
            ReportSection(
                section_type=SectionType.TITLE,
                title="System Performance Report",
                metadata={"level": 1}
            ),
            ReportSection(
                section_type=SectionType.METRICS,
                title="System Metrics",
                content={
                    "Uptime": "{uptime}%",
                    "Response Time": "{response_time}ms",
                    "Error Rate": "{error_rate}%",
                    "Throughput": "{throughput} req/s"
                }
            ),
            ReportSection(
                section_type=SectionType.CHART,
                title="Response Time Trend",
                content={"type": "line", "data_source": "response_times"}
            ),
            ReportSection(
                section_type=SectionType.CHART,
                title="Error Distribution",
                content={"type": "pie", "data_source": "error_types"}
            ),
            ReportSection(
                section_type=SectionType.TABLE,
                title="Service Status",
                content={
                    "data_source": "services",
                    "columns": ["Service", "Status", "Uptime", "Latency"]
                }
            )
        ]
        
        return report
    
    def get_template(self, name: str) -> Any:
        """Get a template by name.
        
        Args:
            name: Template name
            
        Returns:
            Template object
        """
        if name not in self.templates:
            raise VisualizationError(f"Template not found: {name}")
        
        return self.templates[name]
    
    def list_templates(self) -> List[str]:
        """List available templates.
        
        Returns:
            List of template names
        """
        return list(self.templates.keys())
    
    def add_template(self, name: str, template: Any) -> None:
        """Add a custom template.
        
        Args:
            name: Template name
            template: Template object
        """
        self.templates[name] = template
        self.logger.info(f"Added template: {name}")
    
    def remove_template(self, name: str) -> None:
        """Remove a template.
        
        Args:
            name: Template name
        """
        if name in self.templates:
            del self.templates[name]
            self.logger.info(f"Removed template: {name}")
    
    def export_template(self, name: str, output_path: str) -> None:
        """Export a template to file.
        
        Args:
            name: Template name
            output_path: Output file path
        """
        if name not in self.templates:
            raise VisualizationError(f"Template not found: {name}")
        
        template = self.templates[name]
        
        # Convert to dictionary
        if hasattr(template, '__dict__'):
            template_dict = template.__dict__
        else:
            template_dict = template
        
        # Export as JSON
        with open(output_path, 'w') as f:
            json.dump(template_dict, f, indent=2, default=str)
        
        self.logger.info(f"Exported template to {output_path}")
    
    def import_template(self, input_path: str, name: Optional[str] = None) -> None:
        """Import a template from file.
        
        Args:
            input_path: Input file path
            name: Optional template name (uses file name if None)
        """
        with open(input_path, 'r') as f:
            template_data = json.load(f)
        
        if name is None:
            name = Path(input_path).stem
        
        self.templates[name] = template_data
        self.logger.info(f"Imported template: {name}")
    
    def initialize(self) -> None:
        """Initialize template library."""
        self.logger.info("Template library initialized")
    
    def cleanup(self) -> None:
        """Cleanup template library resources."""
        self.templates.clear()
    
    def validate(self) -> bool:
        """Validate template library configuration."""
        return True


# Utility functions for template creation

def create_dashboard_template(name: str, title: str,
                             layout: LayoutType = LayoutType.GRID) -> DashboardTemplate:
    """Create a basic dashboard template.
    
    Args:
        name: Template name
        title: Dashboard title
        layout: Layout type
        
    Returns:
        Dashboard template
    """
    return DashboardTemplate(
        name=name,
        title=title,
        layout=layout
    )


def create_report_from_template(template_name: str, data: Dict[str, Any]) -> str:
    """Create a report from a template with data.
    
    Args:
        template_name: Template to use
        data: Data to populate template
        
    Returns:
        Generated report HTML
    """
    library = TemplateLibrary()
    template = library.get_template(template_name)
    
    # This would populate the template with actual data
    # For now, return template as JSON
    return json.dumps(template, indent=2, default=str)