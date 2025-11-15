// src/processing/aggregators.ts
/**
 * Data aggregation functions for the processing module.
 */

import { ProcessingException } from '../core/exceptions.js';
import type {
  IAggregator,
  AggregationType,
  AggregationState
} from './types.js';

/**
 * Base aggregator implementation
 */
export abstract class BaseAggregator<T = unknown, R = unknown> implements IAggregator<T, R> {
  public readonly name: string;
  public readonly type: AggregationType;
  protected state: AggregationState<T>;

  constructor(name: string, type: AggregationType) {
    this.name = name;
    this.type = type;
    this.state = this.createInitialState();
  }

  protected createInitialState(): AggregationState<T> {
    return {
      count: 0,
      values: [],
      groups: new Map(),
      custom: {}
    };
  }

  public abstract add(value: T): void;
  public abstract getResult(): R;

  public addBatch(values: T[]): void {
    for (const value of values) {
      this.add(value);
    }
  }

  public reset(): void {
    this.state = this.createInitialState();
  }

  public merge(other: IAggregator<T, R>): void {
    if (other instanceof BaseAggregator) {
      this.mergeState(other.state);
    }
  }

  protected abstract mergeState(otherState: AggregationState<T>): void;

  public clone(): IAggregator<T, R> {
    const cloned = Object.create(Object.getPrototypeOf(this));
    cloned.name = this.name;
    cloned.type = this.type;
    cloned.state = this.cloneState();
    return cloned;
  }

  protected cloneState(): AggregationState<T> {
    return {
      count: this.state.count,
      sum: this.state.sum,
      min: this.state.min,
      max: this.state.max,
      values: [...(this.state.values || [])],
      groups: new Map(this.state.groups),
      custom: { ...this.state.custom }
    };
  }
}

/**
 * Count aggregator
 */
export class CountAggregator<T = unknown> extends BaseAggregator<T, number> {
  constructor(private readonly field?: string) {
    super('Count', AggregationType.COUNT);
  }

  public add(value: T): void {
    if (this.field) {
      const record = value as any;
      if (this.field in record && record[this.field] !== null && record[this.field] !== undefined) {
        this.state.count++;
      }
    } else {
      this.state.count++;
    }
  }

  public getResult(): number {
    return this.state.count;
  }

  protected mergeState(otherState: AggregationState<T>): void {
    this.state.count += otherState.count;
  }
}

/**
 * Sum aggregator
 */
export class SumAggregator extends BaseAggregator<number, number> {
  constructor(private readonly field?: string) {
    super('Sum', AggregationType.SUM);
    this.state.sum = 0;
  }

  public add(value: number | any): void {
    let numValue: number;
    
    if (this.field && typeof value === 'object' && value !== null) {
      numValue = Number(value[this.field]);
    } else {
      numValue = Number(value);
    }

    if (!isNaN(numValue)) {
      this.state.sum = (this.state.sum || 0) + numValue;
      this.state.count++;
    }
  }

  public getResult(): number {
    return this.state.sum || 0;
  }

  protected mergeState(otherState: AggregationState<number>): void {
    this.state.sum = (this.state.sum || 0) + (otherState.sum || 0);
    this.state.count += otherState.count;
  }
}

/**
 * Average aggregator
 */
export class AverageAggregator extends BaseAggregator<number, number> {
  private sum = 0;

  constructor(private readonly field?: string) {
    super('Average', AggregationType.AVERAGE);
  }

  public add(value: number | any): void {
    let numValue: number;
    
    if (this.field && typeof value === 'object' && value !== null) {
      numValue = Number(value[this.field]);
    } else {
      numValue = Number(value);
    }

    if (!isNaN(numValue)) {
      this.sum += numValue;
      this.state.count++;
    }
  }

  public getResult(): number {
    return this.state.count > 0 ? this.sum / this.state.count : 0;
  }

  protected mergeState(otherState: AggregationState<number>): void {
    // Assuming otherState has sum stored in custom
    this.sum += otherState.custom?.sum as number || 0;
    this.state.count += otherState.count;
  }

  protected cloneState(): AggregationState<number> {
    const cloned = super.cloneState();
    cloned.custom!.sum = this.sum;
    return cloned;
  }
}

/**
 * Min aggregator
 */
export class MinAggregator<T = unknown> extends BaseAggregator<T, T | undefined> {
  constructor(
    private readonly field?: string,
    private readonly compareFn?: (a: T, b: T) => number
  ) {
    super('Min', AggregationType.MIN);
  }

  public add(value: T | any): void {
    let compareValue: T;
    
    if (this.field && typeof value === 'object' && value !== null) {
      compareValue = value[this.field];
    } else {
      compareValue = value;
    }

    if (compareValue === null || compareValue === undefined) {
      return;
    }

    if (this.state.min === undefined) {
      this.state.min = compareValue;
    } else {
      const comparison = this.compareFn 
        ? this.compareFn(compareValue, this.state.min)
        : this.defaultCompare(compareValue, this.state.min);
      
      if (comparison < 0) {
        this.state.min = compareValue;
      }
    }
    
    this.state.count++;
  }

