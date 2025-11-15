// visualization/templates.js
/**
 * Visualization templates for the visualization module.
 * 
 * This module provides pre-built templates for common visualization
 * scenarios and report types.
 */

import { ReportBuilder, DashboardBuilder } from './reports.js';
import { ChartType } from './charts.js';

/**
 * Base template class
 */
export class BaseTemplate {
    constructor(name, options = {}) {
        this.name = name;
        this.options = options;
        this.theme = options.theme || 'default';
        this.logger = console;
    }

    /**
     * Apply template to data
     * @abstract
     */
    async apply(data, config = {}) {
        throw new Error('Method apply() must be implemented');
    }

    /**
     * Get template configuration
     */
    getConfig() {
        return {
            name: this.name,
            options: this.options,
            theme: this.theme
        };
    }
}

/**
 * Sales report template
 */
export class SalesReportTemplate extends BaseTemplate {
    constructor(options = {}) {
        super('sales-report', options);
        this.includeCharts = options.includeCharts ?? true;
        this.includeTables = options.includeTables ?? true;
        this.includeSummary = options.includeSummary ?? true;
    }

    async apply(data, config = {}) {
        const report = new ReportBuilder('Sales Report', {
            author: config.author || 'Sales Team',
            theme: this.theme
        });

        // Executive Summary
        if (this.includeSummary) {
            const summary = this.calculateSummary(data);
            report.addSummary(data, summary);
        }

        // Sales by Period
        if (this.includeCharts) {
            const salesSection = report.addSection('Sales Overview');
            
            // Time series chart
            salesSection.addChart(
                report.chartGenerator.createChart(
                    ChartType.LINE,
                    this.aggregateByPeriod(data),
                    { title: 'Sales Trend' }
                )
            );

            // Top products chart
            salesSection.addChart(
                report.chartGenerator.createChart(
                    ChartType.BAR,
                    this.getTopProducts(data),
                    { title: 'Top Products' }
                )
            );

            // Revenue breakdown
            salesSection.addChart(
                report.chartGenerator.createChart(
                    ChartType.PIE,
                    this.getRevenueBreakdown(data),
                    { title: 'Revenue by Category' }
                )
            );
        }

        // Detailed Tables
        if (this.includeTables) {
            report.addDataTable('Detailed Sales Data', data, {
                sortBy: 'date',
                limit: 100
            });
        }

        return report;
    }

    calculateSummary(data) {
        const totalSales = data.reduce((sum, item) => sum + (item.amount || 0), 0);
        const avgSale = totalSales / data.length;
        const uniqueCustomers = new Set(data.map(item => item.customerId)).size;

        return {
            'Total Sales': `$${totalSales.toFixed(2)}`,
            'Average Sale': `$${avgSale.toFixed(2)}`,
            'Total Transactions': data.length,
            'Unique Customers': uniqueCustomers
        };
    }

    aggregateByPeriod(data) {
        const grouped = {};
        
        data.forEach(item => {
            const date = new Date(item.date).toLocaleDateString();
            if (!grouped[date]) {
                grouped[date] = 0;
            }
            grouped[date] += item.amount || 0;
        });

        return Object.entries(grouped).map(([date, amount]) => ({
            x: date,
            y: amount
        }));
    }

    getTopProducts(data) {
        const products = {};
        
        data.forEach(item => {
            if (!products[item.product]) {
                products[item.product] = 0;
            }
            products[item.product] += item.amount || 0;
        });

        return Object.entries(products)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([product, amount]) => ({
                category: product,
                value: amount
            }));
    }

    getRevenueBreakdown(data) {
        const categories = {};
        
        data.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = 0;
            }
            categories[item.category] += item.amount || 0;
        });

        return Object.entries(categories).map(([category, amount]) => ({
            label: category,
            value: amount
        }));
    }
}

/**
 * Analytics dashboard template
 */
export class AnalyticsDashboardTemplate extends BaseTemplate {
    constructor(options = {}) {
        super('analytics-dashboard', options);
        this.refreshInterval = options.refreshInterval || 30000;
        this.metrics = options.metrics || ['users', 'sessions', 'pageviews', 'bounce_rate'];
    }

    async apply(data, config = {}) {
        const dashboard = new DashboardBuilder('Analytics Dashboard', {
            refreshInterval: this.refreshInterval,
            theme: this.theme
        });

        // Key Metrics Cards
        const metrics = this.calculateMetrics(data);
        
        for (const [metric, value] of Object.entries(metrics)) {
            dashboard.addMetricCard(
                this.formatMetricName(metric),
                value.value,
                {
                    trend: value.trend,
                    color: this.getMetricColor(metric)
                }
            );
        }

        // Traffic Chart
        dashboard.addRealtimeChart(
            'Traffic Overview',
            'analytics',
            ChartType.LINE,
            {
                refreshInterval: 5000
            }
        );

        // User Distribution
        const userSection = dashboard.addSection('User Analytics');
        userSection.addChart(
            dashboard.chartGenerator.createChart(
                ChartType.PIE,
                this.getUserDistribution(data),
                { title: 'User Distribution' }
            )
        );

        // Performance Metrics
        const perfSection = dashboard.addSection('Performance Metrics');
        perfSection.addChart(
            dashboard.chartGenerator.createChart(
                ChartType.BAR,
                this.getPerformanceMetrics(data),
                { title: 'Page Load Times' }
            )
        );

        return dashboard;
    }

