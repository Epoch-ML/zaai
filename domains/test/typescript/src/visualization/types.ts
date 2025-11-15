// src/visualization/types.ts
/**
 * Type definitions for the visualization module.
 */

import type {
  UUID,
  Timestamp,
  DataRecord,
  Nullable,
  URL,
  FilePath
} from '../types.js';
import type { Status } from '../core/types.js';

// Chart types
export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  PIE = 'pie',
  SCATTER = 'scatter',
  AREA = 'area',
  HISTOGRAM = 'histogram',
  HEATMAP = 'heatmap',
  BOX = 'box',
  RADAR = 'radar',
  TREEMAP = 'treemap',
  SANKEY = 'sankey',
  GAUGE = 'gauge',
  BUBBLE = 'bubble',
  CANDLESTICK = 'candlestick'
}

// Export formats
export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
  PNG = 'png',
  SVG = 'svg',
  HTML = 'html',
  MARKDOWN = 'markdown'
}

// Theme types
export enum Theme {
  DEFAULT = 'default',
  DARK = 'dark',
  LIGHT = 'light',
  COLORFUL = 'colorful',
  MONOCHROME = 'monochrome',
  CUSTOM = 'custom'
}

// Chart configuration
export interface ChartConfig {
  type: ChartType;
  title?: string;
  subtitle?: string;
  width?: number;
  height?: number;
  theme?: Theme;
  colors?: string[];
  legend?: LegendConfig;
  axes?: AxesConfig;
  tooltip?: TooltipConfig;
  animation?: AnimationConfig;
  responsive?: boolean;
  [key: string]: unknown;
}

// Legend configuration
export interface LegendConfig {
  show?: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  orientation?: 'horizontal' | 'vertical';
}

// Axes configuration
export interface AxesConfig {
  x?: AxisConfig;
  y?: AxisConfig;
  z?: AxisConfig;
}

export interface AxisConfig {
  show?: boolean;
  label?: string;
  type?: 'linear' | 'logarithmic' | 'category' | 'time';
  min?: number;
  max?: number;
  tickFormat?: string;
  gridLines?: boolean;
}

// Tooltip configuration
export interface TooltipConfig {
  show?: boolean;
  format?: string;
  shared?: boolean;
  followCursor?: boolean;
}

// Animation configuration
export interface AnimationConfig {
  enabled?: boolean;
  duration?: number;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  delay?: number;
}

// Chart data
export interface ChartData {
  labels?: string[];
  datasets: Dataset[];
  categories?: string[];
}

export interface Dataset {
  label?: string;
  data: DataPoint[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
  [key: string]: unknown;
}

export type DataPoint = number | { x: number; y: number } | { [key: string]: unknown };

// Chart interface
export interface IChart {
  readonly id: UUID;
  readonly type: ChartType;
  readonly config: ChartConfig;
  