  public getResult(): T | undefined {
    return this.state.min;
  }

  protected mergeState(otherState: AggregationState<T>): void {
    if (otherState.min !== undefined) {
      if (this.state.min === undefined) {
        this.state.min = otherState.min;
      } else {
        const comparison = this.compareFn 
          ? this.compareFn(otherState.min, this.state.min)
          : this.defaultCompare(otherState.min, this.state.min);
        
        if (comparison < 0) {
          this.state.min = otherState.min;
        }
      }
    }
    this.state.count += otherState.count;
  }

  private defaultCompare(a: T, b: T): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
}

/**
 * Max aggregator
 */
export class MaxAggregator<T = unknown> extends BaseAggregator<T, T | undefined> {
  constructor(
    private readonly field?: string,
    private readonly compareFn?: (a: T, b: T) => number
  ) {
    super('Max', AggregationType.MAX);
  }

  public add(value: T | any): void {
    let compareValue: T;
    
    if (this.field && typeof value === 'object' && value !== null) {
      compareValue = value[this.field];
    } else {
      compareValue = value;
    }

    if (compareValue === null || compareValue === undefined) {
      return;
    }

    if (this.state.max === undefined) {
      this.state.max = compareValue;
    } else {
      const comparison = this.compareFn 
        ? this.compareFn(compareValue, this.state.max)
        : this.defaultCompare(compareValue, this.state.max);
      
      if (comparison > 0) {
        this.state.max = compareValue;
      }
    }
    
    this.state.count++;
  }

  public getResult(): T | undefined {
    return this.state.max;
  }

  protected mergeState(otherState: AggregationState<T>): void {
    if (otherState.max !== undefined) {
      if (this.state.max === undefined) {
        this.state.max = otherState.max;
      } else {
        const comparison = this.compareFn 
          ? this.compareFn(otherState.max, this.state.max)
          : this.defaultCompare(otherState.max, this.state.max);
        
        if (comparison > 0) {
          this.state.max = otherState.max;
        }
      }
    }
    this.state.count += otherState.count;
  }

  private defaultCompare(a: T, b: T): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
}

/**
 * Median aggregator
 */
export class MedianAggregator extends BaseAggregator<number, number> {
  constructor(private readonly field?: string) {
    super('Median', AggregationType.MEDIAN);
  }

  public add(value: number | any): void {
    let numValue: number;
    
    if (this.field && typeof value === 'object' && value !== null) {
      numValue = Number(value[this.field]);
    } else {
      numValue = Number(value);
    }

    if (!isNaN(numValue)) {
      this.state.values!.push(numValue);
      this.state.count++;
    }
  }

  public getResult(): number {
    if (this.state.values!.length === 0) return 0;
    
    const sorted = [...this.state.values!].sort((a, b) => (a as number) - (b as number));
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
    } else {
      return sorted[mid] as number;
    }
  }

  protected mergeState(otherState: AggregationState<number>): void {
    this.state.values!.push(...(otherState.values || []));
    this.state.count += otherState.count;
  }
}

/**
 * Mode aggregator
 */
export class ModeAggregator<T = unknown> extends BaseAggregator<T, T | undefined> {
  private frequency: Map<T, number> = new Map();

  constructor(private readonly field?: string) {
    super('Mode', AggregationType.MODE);
  }

  public add(value: T | any): void {
    let actualValue: T;
    
    if (this.field && typeof value === 'object' && value !== null) {
      actualValue = value[this.field];
    } else {
      actualValue = value;
    }

    if (actualValue !== null && actualValue !== undefined) {
      const count = this.frequency.get(actualValue) || 0;
      this.frequency.set(actualValue, count + 1);
      this.state.count++;
    }
  }

  public getResult(): T | undefined {
    let maxFreq = 0;
    let mode: T | undefined;
    
    for (const [value, freq] of this.frequency) {
      if (freq > maxFreq) {
        maxFreq = freq;
        mode = value;
      }
    }
    
    return mode;
  }

  protected mergeState(otherState: AggregationState<T>): void {
    // Assuming frequency is stored in custom
    const otherFreq = otherState.custom?.frequency as Map<T, number>;
    if (otherFreq) {
      for (const [value, freq] of otherFreq) {
        const currentFreq = this.frequency.get(value) || 0;
        this.frequency.set(value, currentFreq + freq);
      }
    }
    this.state.count += otherState.count;
  }

  protected cloneState(): AggregationState<T> {
    const cloned = super.cloneState();
    cloned.custom!.frequency = new Map(this.frequency);
    return cloned;
  }
}

