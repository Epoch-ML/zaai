// src/visualization/reports.ts
/**
 * Report generation for the visualization module.
 */

import { generateUUID, getTimestamp } from '../core/base.js';
import { VisualizationException } from '../core/exceptions.js';
import { ChartFactory } from './charts.js';
import { ExporterFactory } from './exporters.js';
import type {
  IReportBuilder,
  Report,
  ReportConfig,
  ReportSection,
  ReportFormat,
  Table,
  TableStyles,
  IChart,
  ChartType,
  ChartConfig,
  ChartData,
  PageSize,
  Margins,
  HeaderFooterConfig,
  ExportFormat
} from './types.js';
import type { UUID, DataRecord } from '../types.js';

/**
 * Report builder implementation
 */
export class ReportBuilder implements IReportBuilder {
  private report: Report;
  private currentSection?: ReportSection;
  private sectionStack: ReportSection[] = [];

  constructor(config: ReportConfig) {
    this.report = {
      id: generateUUID(),
      config: this.mergeWithDefaults(config),
      sections: [],
      metadata: {
        createdAt: getTimestamp(),
        version: config.version || '1.0.0'
      }
    };
  }

  private mergeWithDefaults(config: ReportConfig): ReportConfig {
    return {
      pageSize: PageSize.A4,
      orientation: 'portrait',
      margins: {
        top: 25,
        bottom: 25,
        left: 25,
        right: 25
      },
      format: ReportFormat.PDF,
      ...config,
      date: config.date || new Date()
    };
  }

  public addSection(title: string, content?: string): ReportSection {
    const section: ReportSection = {
      id: generateUUID(),
      title,
      level: this.sectionStack.length + 1,
      content,
      charts: [],
      tables: [],
      subsections: []
    };

    if (this.currentSection) {
      // Add as subsection
      this.currentSection.subsections = this.currentSection.subsections || [];
      this.currentSection.subsections.push(section);
    } else {
      // Add as top-level section
      this.report.sections.push(section);
    }

    return section;
  }

  public enterSection(section: ReportSection): void {
    if (this.currentSection) {
      this.sectionStack.push(this.currentSection);
    }
    this.currentSection = section;
  }

  public exitSection(): void {
    if (this.sectionStack.length > 0) {
      this.currentSection = this.sectionStack.pop();
    } else {
      this.currentSection = undefined;
    }
  }

  public addChart(chart: IChart, section?: ReportSection): void {
    const targetSection = section || this.currentSection || this.getLastSection();
    
    if (!targetSection) {
      throw new VisualizationException('No section available to add chart');
    }

    targetSection.charts = targetSection.charts || [];
    targetSection.charts.push(chart);
  }

  public addTable(table: Table, section?: ReportSection): void {
    const targetSection = section || this.currentSection || this.getLastSection();
    
    if (!targetSection) {
      throw new VisualizationException('No section available to add table');
    }

    targetSection.tables = targetSection.tables || [];
    targetSection.tables.push(table);
  }

  public addPageBreak(section?: ReportSection): void {
    const targetSection = section || this.currentSection || this.getLastSection();
    
    if (targetSection) {
      targetSection.pageBreak = true;
    }
  }

  private getLastSection(): ReportSection | undefined {
    if (this.report.sections.length > 0) {
      return this.report.sections[this.report.sections.length - 1];
    }
    return undefined;
  }

  public async build(): Promise<Report> {
    // Validate report structure
    if (this.report.sections.length === 0) {
      throw new VisualizationException('Report must have at least one section');
    }

    // Generate table of contents if needed
    if (this.report.config.format === ReportFormat.PDF || 
        this.report.config.format === ReportFormat.HTML) {
      this.generateTableOfContents();
    }

    return this.report;
  }

  private generateTableOfContents(): void {
    const tocSection: ReportSection = {
      id: generateUUID(),
      title: 'Table of Contents',
      level: 1,
      content: this.buildTableOfContentsContent(),
      pageBreak: true
    };

    // Insert TOC as first section
    this.report.sections.unshift(tocSection);
  }

