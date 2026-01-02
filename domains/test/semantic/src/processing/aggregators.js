// processing/aggregators.js
/**
 * Data aggregation functions for the processing module.
 * 
 * This module provides various aggregators for computing statistics,
 * summaries, and grouped operations on data.
 */

import { ProcessingError } from '../core/exceptions.js';

/**
 * Base aggregator class
 */
export class BaseAggregator {
    constructor(name = '') {
        this.name = name || this.constructor.name;
        this.state = {};
        this.count = 0;
    }

    /**
     * Add a record to the aggregation
     */
    async add(record) {
        throw new Error('Method add() must be implemented');
    }

    /**
     * Get the current aggregated result
     */
    getResult() {
        throw new Error('Method getResult() must be implemented');
    }

    /**
     * Reset the aggregator state
     */
    reset() {
        this.state = {};
        this.count = 0;
    }

    /**
     * Merge with another aggregator
     */
    merge(other) {
        throw new Error('Method merge() must be implemented');
    }
}

/**
 * Count aggregator
 */
export class CountAggregator extends BaseAggregator {
    constructor(field = null) {
        super('Count');
        this.field = field;
    }

    async add(record) {
        if (this.field) {
            if (this.field in record && record[this.field] !== null) {
                this.count++;
            }
        } else {
            this.count++;
        }
    }

    getResult() {
        return this.count;
    }

    merge(other) {
        this.count += other.count;
    }
}

/**
 * Sum aggregator
 */
export class SumAggregator extends BaseAggregator {
    constructor(field) {
        super('Sum');
        this.field = field;
        this.sum = 0;
    }

    async add(record) {
        if (this.field in record) {
            const value = Number(record[this.field]);
            if (!isNaN(value)) {
                this.sum += value;
                this.count++;
            }
        }
    }

    getResult() {
        return this.sum;
    }

    merge(other) {
        this.sum += other.sum;
        this.count += other.count;
    }
}

/**
 * Average aggregator
 */
export class AverageAggregator extends BaseAggregator {
    constructor(field) {
        super('Average');
        this.field = field;
        this.sum = 0;
    }

    async add(record) {
        if (this.field in record) {
            const value = Number(record[this.field]);
            if (!isNaN(value)) {
                this.sum += value;
                this.count++;
            }
        }
    }

    getResult() {
        return this.count > 0 ? this.sum / this.count : 0;
    }

    merge(other) {
        this.sum += other.sum;
        this.count += other.count;
    }
}

/**
 * Min/Max aggregator
 */
export class MinMaxAggregator extends BaseAggregator {
    constructor(field) {
        super('MinMax');
        this.field = field;
        this.min = null;
        this.max = null;
    }

    async add(record) {
        if (this.field in record) {
            const value = record[this.field];
            
            if (this.min === null || value < this.min) {
                this.min = value;
            }
            
            if (this.max === null || value > this.max) {
                this.max = value;
            }
            
            this.count++;
        }
    }

    getResult() {
        return { min: this.min, max: this.max };
    }

    merge(other) {
        if (other.min !== null && (this.min === null || other.min < this.min)) {
            this.min = other.min;
        }
        if (other.max !== null && (this.max === null || other.max > this.max)) {
            this.max = other.max;
        }
        this.count += other.count;
    }
}

/**
 * Group by aggregator
 */
export class GroupByAggregator extends BaseAggregator {
    constructor(groupField, aggregator) {
        super('GroupBy');
        this.groupField = groupField;
        this.aggregator = aggregator;
        this.groups = new Map();
    }

    async add(record) {
        const groupKey = record[this.groupField];
        
        if (!this.groups.has(groupKey)) {
            this.groups.set(groupKey, new this.aggregator.constructor(
                ...this.aggregator.constructorArgs || []
            ));
        }
        
        await this.groups.get(groupKey).add(record);
        this.count++;
    }

    getResult() {
        const result = {};
        
        for (const [key, aggregator] of this.groups) {
            result[key] = aggregator.getResult();
        }
        
        return result;
    }

    merge(other) {
        for (const [key, aggregator] of other.groups) {
            if (this.groups.has(key)) {
                this.groups.get(key).merge(aggregator);
            } else {
                this.groups.set(key, aggregator);
            }
        }
        this.count += other.count;
    }

    reset() {
        super.reset();
        this.groups.clear();
    }
}