/**
 * Percentile aggregator
 */
export class PercentileAggregator extends BaseAggregator<number, number> {
  constructor(
    private readonly percentile: number = 50,
    private readonly field?: string
  ) {
    super(`Percentile${percentile}`, AggregationType.PERCENTILE);
    
    if (percentile < 0 || percentile > 100) {
      throw new ProcessingException('Percentile must be between 0 and 100');
    }
  }

  public add(value: number | any): void {
    let numValue: number;
    
    if (this.field && typeof value === 'object' && value !== null) {
      numValue = Number(value[this.field]);
    } else {
      numValue = Number(value);
    }

    if (!isNaN(numValue)) {
      this.state.values!.push(numValue);
      this.state.count++;
    }
  }

  public getResult(): number {
    if (this.state.values!.length === 0) return 0;
    
    const sorted = [...this.state.values!].sort((a, b) => (a as number) - (b as number));
    const index = Math.ceil((this.percentile / 100) * sorted.length) - 1;
    
    return sorted[Math.max(0, index)] as number;
  }

  protected mergeState(otherState: AggregationState<number>): void {
    this.state.values!.push(...(otherState.values || []));
    this.state.count += otherState.count;
  }
}

/**
 * Standard deviation aggregator
 */
export class StdDevAggregator extends BaseAggregator<number, number> {
  private sum = 0;
  private sumSquares = 0;

  constructor(private readonly field?: string) {
    super('StdDev', AggregationType.STDDEV);
  }

  public add(value: number | any): void {
    let numValue: number;
    
    if (this.field && typeof value === 'object' && value !== null) {
      numValue = Number(value[this.field]);
    } else {
      numValue = Number(value);
    }

    if (!isNaN(numValue)) {
      this.sum += numValue;
      this.sumSquares += numValue * numValue;
      this.state.count++;
    }
  }

  public getResult(): number {
    if (this.state.count < 2) return 0;
    
    const mean = this.sum / this.state.count;
    const variance = (this.sumSquares / this.state.count) - (mean * mean);
    
    return Math.sqrt(variance);
  }

  protected mergeState(otherState: AggregationState<number>): void {
    this.sum += otherState.custom?.sum as number || 0;
    this.sumSquares += otherState.custom?.sumSquares as number || 0;
    this.state.count += otherState.count;
  }

  protected cloneState(): AggregationState<number> {
    const cloned = super.cloneState();
    cloned.custom!.sum = this.sum;
    cloned.custom!.sumSquares = this.sumSquares;
    return cloned;
  }
}

/**
 * Distinct aggregator
 */
export class DistinctAggregator<T = unknown> extends BaseAggregator<T, { count: number; values: T[] }> {
  private uniqueValues: Set<string> = new Set();

  constructor(private readonly field?: string) {
    super('Distinct', AggregationType.DISTINCT);
  }

  public add(value: T | any): void {
    let actualValue: T;
    
    if (this.field && typeof value === 'object' && value !== null) {
      actualValue = value[this.field];
    } else {
      actualValue = value;
    }

    if (actualValue !== null && actualValue !== undefined) {
      const key = JSON.stringify(actualValue);
      if (!this.uniqueValues.has(key)) {
        this.uniqueValues.add(key);
        this.state.values!.push(actualValue);
      }
      this.state.count++;
    }
  }

  public getResult(): { count: number; values: T[] } {
    return {
      count: this.uniqueValues.size,
      values: this.state.values as T[]
    };
  }

  protected mergeState(otherState: AggregationState<T>): void {
    for (const value of otherState.values || []) {
      const key = JSON.stringify(value);
      if (!this.uniqueValues.has(key)) {
        this.uniqueValues.add(key);
        this.state.values!.push(value);
      }
    }
    this.state.count += otherState.count;
  }
}

/**
 * GroupBy aggregator
 */
export class GroupByAggregator<T = unknown, K = string> 
  extends BaseAggregator<T, Map<K, IAggregator<T, unknown>>> {
  
  private groups: Map<K, IAggregator<T, unknown>> = new Map();

  constructor(
    private readonly groupByFn: (value: T) => K,
    private readonly aggregatorFactory: () => IAggregator<T, unknown>
  ) {
    super('GroupBy', AggregationType.GROUP);
  }

  public add(value: T): void {
    const key = this.groupByFn(value);
    
    if (!this.groups.has(key)) {
      this.groups.set(key, this.aggregatorFactory());
    }
    
    this.groups.get(key)!.add(value);
    this.state.count++;
  }

  public getResult(): Map<K, IAggregator<T, unknown>> {
    return new Map(this.groups);
  }

  public getGroupResults(): Map<K, unknown> {
    const results = new Map<K, unknown>();
    
    for (const [key, aggregator] of this.groups) {
      results.set(key, aggregator.getResult());
    }
    
    return results;
  }

  protected mergeState(otherState: AggregationState<T>): void {
    // Complex merge for group aggregator
    this.state.count += otherState.count;
  }

  public reset(): void {
    super.reset();
    this.groups.clear();
  }
}