  private buildTableOfContentsContent(): string {
    let toc = '';
    let pageNumber = 2; // Start after TOC page

    const addToToc = (sections: ReportSection[], indent = 0) => {
      sections.forEach(section => {
        const indentation = '  '.repeat(indent);
        toc += `${indentation}${section.title} ... ${pageNumber}\n`;
        pageNumber++;

        if (section.subsections && section.subsections.length > 0) {
          addToToc(section.subsections, indent + 1);
        }
      });
    };

    addToToc(this.report.sections.slice(1)); // Skip TOC itself
    return toc;
  }

  public async export(format: ReportFormat): Promise<Uint8Array | string> {
    const report = await this.build();
    
    // Map ReportFormat to ExportFormat
    const exportFormat = this.mapReportFormatToExportFormat(format);
    
    return ExporterFactory.export(report, exportFormat, {
      format: exportFormat,
      metadata: {
        title: report.config.title,
        author: report.config.author,
        date: report.config.date
      }
    });
  }

  private mapReportFormatToExportFormat(format: ReportFormat): ExportFormat {
    const mapping: Record<ReportFormat, ExportFormat> = {
      [ReportFormat.PDF]: ExportFormat.PDF,
      [ReportFormat.HTML]: ExportFormat.HTML,
      [ReportFormat.MARKDOWN]: ExportFormat.MARKDOWN,
      [ReportFormat.DOCX]: ExportFormat.HTML, // Convert to HTML first
      [ReportFormat.XLSX]: ExportFormat.EXCEL,
      [ReportFormat.PPTX]: ExportFormat.HTML // Convert to HTML first
    };

    return mapping[format] || ExportFormat.HTML;
  }
}

/**
 * Advanced report builder with data analysis
 */
export class AnalyticsReportBuilder extends ReportBuilder {
  private data: DataRecord[] = [];
  private metrics: Map<string, any> = new Map();

  constructor(config: ReportConfig, data?: DataRecord[]) {
    super(config);
    if (data) {
      this.setData(data);
    }
  }

  public setData(data: DataRecord[]): void {
    this.data = data;
    this.calculateMetrics();
  }

  private calculateMetrics(): void {
    if (this.data.length === 0) return;

    // Calculate basic metrics
    this.metrics.set('recordCount', this.data.length);
    
    // Calculate field statistics
    const fields = Object.keys(this.data[0]!);
    fields.forEach(field => {
      const values = this.data.map(record => record[field]);
      const numericValues = values
        .filter(v => typeof v === 'number')
        .map(v => v as number);

      if (numericValues.length > 0) {
        this.metrics.set(`${field}_min`, Math.min(...numericValues));
        this.metrics.set(`${field}_max`, Math.max(...numericValues));
        this.metrics.set(`${field}_avg`, 
          numericValues.reduce((a, b) => a + b, 0) / numericValues.length
        );
      }
    });
  }

  public addSummarySection(): ReportSection {
    const section = this.addSection('Executive Summary');
    
    let summary = `This report contains analysis of ${this.metrics.get('recordCount')} records.\n\n`;
    summary += 'Key Metrics:\n';
    
    for (const [key, value] of this.metrics) {
      if (!key.includes('_')) {
        summary += `- ${key}: ${value}\n`;
      }
    }

    section.content = summary;
    return section;
  }

