// src/visualization/templates.ts
/**
 * Template management for the visualization module.
 */

import { generateUUID, getTimestamp } from '../core/base.js';
import { VisualizationException } from '../core/exceptions.js';
import type {
  Template,
  TemplateType,
  TemplateVariable,
  ChartConfig,
  ChartType,
  ReportConfig,
  DashboardConfig,
  Theme,
  WidgetType,
  Widget,
  ReportSection,
  PageSize,
  LayoutType,
  WidgetPosition,
  WidgetSize,
  ReportFormat
} from './types.js';
import type { UUID, URL } from '../types.js';

/**
 * Base template class
 */
export abstract class BaseTemplate implements Template {
  public readonly id: UUID;
  public readonly name: string;
  public readonly type: TemplateType;
  public description?: string;
  public thumbnail?: URL;
  public config: unknown;
  public variables: TemplateVariable[] = [];
  
  constructor(name: string, type: TemplateType, config: unknown) {
    this.id = generateUUID();
    this.name = name;
    this.type = type;
    this.config = config;
  }

  public abstract render(variables?: Record<string, unknown>): unknown;

  public validateVariables(values: Record<string, unknown>): boolean {
    for (const variable of this.variables) {
      if (variable.required && !(variable.name in values)) {
        throw new VisualizationException(
          `Required variable '${variable.name}' is missing`
        );
      }

      const value = values[variable.name];
      
      if (value !== undefined && value !== null) {
        if (!this.validateVariableType(value, variable.type)) {
          throw new VisualizationException(
            `Variable '${variable.name}' must be of type ${variable.type}`
          );
        }

        if (variable.options && !variable.options.includes(value)) {
          throw new VisualizationException(
            `Variable '${variable.name}' must be one of: ${variable.options.join(', ')}`
          );
        }
      }
    }

    return true;
  }