/**
 * TopN aggregator
 */
export class TopNAggregator<T = unknown> extends BaseAggregator<T, T[]> {
  private items: Array<{ value: T; sortValue: unknown }> = [];

  constructor(
    private readonly n: number,
    private readonly field?: string,
    private readonly sortFn?: (a: T, b: T) => number
  ) {
    super(`Top${n}`, AggregationType.TOP_N);
  }

  public add(value: T | any): void {
    let actualValue: T;
    let sortValue: unknown;
    
    if (this.field && typeof value === 'object' && value !== null) {
      actualValue = value;
      sortValue = value[this.field];
    } else {
      actualValue = value;
      sortValue = value;
    }

    this.items.push({ value: actualValue, sortValue });
    this.state.count++;
    
    // Keep only top N + buffer for efficiency
    if (this.items.length > this.n * 2) {
      this.sortAndTrim();
    }
  }

  public getResult(): T[] {
    this.sortAndTrim();
    return this.items.slice(0, this.n).map(item => item.value);
  }

  private sortAndTrim(): void {
    if (this.sortFn) {
      this.items.sort((a, b) => this.sortFn!(a.value, b.value));
    } else {
      this.items.sort((a, b) => {
        if (a.sortValue! > b.sortValue!) return -1;
        if (a.sortValue! < b.sortValue!) return 1;
        return 0;
      });
    }
    
    this.items = this.items.slice(0, this.n);
  }

  protected mergeState(otherState: AggregationState<T>): void {
    // Complex merge for TopN
    this.state.count += otherState.count;
  }
}

/**
 * Multi-aggregator - applies multiple aggregators
 */
export class MultiAggregator<T = unknown> extends BaseAggregator<T, Map<string, unknown>> {
  constructor(private readonly aggregators: Map<string, IAggregator<T, unknown>>) {
    super('Multi', AggregationType.GROUP);
  }

  public add(value: T): void {
    for (const aggregator of this.aggregators.values()) {
      aggregator.add(value);
    }
    this.state.count++;
  }

  public getResult(): Map<string, unknown> {
    const results = new Map<string, unknown>();
    
    for (const [name, aggregator] of this.aggregators) {
      results.set(name, aggregator.getResult());
    }
    
    return results;
  }

  protected mergeState(otherState: AggregationState<T>): void {
    this.state.count += otherState.count;
  }

  public reset(): void {
    super.reset();
    for (const aggregator of this.aggregators.values()) {
      aggregator.reset();
    }
  }
}

/**
 * Factory for creating aggregators
 */
export class AggregatorFactory {
  public static create(type: AggregationType, options?: any): IAggregator<unknown, unknown> {
    switch (type) {
      case AggregationType.COUNT:
        return new CountAggregator(options?.field);
      case AggregationType.SUM:
        return new SumAggregator(options?.field);
      case AggregationType.AVERAGE:
        return new AverageAggregator(options?.field);
      case AggregationType.MIN:
        return new MinAggregator(options?.field, options?.compareFn);
      case AggregationType.MAX:
        return new MaxAggregator(options?.field, options?.compareFn);
      case AggregationType.MEDIAN:
        return new MedianAggregator(options?.field);
      case AggregationType.MODE:
        return new ModeAggregator(options?.field);
      case AggregationType.PERCENTILE:
        return new PercentileAggregator(options?.percentile || 50, options?.field);
      case AggregationType.STDDEV:
        return new StdDevAggregator(options?.field);
      case AggregationType.DISTINCT:
        return new DistinctAggregator(options?.field);
      case AggregationType.TOP_N:
        return new TopNAggregator(options?.n || 10, options?.field, options?.sortFn);
      default:
        throw new ProcessingException(`Unknown aggregation type: ${type}`);
    }
  }
}

/**
 * Create custom aggregator from functions
 */
export function createAggregator<T, R>(
  name: string,
  addFn: (state: AggregationState<T>, value: T) => void,
  getResultFn: (state: AggregationState<T>) => R,
  mergeFn?: (state: AggregationState<T>, otherState: AggregationState<T>) => void
): IAggregator<T, R> {
  return new class extends BaseAggregator<T, R> {
    constructor() {
      super(name, AggregationType.GROUP); // Default to GROUP for custom
    }

    public add(value: T): void {
      addFn(this.state, value);
      this.state.count++;
    }

    public getResult(): R {
      return getResultFn(this.state);
    }

    protected mergeState(otherState: AggregationState<T>): void {
      if (mergeFn) {
        mergeFn(this.state, otherState);
      } else {
        this.state.count += otherState.count;
      }
    }
  };
}