  render(): Promise<RenderResult>;
  update(data: ChartData): void;
  resize(width: number, height: number): void;
  export(format: ExportFormat): Promise<Uint8Array | string>;
  destroy(): void;
}

// Render result
export interface RenderResult {
  html?: string;
  svg?: string;
  canvas?: HTMLCanvasElement;
  config?: unknown;
}

// Report types
export interface ReportConfig {
  title: string;
  author?: string;
  date?: Date;
  version?: string;
  description?: string;
  theme?: Theme;
  format?: ReportFormat;
  pageSize?: PageSize;
  orientation?: 'portrait' | 'landscape';
  margins?: Margins;
  header?: HeaderFooterConfig;
  footer?: HeaderFooterConfig;
}

export enum ReportFormat {
  PDF = 'pdf',
  HTML = 'html',
  MARKDOWN = 'markdown',
  DOCX = 'docx',
  XLSX = 'xlsx',
  PPTX = 'pptx'
}

export enum PageSize {
  A4 = 'A4',
  A3 = 'A3',
  LETTER = 'Letter',
  LEGAL = 'Legal',
  TABLOID = 'Tabloid'
}

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface HeaderFooterConfig {
  height?: number;
  content?: string;
  fontSize?: number;
  alignment?: 'left' | 'center' | 'right';
}

// Report section
export interface ReportSection {
  id: UUID;
  title: string;
  level: number;
  content?: string;
  charts?: IChart[];
  tables?: Table[];
  subsections?: ReportSection[];
  pageBreak?: boolean;
}

// Table
export interface Table {
  headers?: string[];
  rows: (string | number | boolean | null)[][];
  caption?: string;
  styles?: TableStyles;
}

export interface TableStyles {
  headerBackground?: string;
  headerColor?: string;
  borderColor?: string;
  striped?: boolean;
  bordered?: boolean;
  hover?: boolean;
}

// Dashboard types
export interface DashboardConfig {
  title: string;
  refreshInterval?: number;
  layout?: LayoutType;
  theme?: Theme;
  widgets?: Widget[];
  filters?: Filter[];
  responsive?: boolean;
}

export enum LayoutType {
  GRID = 'grid',
  FLEX = 'flex',
  MASONRY = 'masonry',
  DASHBOARD = 'dashboard'
}

export interface Widget {
  id: UUID;
  type: WidgetType;
  title?: string;
  position?: WidgetPosition;
  size?: WidgetSize;
  config?: unknown;
  dataSource?: DataSource;
  refreshInterval?: number;
}

export enum WidgetType {
  CHART = 'chart',
  TABLE = 'table',
  METRIC = 'metric',
  TEXT = 'text',
  IMAGE = 'image',
  MAP = 'map',
  GAUGE = 'gauge',
  TIMELINE = 'timeline'
}

export interface WidgetPosition {
  x: number;
  y: number;
  z?: number;
}

export interface WidgetSize {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface DataSource {
  type: 'static' | 'api' | 'database' | 'file';
  url?: URL;
  query?: string;
  refresh?: number;
  transform?: (data: unknown) => unknown;
}

export interface Filter {
  field: string;
  type: 'text' | 'select' | 'range' | 'date';
  label?: string;
  options?: FilterOption[];
  defaultValue?: unknown;
}

export interface FilterOption {
  label: string;
  value: unknown;
}

// Template types
export interface Template {
  id: UUID;
  name: string;
  type: TemplateType;
  description?: string;
  thumbnail?: URL;
  config: unknown;
  variables?: TemplateVariable[];
}

export enum TemplateType {
  REPORT = 'report',
  DASHBOARD = 'dashboard',
  CHART = 'chart',
  PRESENTATION = 'presentation'
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'select';
  label?: string;
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  options?: unknown[];
}

// Export options
export interface ExportOptions {
  format: ExportFormat;
  quality?: number;
  scale?: number;
  filename?: string;
  encoding?: BufferEncoding;
  compression?: boolean;
  metadata?: Record<string, unknown>;
}

// Metric card
export interface MetricCard {
  title: string;
  value: string | number;
  unit?: string;
  trend?: Trend;
  sparkline?: number[];
  icon?: string;
  color?: string;
  comparison?: Comparison;
}

export interface Trend {
  direction: 'up' | 'down' | 'stable';
  value: number;
  percentage?: boolean;
}

export interface Comparison {
  label: string;
  value: number;
  type: 'absolute' | 'percentage';
}

// Visualization interfaces
export interface IVisualizer {
  readonly id: UUID;
  readonly name: string;
  readonly type: string;
  
  visualize(data: DataRecord[]): Promise<IChart | ReportSection | Widget>;
  canVisualize(data: unknown): boolean;
  getSupportedFormats(): ExportFormat[];
}

export interface IReportBuilder {
  addSection(title: string, content?: string): ReportSection;
  addChart(chart: IChart, section?: ReportSection): void;
  addTable(table: Table, section?: ReportSection): void;
  build(): Promise<Report>;
  export(format: ReportFormat): Promise<Uint8Array | string>;
}

export interface Report {
  id: UUID;
  config: ReportConfig;
  sections: ReportSection[];
  metadata?: Record<string, unknown>;
}

export interface IDashboardBuilder {
  addWidget(widget: Widget): void;
  removeWidget(widgetId: UUID): void;
  updateWidget(widgetId: UUID, config: Partial<Widget>): void;
  setLayout(layout: LayoutType): void;
  build(): Promise<Dashboard>;
  export(format: ExportFormat): Promise<Uint8Array | string>;
}

export interface Dashboard {
  id: UUID;
  config: DashboardConfig;
  widgets: Widget[];
  filters: Filter[];
  metadata?: Record<string, unknown>;
}

export interface IExporter<T = unknown> {
  readonly format: ExportFormat;
  
  export(data: T, options?: ExportOptions): Promise<Uint8Array | string>;
  canExport(data: unknown): boolean;
}

// Type guards
export function isChart(value: unknown): value is IChart {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'render' in value &&
    'export' in value
  );
}

export function isReportSection(value: unknown): value is ReportSection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'title' in value &&
    'level' in value
  );
}

export function isWidget(value: unknown): value is Widget {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value
  );
}

export function isDashboard(value: unknown): value is Dashboard {
  return (
    typeof value === 'object' &&
    value !== null &&
    'config' in value &&
    'widgets' in value &&
    Array.isArray((value as any).widgets)
  );
}

export function isReport(value: unknown): value is Report {
  return (
    typeof value === 'object' &&
    value !== null &&
    'config' in value &&
    'sections' in value &&
    Array.isArray((value as any).sections)
  );
}