  private validateVariableType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value as string));
      case 'select':
        return true; // Validated by options
      default:
        return true;
    }
  }

  protected applyVariables(
    template: string,
    variables: Record<string, unknown>
  ): string {
    let result = template;

    // Simple variable replacement
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(pattern, String(value));
    }

    return result;
  }

  protected processConditionals(
    template: string,
    variables: Record<string, unknown>
  ): string {
    // Process if statements
    const ifPattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{#else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
    
    return template.replace(ifPattern, (match, variable, ifContent, elseContent = '') => {
      const value = variables[variable];
      return value ? ifContent : elseContent;
    });
  }

  protected processLoops(
    template: string,
    variables: Record<string, unknown>
  ): string {
    // Process each loops
    const eachPattern = /\{\{#each\s+(\w+)\s+as\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    
    return template.replace(eachPattern, (match, arrayVar, itemVar, content) => {
      const items = variables[arrayVar];
      
      if (!Array.isArray(items)) {
        return '';
      }

      return items.map((item, index) => {
        const localVars = {
          ...variables,
          [itemVar]: item,
          [`${itemVar}_index`]: index
        };
        
        return this.applyVariables(content, localVars);
      }).join('');
    });
  }

  public toJSON(): Template {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      thumbnail: this.thumbnail,
      config: this.config,
      variables: this.variables
    };
  }
}

/**
 * Chart template
 */
export class ChartTemplate extends BaseTemplate {
  public config: ChartConfig;

  constructor(name: string, chartType: ChartType, config?: Partial<ChartConfig>) {
    const fullConfig: ChartConfig = {
      type: chartType,
      title: name,
      width: 800,
      height: 600,
      theme: Theme.DEFAULT,
      responsive: true,
      ...config
    };
    
    super(name, TemplateType.CHART, fullConfig);
    this.config = fullConfig;

    // Define variables
    this.variables = [
      {
        name: 'title',
        type: 'string',
        label: 'Chart Title',
        defaultValue: name
      },
      {
        name: 'data',
        type: 'select',
        label: 'Data Source',
        description: 'Select the data to visualize',
        required: true
      },
      {
        name: 'theme',
        type: 'select',
        label: 'Theme',
        options: Object.values(Theme),
        defaultValue: Theme.DEFAULT
      },
      {
        name: 'width',
        type: 'number',
        label: 'Width',
        defaultValue: 800
      },
      {
        name: 'height',
        type: 'number',
        label: 'Height',
        defaultValue: 600
      }
    ];
  }

  public render(variables?: Record<string, unknown>): ChartConfig {
    const vars = { ...this.getDefaults(), ...variables };
    this.validateVariables(vars);

    return {
      ...this.config,
      title: vars.title as string,
      width: vars.width as number,
      height: vars.height as number,
      theme: vars.theme as Theme
    };
  }

  private getDefaults(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    
    for (const variable of this.variables) {
      if (variable.defaultValue !== undefined) {
        defaults[variable.name] = variable.defaultValue;
      }
    }
    
    return defaults;
  }
}

/**
 * Report template
 */
export class ReportTemplate extends BaseTemplate {
  public config: ReportTemplateConfig;

  constructor(name: string, config: ReportTemplateConfig) {
    super(name, TemplateType.REPORT, config);
    this.config = config;

    // Define standard report variables
    this.variables = [
      {
        name: 'title',
        type: 'string',
        label: 'Report Title',
        required: true
      },
      {
        name: 'author',
        type: 'string',
        label: 'Author',
        required: true
      },
      {
        name: 'date',
        type: 'date',
        label: 'Report Date',
        defaultValue: new Date()
      },
      {
        name: 'data',
        type: 'select',
        label: 'Data Source',
        required: true
      },
      ...config.customVariables || []
    ];
  }

  public render(variables?: Record<string, unknown>): RenderedReport {
    const vars = { ...this.getDefaults(), ...variables };
    this.validateVariables(vars);

    const reportConfig: ReportConfig = {
      title: vars.title as string,
      author: vars.author as string,
      date: vars.date as Date,
      version: this.config.version,
      description: this.applyVariables(this.config.description || '', vars),
      theme: this.config.theme,
      format: this.config.format,
      pageSize: this.config.pageSize,
      orientation: this.config.orientation,
      margins: this.config.margins
    };

    const sections: ReportSection[] = this.config.sections.map(sectionTemplate => 
      this.renderSection(sectionTemplate, vars)
    );

    return {
      config: reportConfig,
      sections
    };
  }

  private renderSection(
    template: SectionTemplate,
    variables: Record<string, unknown>
  ): ReportSection {
    let content = template.content || '';
    
    // Apply variables
    content = this.applyVariables(content, variables);
    
    // Process conditionals
    content = this.processConditionals(content, variables);
    
    // Process loops
    content = this.processLoops(content, variables);

    return {
      id: generateUUID(),
      title: this.applyVariables(template.title, variables),
      level: template.level,
      content,
      pageBreak: template.pageBreak
    };
  }

  private getDefaults(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    
    for (const variable of this.variables) {
      if (variable.defaultValue !== undefined) {
        defaults[variable.name] = variable.defaultValue;
      }
    }
    
    return defaults;
  }
}

/**
 * Dashboard template
 */
export class DashboardTemplate extends BaseTemplate {
  public config: DashboardTemplateConfig;

  constructor(name: string, config: DashboardTemplateConfig) {
    super(name, TemplateType.DASHBOARD, config);
    this.config = config;

    // Define dashboard variables
    this.variables = [
      {
        name: 'title',
        type: 'string',
        label: 'Dashboard Title',
        required: true
      },
      {
        name: 'refreshInterval',
        type: 'number',
        label: 'Refresh Interval (ms)',
        defaultValue: 30000
      },
      {
        name: 'theme',
        type: 'select',
        label: 'Theme',
        options: Object.values(Theme),
        defaultValue: Theme.DEFAULT
      },
      ...config.customVariables || []
    ];
  }

  public render(variables?: Record<string, unknown>): RenderedDashboard {
    const vars = { ...this.getDefaults(), ...variables };
    this.validateVariables(vars);

    const dashboardConfig: DashboardConfig = {
      title: vars.title as string,
      refreshInterval: vars.refreshInterval as number,
      layout: this.config.layout,
      theme: vars.theme as Theme,
      responsive: true
    };

    const widgets: Widget[] = this.config.widgets.map(widgetTemplate => 
      this.renderWidget(widgetTemplate, vars)
    );

    return {
      config: dashboardConfig,
      widgets
    };
  }

  private renderWidget(
    template: WidgetTemplate,
    variables: Record<string, unknown>
  ): Widget {
    return {
      id: generateUUID(),
      type: template.type,
      title: this.applyVariables(template.title || '', variables),
      position: template.position,
      size: template.size,
      config: this.processWidgetConfig(template.config, variables),
      refreshInterval: template.refreshInterval
    };
  }

  private processWidgetConfig(
    config: any,
    variables: Record<string, unknown>
  ): any {
    if (typeof config === 'string') {
      return this.applyVariables(config, variables);
    }
    
    if (Array.isArray(config)) {
      return config.map(item => this.processWidgetConfig(item, variables));
    }
    
    if (typeof config === 'object' && config !== null) {
      const processed: any = {};
      
      for (const [key, value] of Object.entries(config)) {
        processed[key] = this.processWidgetConfig(value, variables);
      }
      
      return processed;
    }
    
    return config;
  }

  private getDefaults(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    
    for (const variable of this.variables) {
      if (variable.defaultValue !== undefined) {
        defaults[variable.name] = variable.defaultValue;
      }
    }
    
    return defaults;
  }
}

/**
 * Template library with pre-built templates
 */
export class TemplateLibrary {
  private static templates: Map<string, Template> = new Map();

  static {
    this.initializeDefaultTemplates();
  }

  private static initializeDefaultTemplates(): void {
    // Line chart template
    this.register(new ChartTemplate('Line Chart', ChartType.LINE, {
      axes: {
        x: { label: 'X Axis', type: 'linear' },
        y: { label: 'Y Axis', type: 'linear' }
      },
      legend: { show: true, position: 'top' }
    }));

    // Bar chart template
    this.register(new ChartTemplate('Bar Chart', ChartType.BAR, {
      axes: {
        x: { label: 'Categories', type: 'category' },
        y: { label: 'Values', type: 'linear' }
      }
    }));

    // Pie chart template
    this.register(new ChartTemplate('Pie Chart', ChartType.PIE, {
      legend: { show: true, position: 'right' }
    }));

    // Sales report template
    this.register(new ReportTemplate('Sales Report', {
      version: '1.0.0',
      description: 'Monthly sales performance report',
      theme: Theme.DEFAULT,
      format: ReportFormat.PDF,
      pageSize: PageSize.A4,
      orientation: 'portrait',
      sections: [
        {
          title: 'Executive Summary',
          level: 1,
          content: 'Sales for {{month}} {{year}}: ${{totalSales}}',
          pageBreak: true
        },
        {
          title: 'Sales by Region',
          level: 1,
          content: '{{#each regions as region}}Region {{region.name}}: ${{region.sales}}\n{{/each}}'
        },
        {
          title: 'Top Products',
          level: 1,
          content: '{{#each products as product}}{{product.name}}: {{product.units}} units\n{{/each}}'
        }
      ],
      customVariables: [
        {
          name: 'month',
          type: 'string',
          label: 'Report Month',
          required: true
        },
        {
          name: 'year',
          type: 'number',
          label: 'Report Year',
          required: true
        },
        {
          name: 'totalSales',
          type: 'number',
          label: 'Total Sales',
          required: true
        }
      ]
    }));

    // Analytics dashboard template
    this.register(new DashboardTemplate('Analytics Dashboard', {
      layout: LayoutType.GRID,
      widgets: [
        {
          type: WidgetType.METRIC,
          title: 'Total Users',
          position: { x: 0, y: 0 },
          size: { width: 200, height: 100 },
          config: { metric: '{{totalUsers}}' }
        },
        {
          type: WidgetType.METRIC,
          title: 'Active Sessions',
          position: { x: 200, y: 0 },
          size: { width: 200, height: 100 },
          config: { metric: '{{activeSessions}}' }
        },
        {
          type: WidgetType.CHART,
          title: 'Traffic Over Time',
          position: { x: 0, y: 100 },
          size: { width: 400, height: 300 },
          config: {
            type: ChartType.LINE,
            dataSource: 'traffic'
          }
        },
        {
          type: WidgetType.TABLE,
          title: 'Top Pages',
          position: { x: 400, y: 0 },
          size: { width: 400, height: 400 },
          config: {
            dataSource: 'pages'
          }
        }
      ],
      customVariables: [
        {
          name: 'totalUsers',
          type: 'number',
          label: 'Total Users',
          required: true
        },
        {
          name: 'activeSessions',
          type: 'number',
          label: 'Active Sessions',
          required: true
        }
      ]
    }));
  }

  public static register(template: Template): void {
    this.templates.set(template.name, template);
  }

  public static get(name: string): Template | undefined {
    return this.templates.get(name);
  }

  public static list(type?: TemplateType): Template[] {
    const templates = Array.from(this.templates.values());
    
    if (type) {
      return templates.filter(t => t.type === type);
    }
    
    return templates;
  }

  public static remove(name: string): boolean {
    return this.templates.delete(name);
  }

  public static createFromJSON(json: string): Template {
    const data = JSON.parse(json);
    
    switch (data.type) {
      case TemplateType.CHART:
        return new ChartTemplate(data.name, data.config.type, data.config);
      
      case TemplateType.REPORT:
        return new ReportTemplate(data.name, data.config);
      
      case TemplateType.DASHBOARD:
        return new DashboardTemplate(data.name, data.config);
      
      default:
        throw new VisualizationException(`Unknown template type: ${data.type}`);
    }
  }

  public static exportTemplate(name: string): string | null {
    const template = this.templates.get(name);
    
    if (!template) {
      return null;
    }
    
    return JSON.stringify(template.toJSON(), null, 2);
  }

  public static importTemplate(json: string): void {
    const template = this.createFromJSON(json);
    this.register(template);
  }
}

// Internal interfaces
interface ReportTemplateConfig extends ReportConfig {
  sections: SectionTemplate[];
  customVariables?: TemplateVariable[];
}

interface SectionTemplate {
  title: string;
  level: number;
  content?: string;
  pageBreak?: boolean;
}

interface DashboardTemplateConfig {
  layout: LayoutType;
  widgets: WidgetTemplate[];
  customVariables?: TemplateVariable[];
}

interface WidgetTemplate {
  type: WidgetType;
  title?: string;
  position?: WidgetPosition;
  size?: WidgetSize;
  config?: any;
  refreshInterval?: number;
}

interface RenderedReport {
  config: ReportConfig;
  sections: ReportSection[];
}

interface RenderedDashboard {
  config: DashboardConfig;
  widgets: Widget[];
}

/**
 * Template factory
 */
export class TemplateFactory {
  public static createChartTemplate(
    name: string,
    type: ChartType,
    config?: Partial<ChartConfig>
  ): ChartTemplate {
    return new ChartTemplate(name, type, config);
  }

  public static createReportTemplate(
    name: string,
    config: ReportTemplateConfig
  ): ReportTemplate {
    return new ReportTemplate(name, config);
  }

  public static createDashboardTemplate(
    name: string,
    config: DashboardTemplateConfig
  ): DashboardTemplate {
    return new DashboardTemplate(name, config);
  }

  public static cloneTemplate(template: Template, newName: string): Template {
    const json = JSON.stringify(template.toJSON());
    const cloned = TemplateLibrary.createFromJSON(json);
    
    // Update name and ID
    (cloned as any).name = newName;
    (cloned as any).id = generateUUID();
    
    return cloned;
  }
}

/**
 * Template renderer for complex visualizations
 */
export class TemplateRenderer {
  private variables: Map<string, any> = new Map();
  private templates: Map<string, Template> = new Map();

  public setVariable(name: string, value: any): void {
    this.variables.set(name, value);
  }

  public setVariables(variables: Record<string, any>): void {
    Object.entries(variables).forEach(([key, value]) => {
      this.variables.set(key, value);
    });
  }

  public addTemplate(template: Template): void {
    this.templates.set(template.name, template);
  }

  public render(templateName: string, overrides?: Record<string, any>): any {
    const template = this.templates.get(templateName) || TemplateLibrary.get(templateName);
    
    if (!template) {
      throw new VisualizationException(`Template '${templateName}' not found`);
    }

    const variables = {
      ...Object.fromEntries(this.variables),
      ...overrides
    };

    return template.render(variables);
  }

  public renderAll(overrides?: Record<string, any>): Map<string, any> {
    const results = new Map<string, any>();
    
    for (const [name, template] of this.templates) {
      try {
        const result = this.render(name, overrides);
        results.set(name, result);
      } catch (error) {
        console.error(`Failed to render template '${name}':`, error);
      }
    }
    
    return results;
  }

  public clear(): void {
    this.variables.clear();
    this.templates.clear();
  }
}

/**
 * Pre-built template configurations
 */
export const PrebuiltTemplates = {
  // Chart templates
  SALES_TREND_LINE: new ChartTemplate('Sales Trend', ChartType.LINE, {
    title: 'Monthly Sales Trend',
    axes: {
      x: { label: 'Month', type: 'category' },
      y: { label: 'Revenue ($)', type: 'linear' }
    },
    animation: { enabled: true, duration: 1000 }
  }),

  CATEGORY_DISTRIBUTION: new ChartTemplate('Category Distribution', ChartType.PIE, {
    title: 'Distribution by Category',
    legend: { show: true, position: 'right' }
  }),

  PERFORMANCE_COMPARISON: new ChartTemplate('Performance Comparison', ChartType.BAR, {
    title: 'Performance Metrics',
    axes: {
      x: { label: 'Metrics', type: 'category' },
      y: { label: 'Values', type: 'linear' }
    }
  }),

  // Report templates
  EXECUTIVE_SUMMARY: {
    title: 'Executive Summary',
    level: 1,
    content: `
## Key Highlights
{{#each highlights as item}}
- {{item}}
{{/each}}

## Performance Summary
Total Revenue: ${{revenue}}
Growth Rate: {{growthRate}}%
Customer Satisfaction: {{satisfaction}}/5

## Recommendations
{{recommendations}}
    `,
    pageBreak: true
  },

  DATA_ANALYSIS_SECTION: {
    title: 'Data Analysis',
    level: 1,
    content: `
### Statistical Overview
- Sample Size: {{sampleSize}}
- Mean: {{mean}}
- Median: {{median}}
- Standard Deviation: {{stdDev}}

### Key Findings
{{#each findings as finding}}
{{finding.number}}. {{finding.description}}
   - Impact: {{finding.impact}}
   - Confidence: {{finding.confidence}}%
{{/each}}
    `
  },

  // Dashboard widgets
  KPI_WIDGET: {
    type: WidgetType.METRIC,
    size: { width: 200, height: 100 },
    config: {
      value: '{{value}}',
      unit: '{{unit}}',
      trend: '{{trend}}',
      comparison: '{{comparison}}'
    }
  },

  ACTIVITY_FEED: {
    type: WidgetType.TABLE,
    size: { width: 400, height: 300 },
    config: {
      columns: ['Time', 'User', 'Action', 'Status'],
      dataSource: 'activities',
      sortBy: 'Time',
      sortOrder: 'desc'
    }
  }
};