/**
 * Percentile aggregator
 */
export class PercentileAggregator extends BaseAggregator {
    constructor(field, percentile = 50) {
        super('Percentile');
        this.field = field;
        this.percentile = percentile;
        this.values = [];
    }

    async add(record) {
        if (this.field in record) {
            const value = Number(record[this.field]);
            if (!isNaN(value)) {
                this.values.push(value);
                this.count++;
            }
        }
    }

    getResult() {
        if (this.values.length === 0) return null;
        
        const sorted = [...this.values].sort((a, b) => a - b);
        const index = Math.ceil((this.percentile / 100) * sorted.length) - 1;
        
        return sorted[Math.max(0, index)];
    }

    merge(other) {
        this.values.push(...other.values);
        this.count += other.count;
    }
}

/**
 * Standard deviation aggregator
 */
export class StdDevAggregator extends BaseAggregator {
    constructor(field) {
        super('StdDev');
        this.field = field;
        this.sum = 0;
        this.sumSquares = 0;
    }

    async add(record) {
        if (this.field in record) {
            const value = Number(record[this.field]);
            if (!isNaN(value)) {
                this.sum += value;
                this.sumSquares += value * value;
                this.count++;
            }
        }
    }

    getResult() {
        if (this.count < 2) return 0;
        
        const mean = this.sum / this.count;
        const variance = (this.sumSquares / this.count) - (mean * mean);
        
        return Math.sqrt(variance);
    }

    merge(other) {
        this.sum += other.sum;
        this.sumSquares += other.sumSquares;
        this.count += other.count;
    }
}

/**
 * Distinct values aggregator
 */
export class DistinctAggregator extends BaseAggregator {
    constructor(field) {
        super('Distinct');
        this.field = field;
        this.values = new Set();
    }

    async add(record) {
        if (this.field in record) {
            this.values.add(JSON.stringify(record[this.field]));
            this.count++;
        }
    }

    getResult() {
        return {
            count: this.values.size,
            values: Array.from(this.values).map(v => JSON.parse(v))
        };
    }

    merge(other) {
        for (const value of other.values) {
            this.values.add(value);
        }
        this.count += other.count;
    }
}

/**
 * Top N aggregator
 */
export class TopNAggregator extends BaseAggregator {
    constructor(field, n = 10, sortField = null) {
        super('TopN');
        this.field = field;
        this.n = n;
        this.sortField = sortField || field;
        this.items = [];
    }

    async add(record) {
        if (this.field in record) {
            this.items.push({
                value: record[this.field],
                sortValue: record[this.sortField],
                record: record
            });
            this.count++;
        }
    }

    getResult() {
        const sorted = [...this.items].sort((a, b) => {
            if (a.sortValue < b.sortValue) return 1;
            if (a.sortValue > b.sortValue) return -1;
            return 0;
        });
        
        return sorted.slice(0, this.n).map(item => item.record);
    }

    merge(other) {
        this.items.push(...other.items);
        this.count += other.count;
    }
}

/**
 * Multi-aggregator - applies multiple aggregators
 */
export class MultiAggregator extends BaseAggregator {
    constructor(aggregators) {
        super('Multi');
        this.aggregators = aggregators;
    }

    async add(record) {
        for (const aggregator of this.aggregators) {
            await aggregator.add(record);
        }
        this.count++;
    }

    getResult() {
        const result = {};
        
        for (const aggregator of this.aggregators) {
            result[aggregator.name] = aggregator.getResult();
        }
        
        return result;
    }

    merge(other) {
        for (let i = 0; i < this.aggregators.length; i++) {
            this.aggregators[i].merge(other.aggregators[i]);
        }
        this.count += other.count;
    }

    reset() {
        super.reset();
        for (const aggregator of this.aggregators) {
            aggregator.reset();
        }
    }
}

/**
 * Create custom aggregator from functions
 */
export function createAggregator(name, addFn, getResultFn, initialState = {}) {
    return new class extends BaseAggregator {
        constructor() {
            super(name);
            this.state = { ...initialState };
        }

        async add(record) {
            this.state = await addFn(this.state, record);
            this.count++;
        }

        getResult() {
            return getResultFn(this.state, this.count);
        }

        merge(other) {
            // Simple merge - may need customization
            this.count += other.count;
        }
    };
}