  public addDataTable(
    title: string,
    data?: DataRecord[],
    options?: {
      maxRows?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): void {
    const tableData = data || this.data;
    
    if (tableData.length === 0) {
      return;
    }

    let processedData = [...tableData];
    
    // Sort data
    if (options?.sortBy && options.sortBy in processedData[0]!) {
      processedData.sort((a, b) => {
        const aVal = a[options.sortBy!];
        const bVal = b[options.sortBy!];
        
        if (aVal < bVal) return options.sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return options.sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Limit rows
    if (options?.maxRows) {
      processedData = processedData.slice(0, options.maxRows);
    }

    // Create table
    const headers = Object.keys(processedData[0]!);
    const rows = processedData.map(record => 
      headers.map(header => record[header])
    );

    const table: Table = {
      caption: title,
      headers,
      rows,
      styles: {
        headerBackground: '#f0f0f0',
        headerColor: '#333',
        borderColor: '#ddd',
        striped: true,
        bordered: true
      }
    };

    this.addTable(table);
  }

  public async addVisualizationSection(
    title: string,
    chartType: ChartType,
    data?: ChartData,
    config?: Partial<ChartConfig>
  ): Promise<void> {
    const section = this.addSection(title);
    
    const chart = ChartFactory.create(chartType, {
      title,
      ...config,
      type: chartType
    });

    if (data) {
      chart.update(data);
    } else {
      // Generate data from this.data
      const generatedData = this.generateChartData(chartType);
      chart.update(generatedData);
    }

    this.addChart(chart, section);
  }

  private generateChartData(type: ChartType): ChartData {
    if (this.data.length === 0) {
      return { datasets: [] };
    }

    const fields = Object.keys(this.data[0]!);
    const numericFields = fields.filter(field => 
      typeof this.data[0]![field] === 'number'
    );

    switch (type) {
      case ChartType.BAR:
      case ChartType.LINE:
        return {
          labels: this.data.slice(0, 10).map((_, i) => `Item ${i + 1}`),
          datasets: numericFields.slice(0, 3).map(field => ({
            label: field,
            data: this.data.slice(0, 10).map(record => record[field] as number)
          }))
        };

      case ChartType.PIE:
        const field = numericFields[0];
        return {
          labels: this.data.slice(0, 5).map((_, i) => `Category ${i + 1}`),
          datasets: [{
            data: this.data.slice(0, 5).map(record => record[field!] as number)
          }]
        };

      case ChartType.SCATTER:
        const xField = numericFields[0];
        const yField = numericFields[1] || numericFields[0];
        return {
          datasets: [{
            label: `${xField} vs ${yField}`,
            data: this.data.slice(0, 50).map(record => ({
              x: record[xField!] as number,
              y: record[yField!] as number
            }))
          }]
        };

      default:
        return { datasets: [] };
    }
  }

  public addComparisonSection(
    title: string,
    groups: { name: string; data: DataRecord[] }[]
  ): void {
    const section = this.addSection(title);
    
    // Create comparison table
    const headers = ['Metric', ...groups.map(g => g.name)];
    const rows: any[][] = [];
    
    // Compare record counts
    rows.push(['Record Count', ...groups.map(g => g.data.length)]);
    
    // Compare numeric fields
    if (groups[0]?.data[0]) {
      const fields = Object.keys(groups[0].data[0]);
      const numericFields = fields.filter(field => 
        typeof groups[0]!.data[0]![field] === 'number'
      );
      
      numericFields.forEach(field => {
        const avgValues = groups.map(group => {
          const values = group.data
            .map(record => record[field] as number)
            .filter(v => !isNaN(v));
          
          return values.length > 0
            ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
            : 'N/A';
        });
        
        rows.push([`${field} (avg)`, ...avgValues]);
      });
    }

    const table: Table = {
      caption: 'Comparison Table',
      headers,
      rows
    };

    this.addTable(table, section);
  }
}

/**
 * Template-based report generator
 */
export class TemplateReportBuilder extends ReportBuilder {
  private template: ReportTemplate;
  private variables: Map<string, any> = new Map();

  constructor(template: ReportTemplate, variables?: Record<string, any>) {
    super(template.config);
    this.template = template;
    
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        this.variables.set(key, value);
      });
    }
  }

  public setVariable(name: string, value: any): void {
    this.variables.set(name, value);
  }

  public async build(): Promise<Report> {
    // Apply template sections
    for (const templateSection of this.template.sections) {
      const section = this.addSection(
        this.processTemplate(templateSection.title),
        this.processTemplate(templateSection.content)
      );

      // Add charts from template
      if (templateSection.chartTemplates) {
        for (const chartTemplate of templateSection.chartTemplates) {
          const chart = await this.createChartFromTemplate(chartTemplate);
          this.addChart(chart, section);
        }
      }

      // Add tables from template
      if (templateSection.tableTemplates) {
        for (const tableTemplate of templateSection.tableTemplates) {
          const table = this.createTableFromTemplate(tableTemplate);
          this.addTable(table, section);
        }
      }
    }

    return super.build();
  }

  private processTemplate(template?: string): string | undefined {
    if (!template) return undefined;

    let processed = template;
    
    // Replace variables
    for (const [name, value] of this.variables) {
      const pattern = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');
      processed = processed.replace(pattern, String(value));
    }

    // Process conditionals
    processed = this.processConditionals(processed);

    // Process loops
    processed = this.processLoops(processed);

    return processed;
  }

  private processConditionals(template: string): string {
    const conditionalPattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    return template.replace(conditionalPattern, (match, variable, content) => {
      const value = this.variables.get(variable);
      return value ? content : '';
    });
  }

  private processLoops(template: string): string {
    const loopPattern = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    
    return template.replace(loopPattern, (match, variable, content) => {
      const items = this.variables.get(variable);
      
      if (!Array.isArray(items)) {
        return '';
      }

      return items.map((item, index) => {
        let processed = content;
        
        // Replace item variables
        processed = processed.replace(/\{\{this\}\}/g, String(item));
        processed = processed.replace(/\{\{@index\}\}/g, String(index));
        
        // Replace item properties
        if (typeof item === 'object' && item !== null) {
          Object.entries(item).forEach(([key, value]) => {
            const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            processed = processed.replace(pattern, String(value));
          });
        }
        
        return processed;
      }).join('');
    });
  }

  private async createChartFromTemplate(template: ChartTemplate): Promise<IChart> {
    const config: ChartConfig = {
      ...template.config,
      title: this.processTemplate(template.config.title)
    };

    const chart = ChartFactory.create(template.type, config);
    
    if (template.dataVariable) {
      const data = this.variables.get(template.dataVariable);
      if (data) {
        chart.update(data);
      }
    }

    return chart;
  }

  private createTableFromTemplate(template: TableTemplate): Table {
    const table: Table = {
      caption: this.processTemplate(template.caption),
      headers: template.headers?.map(h => this.processTemplate(h) || ''),
      rows: []
    };

    if (template.dataVariable) {
      const data = this.variables.get(template.dataVariable);
      
      if (Array.isArray(data)) {
        table.rows = data.map(row => {
          if (Array.isArray(row)) {
            return row;
          }
          
          if (typeof row === 'object' && row !== null) {
            return Object.values(row);
          }
          
          return [row];
        });
      }
    }

    return table;
  }
}

// Template interfaces
interface ReportTemplate {
  config: ReportConfig;
  sections: TemplateSectionConfig[];
}

interface TemplateSectionConfig {
  title: string;
  content?: string;
  chartTemplates?: ChartTemplate[];
  tableTemplates?: TableTemplate[];
}

interface ChartTemplate {
  type: ChartType;
  config: ChartConfig;
  dataVariable?: string;
}

interface TableTemplate {
  caption?: string;
  headers?: string[];
  dataVariable?: string;
}

/**
 * Report factory
 */
export class ReportFactory {
  private static templates: Map<string, ReportTemplate> = new Map();