    calculateMetrics(data) {
        const metrics = {};

        // Mock metric calculations
        metrics.users = {
            value: data.length,
            trend: 12.5
        };

        metrics.sessions = {
            value: data.reduce((sum, item) => sum + (item.sessions || 1), 0),
            trend: -3.2
        };

        metrics.pageviews = {
            value: data.reduce((sum, item) => sum + (item.pageviews || 0), 0),
            trend: 8.7
        };

        metrics.bounce_rate = {
            value: '45.2%',
            trend: -5.1
        };

        return metrics;
    }

    getUserDistribution(data) {
        return [
            { label: 'New Users', value: 65 },
            { label: 'Returning Users', value: 35 }
        ];
    }

    getPerformanceMetrics(data) {
        return [
            { category: 'Homepage', value: 1.2 },
            { category: 'Product Page', value: 2.1 },
            { category: 'Checkout', value: 1.8 },
            { category: 'Search', value: 0.9 }
        ];
    }

    formatMetricName(metric) {
        return metric
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getMetricColor(metric) {
        const colors = {
            users: '#007bff',
            sessions: '#28a745',
            pageviews: '#17a2b8',
            bounce_rate: '#ffc107'
        };
        return colors[metric] || '#6c757d';
    }
}

/**
 * Financial report template
 */
export class FinancialReportTemplate extends BaseTemplate {
    constructor(options = {}) {
        super('financial-report', options);
        this.currency = options.currency || 'USD';
        this.fiscalYear = options.fiscalYear || new Date().getFullYear();
    }

    async apply(data, config = {}) {
        const report = new ReportBuilder(`Financial Report ${this.fiscalYear}`, {
            author: config.author || 'Finance Department',
            theme: this.theme
        });

        // Executive Summary
        const summary = this.calculateFinancialSummary(data);
        report.addSummary(data, summary);

        // Revenue Analysis
        const revenueSection = report.addSection('Revenue Analysis');
        revenueSection.addChart(
            report.chartGenerator.createChart(
                ChartType.AREA,
                this.getMonthlyRevenue(data),
                { title: 'Monthly Revenue Trend' }
            )
        );

        // Expense Breakdown
        const expenseSection = report.addSection('Expense Analysis');
        expenseSection.addChart(
            report.chartGenerator.createChart(
                ChartType.PIE,
                this.getExpenseBreakdown(data),
                { title: 'Expense Categories' }
            )
        );

        // Profit & Loss
        const plSection = report.addSection('Profit & Loss Statement');
        plSection.addTable(this.generatePLStatement(data));

        // Balance Sheet
        const balanceSection = report.addSection('Balance Sheet');
        balanceSection.addTable(this.generateBalanceSheet(data));

        return report;
    }

    calculateFinancialSummary(data) {
        // Mock calculations
        return {
            'Total Revenue': `$${(1000000).toLocaleString()}`,
            'Total Expenses': `$${(750000).toLocaleString()}`,
            'Net Profit': `$${(250000).toLocaleString()}`,
            'Profit Margin': '25%',
            'YoY Growth': '+12.5%'
        };
    }

    getMonthlyRevenue(data) {
        // Mock monthly data
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        return months.map((month, i) => ({
            x: month,
            y: 50000 + Math.random() * 50000
        }));
    }

    getExpenseBreakdown(data) {
        return [
            { label: 'Salaries', value: 400000 },
            { label: 'Operations', value: 150000 },
            { label: 'Marketing', value: 100000 },
            { label: 'R&D', value: 75000 },
            { label: 'Other', value: 25000 }
        ];
    }

    generatePLStatement(data) {
        return {
            headers: ['Item', 'Amount'],
            rows: [
                ['Revenue', '$1,000,000'],
                ['Cost of Goods Sold', '($400,000)'],
                ['Gross Profit', '$600,000'],
                ['Operating Expenses', '($350,000)'],
                ['Net Income', '$250,000']
            ]
        };
    }

    generateBalanceSheet(data) {
        return {
            headers: ['Category', 'Amount'],
            rows: [
                ['Assets', ''],
                ['  Current Assets', '$500,000'],
                ['  Fixed Assets', '$750,000'],
                ['Total Assets', '$1,250,000'],
                ['', ''],
                ['Liabilities', ''],
                ['  Current Liabilities', '$200,000'],
                ['  Long-term Debt', '$300,000'],
                ['Total Liabilities', '$500,000'],
                ['', ''],
                ['Equity', '$750,000'],
                ['Total Liabilities + Equity', '$1,250,000']
            ]
        };
    }
}

/**
 * Template factory
 */
export class TemplateFactory {
    constructor() {
        this.templates = new Map();
        this.registerDefaultTemplates();
    }

    registerDefaultTemplates() {
        this.register('sales-report', SalesReportTemplate);
        this.register('analytics-dashboard', AnalyticsDashboardTemplate);
        this.register('financial-report', FinancialReportTemplate);
    }

    register(name, TemplateClass) {
        this.templates.set(name, TemplateClass);
    }

    create(name, options = {}) {
        const TemplateClass = this.templates.get(name);
        
        if (!TemplateClass) {
            throw new Error(`Template '${name}' not found`);
        }
        
        return new TemplateClass(options);
    }

    list() {
        return Array.from(this.templates.keys());
    }

    async applyTemplate(templateName, data, options = {}) {
        const template = this.create(templateName, options);
        return await template.apply(data);
    }
}

// Export singleton factory
export const templateFactory = new TemplateFactory();

/**
 * Quick template functions
 */
export async function createSalesReport(data, options = {}) {
    const template = new SalesReportTemplate(options);
    return await template.apply(data);
}

export async function createAnalyticsDashboard(data, options = {}) {
    const template = new AnalyticsDashboardTemplate(options);
    return await template.apply(data);
}

export async function createFinancialReport(data, options = {}) {
    const template = new FinancialReportTemplate(options);
    return await template.apply(data);
}