  public static createBuilder(config: ReportConfig): IReportBuilder {
    return new ReportBuilder(config);
  }

  public static createAnalyticsBuilder(
    config: ReportConfig,
    data?: DataRecord[]
  ): AnalyticsReportBuilder {
    return new AnalyticsReportBuilder(config, data);
  }

  public static createFromTemplate(
    templateName: string,
    variables?: Record<string, any>
  ): TemplateReportBuilder | null {
    const template = this.templates.get(templateName);
    
    if (!template) {
      return null;
    }

    return new TemplateReportBuilder(template, variables);
  }

  public static registerTemplate(name: string, template: ReportTemplate): void {
    this.templates.set(name, template);
  }

  public static async generateQuickReport(
    title: string,
    data: DataRecord[],
    format: ReportFormat = ReportFormat.PDF
  ): Promise<Report> {
    const builder = new AnalyticsReportBuilder({
      title,
      author: 'System',
      date: new Date(),
      format
    }, data);

    // Add standard sections
    builder.addSummarySection();
    
    // Add data table
    const dataSection = builder.addSection('Data Overview');
    builder.enterSection(dataSection);
    builder.addDataTable('Sample Data', undefined, { maxRows: 20 });
    builder.exitSection();

    // Add visualizations
    await builder.addVisualizationSection('Data Distribution', ChartType.BAR);
    await builder.addVisualizationSection('Trends', ChartType.LINE);

    return builder.build();
  }
}