// src/processing/transformers.ts
/**
 * Data transformation utilities for the processing module.
 */

import { BaseTransformer } from '../core/base.js';
import { ProcessingException } from '../core/exceptions.js';
import { Transformer } from '../core/registry.js';
import type {
  ITransformer,
  TransformerType,
  MapFunction,
  FilterFunction,
  FlatMapFunction,
  GroupByFunction,
  JoinFunction,
  JoinConfig,
  TransformContext
} from './types.js';
import type { Predicate, DataRecord } from '../types.js';

/**
 * Base transformer implementation
 */
export abstract class BaseDataTransformer<T = unknown, R = unknown> 
  extends BaseTransformer 
  implements ITransformer<T, R> {
  
  public readonly type: TransformerType;

  constructor(name: string, type: TransformerType) {
    super(name);
    this.type = type;
  }

  public abstract transform(data: T): R | Promise<R>;
  
  public async transformBatch(data: T[]): Promise<R[]> {
    const results: R[] = [];
    for (const item of data) {
      const result = await this.transform(item);
      results.push(result);
    }
    return results;
  }

  public canTransform(data: unknown): boolean {
    return data !== null && data !== undefined;
  }

  public async initialize(): Promise<void> {
    this.logger.debug(`Initializing transformer: ${this.name}`);
  }

  public async cleanup(): Promise<void> {
    this.logger.debug(`Cleaning up transformer: ${this.name}`);
  }
}

/**
 * Map transformer
 */
@Transformer({ 
  tags: ['map', 'transform'],
  capabilities: ['mapping', 'projection']
})
export class MapTransformer<T = unknown, R = unknown> extends BaseDataTransformer<T, R> {
  constructor(private readonly mapFn: MapFunction<T, R>) {
    super('MapTransformer', TransformerType.MAP);
  }

  public transform(data: T): R {
    try {
      return this.mapFn(data);
    } catch (error) {
      throw new ProcessingException(
        `Map transformation failed: ${error}`,
        this.name
      );
    }
  }

  public canTransform(data: unknown): boolean {
    return true; // Map can transform any data
  }
}

/**
 * Filter transformer
 */
@Transformer({ 
  tags: ['filter', 'predicate'],
  capabilities: ['filtering', 'selection']
})
export class FilterTransformer<T = unknown> extends BaseDataTransformer<T[], T[]> {
  constructor(private readonly filterFn: FilterFunction<T>) {
    super('FilterTransformer', TransformerType.FILTER);
  }

  public transform(data: T[]): T[] {
    try {
      return data.filter(this.filterFn);
    } catch (error) {
      throw new ProcessingException(
        `Filter transformation failed: ${error}`,
        this.name
      );
    }
  }

  public canTransform(data: unknown): boolean {
    return Array.isArray(data);
  }
}

/**
 * Reduce transformer
 */
@Transformer({ 
  tags: ['reduce', 'aggregate'],
  capabilities: ['reduction', 'aggregation']
})
export class ReduceTransformer<T = unknown, R = unknown> extends BaseDataTransformer<T[], R> {
  constructor(
    private readonly reduceFn: (acc: R, value: T) => R,
    private readonly initialValue: R
  ) {
    super('ReduceTransformer', TransformerType.REDUCE);
  }

  public transform(data: T[]): R {
    try {
      return data.reduce(this.reduceFn, this.initialValue);
    } catch (error) {
      throw new ProcessingException(
        `Reduce transformation failed: ${error}`,
        this.name
      );
    }
  }

  public canTransform(data: unknown): boolean {
    return Array.isArray(data);
  }
}

/**
 * FlatMap transformer
 */
@Transformer({ 
  tags: ['flatmap', 'expand'],
  capabilities: ['flattening', 'expansion']
})
export class FlatMapTransformer<T = unknown, R = unknown> extends BaseDataTransformer<T[], R[]> {
  constructor(private readonly flatMapFn: FlatMapFunction<T, R>) {
    super('FlatMapTransformer', TransformerType.FLATMAP);
  }

  public transform(data: T[]): R[] {
    try {
      return data.flatMap(this.flatMapFn);
    } catch (error) {
      throw new ProcessingException(
        `FlatMap transformation failed: ${error}`,
        this.name
      );
    }
  }

  public canTransform(data: unknown): boolean {
    return Array.isArray(data);
  }
}

/**
 * GroupBy transformer
 */
@Transformer({ 
  tags: ['group', 'categorize'],
  capabilities: ['grouping', 'categorization']
})
export class GroupByTransformer<T = unknown, K = string> 
  extends BaseDataTransformer<T[], Map<K, T[]>> {
  
  constructor(private readonly groupByFn: GroupByFunction<T, K>) {
    super('GroupByTransformer', TransformerType.GROUP);
  }

  public transform(data: T[]): Map<K, T[]> {
    try {
      const groups = new Map<K, T[]>();
      
      for (const item of data) {
        const key = this.groupByFn(item);
        const group = groups.get(key) || [];
        group.push(item);
        groups.set(key, group);
      }
      
      return groups;
    } catch (error) {
      throw new ProcessingException(
        `GroupBy transformation failed: ${error}`,
        this.name
      );
    }
  }

  public canTransform(data: unknown): boolean {
    return Array.isArray(data);
  }
}

/**
 * Field mapper transformer
 */
@Transformer({ 
  tags: ['field', 'rename'],
  capabilities: ['field-mapping', 'renaming']
})
export class FieldMapperTransformer extends BaseDataTransformer<DataRecord, DataRecord> {
  constructor(private readonly fieldMapping: Record<string, string>) {
    super('FieldMapperTransformer', TransformerType.MAP);
  }

  public transform(data: DataRecord): DataRecord {
    const result: DataRecord = {};
    
    for (const [sourceField, targetField] of Object.entries(this.fieldMapping)) {
      if (sourceField in data) {
        this.setNestedValue(result, targetField, data[sourceField]);
      }
    }
    
    // Include unmapped fields
    for (const [key, value] of Object.entries(data)) {
      if (!(key in this.fieldMapping)) {
        result[key] = value;
      }
    }
    
    return result;
  }

  private setNestedValue(obj: DataRecord, path: string, value: unknown): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!;
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key] as DataRecord;
    }
    
    current[keys[keys.length - 1]!] = value;
  }
}

/**
 * Type converter transformer
 */
@Transformer({ 
  tags: ['type', 'convert'],
  capabilities: ['type-conversion', 'casting']
})
export class TypeConverterTransformer extends BaseDataTransformer<DataRecord, DataRecord> {
  constructor(private readonly conversions: Record<string, string>) {
    super('TypeConverterTransformer', TransformerType.MAP);
  }

  public transform(data: DataRecord): DataRecord {
    const result = { ...data };
    
    for (const [field, targetType] of Object.entries(this.conversions)) {
      if (field in result) {
        result[field] = this.convertType(result[field], targetType);
      }
    }
    
    return result;
  }

  private convertType(value: unknown, targetType: string): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    switch (targetType.toLowerCase()) {
      case 'string':
        return String(value);
      
      case 'number':
      case 'float':
        return Number(value);
      
      case 'integer':
      case 'int':
        return parseInt(String(value), 10);
      
      case 'boolean':
      case 'bool':
        return Boolean(value);
      
      case 'date':
      case 'datetime':
        return new Date(String(value));
      
      case 'json':
        return typeof value === 'string' ? JSON.parse(value) : value;
      
      case 'array':
        return Array.isArray(value) ? value : [value];
      
      default:
        return value;
    }
  }
}

/**
 * Normalizer transformer
 */
@Transformer({ 
  tags: ['normalize', 'standardize'],
  capabilities: ['normalization', 'standardization']
})
export class NormalizerTransformer extends BaseDataTransformer<DataRecord, DataRecord> {
  constructor(private readonly options: {
    fields?: string[];
    lowercase?: boolean;
    uppercase?: boolean;
    trim?: boolean;
    removeNulls?: boolean;
    removeEmpty?: boolean;
  } = {}) {
    super('NormalizerTransformer', TransformerType.NORMALIZE);
  }

  public transform(data: DataRecord): DataRecord {
    const result: DataRecord = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Skip if field not in list (if list specified)
      if (this.options.fields && !this.options.fields.includes(key)) {
        result[key] = value;
        continue;
      }

      // Skip nulls if configured
      if (this.options.removeNulls && value === null) {
        continue;
      }

      // Skip empty strings if configured
      if (this.options.removeEmpty && value === '') {
        continue;
      }

      // Normalize strings
      if (typeof value === 'string') {
        let normalized = value;
        
        if (this.options.trim) {
          normalized = normalized.trim();
        }
        
        if (this.options.lowercase) {
          normalized = normalized.toLowerCase();
        } else if (this.options.uppercase) {
          normalized = normalized.toUpperCase();
        }
        
        result[key] = normalized;
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
}

/**
 * Join transformer
 */
@Transformer({ 
  tags: ['join', 'merge'],
  capabilities: ['joining', 'merging']
})
export class JoinTransformer<L = DataRecord, R = DataRecord, O = DataRecord> 
  extends BaseDataTransformer<{ left: L[], right: R[] }, O[]> {
  
  constructor(private readonly config: JoinConfig) {
    super('JoinTransformer', TransformerType.JOIN);
  }

  public transform(data: { left: L[], right: R[] }): O[] {
    const { left, right } = data;
    const results: O[] = [];
    
    const getKey = (item: any, keyDef: any): unknown => {
      if (typeof keyDef === 'function') {
        return keyDef(item);
      }
      return item[keyDef];
    };

    // Build index for right side
    const rightIndex = new Map<unknown, R[]>();
    for (const rightItem of right) {
      const key = getKey(rightItem, this.config.rightKey);
      const items = rightIndex.get(key) || [];
      items.push(rightItem);
      rightIndex.set(key, items);
    }

    // Perform join based on type
    for (const leftItem of left) {
      const leftKey = getKey(leftItem, this.config.leftKey);
      const rightItems = rightIndex.get(leftKey) || [];
      
      if (rightItems.length > 0) {
        // Found matches
        for (const rightItem of rightItems) {
          results.push(this.combineRecords(leftItem, rightItem));
        }
      } else if (this.config.type === 'left' || this.config.type === 'full') {
        // No match, but include left item for left/full join
        results.push(this.combineRecords(leftItem, null));
      }
    }

    // Handle right/full join unmatched items
    if (this.config.type === 'right' || this.config.type === 'full') {
      const leftKeys = new Set(
        left.map(item => getKey(item, this.config.leftKey))
      );
      
      for (const rightItem of right) {
        const rightKey = getKey(rightItem, this.config.rightKey);
        if (!leftKeys.has(rightKey)) {
          results.push(this.combineRecords(null, rightItem));
        }
      }
    }

    return results;
  }

  private combineRecords(left: L | null, right: R | null): O {
    if (typeof this.config.select === 'function') {
      return this.config.select(left, right) as O;
    }

    const result: any = {};
    
    // Add left fields
    if (left) {
      for (const [key, value] of Object.entries(left as any)) {
        result[`left_${key}`] = value;
      }
    }
    
    // Add right fields
    if (right) {
      for (const [key, value] of Object.entries(right as any)) {
        result[`right_${key}`] = value;
      }
    }
    
    return result as O;
  }

  public canTransform(data: unknown): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      'left' in data &&
      'right' in data &&
      Array.isArray((data as any).left) &&
      Array.isArray((data as any).right)
    );
  }
}

/**
 * Chain transformer - applies multiple transformers in sequence
 */
@Transformer({ 
  tags: ['chain', 'pipeline'],
  capabilities: ['chaining', 'composition']
})
export class ChainTransformer<T = unknown, R = unknown> extends BaseDataTransformer<T, R> {
  constructor(private readonly transformers: ITransformer[]) {
    super('ChainTransformer', TransformerType.MAP);
  }

  public async transform(data: T): Promise<R> {
    let result: any = data;
    
    for (const transformer of this.transformers) {
      result = await transformer.transform(result);
    }
    
    return result as R;
  }

  public canTransform(data: unknown): boolean {
    return this.transformers.length > 0 && 
           this.transformers[0]!.canTransform(data);
  }
}

/**
 * Conditional transformer
 */
@Transformer({ 
  tags: ['conditional', 'if-else'],
  capabilities: ['conditional-transform']
})
export class ConditionalTransformer<T = unknown> extends BaseDataTransformer<T, T> {
  constructor(
    private readonly condition: Predicate<T>,
    private readonly trueTransformer: ITransformer<T, T>,
    private readonly falseTransformer?: ITransformer<T, T>
  ) {
    super('ConditionalTransformer', TransformerType.MAP);
  }

  public async transform(data: T): Promise<T> {
    if (this.condition(data)) {
      return this.trueTransformer.transform(data);
    } else if (this.falseTransformer) {
      return this.falseTransformer.transform(data);
    }
    
    return data;
  }
}

/**
 * Window transformer
 */
@Transformer({ 
  tags: ['window', 'batch'],
  capabilities: ['windowing', 'batching']
})
export class WindowTransformer<T = unknown> extends BaseDataTransformer<T[], T[][]> {
  constructor(private readonly windowSize: number) {
    super('WindowTransformer', TransformerType.WINDOW);
  }

  public transform(data: T[]): T[][] {
    const windows: T[][] = [];
    
    for (let i = 0; i < data.length; i += this.windowSize) {
      windows.push(data.slice(i, i + this.windowSize));
    }
    
    return windows;
  }

  public canTransform(data: unknown): boolean {
    return Array.isArray(data);
  }
}

/**
 * Pivot transformer
 */
@Transformer({ 
  tags: ['pivot', 'reshape'],
  capabilities: ['pivoting', 'reshaping']
})
export class PivotTransformer extends BaseDataTransformer<DataRecord[], DataRecord[]> {
  constructor(
    private readonly rowKey: string,
    private readonly columnKey: string,
    private readonly valueKey: string,
    private readonly aggregateFn: (values: unknown[]) => unknown = values => values[0]
  ) {
    super('PivotTransformer', TransformerType.PIVOT);
  }

  public transform(data: DataRecord[]): DataRecord[] {
    const pivotMap = new Map<string, DataRecord>();
    const columns = new Set<string>();

    // Build pivot structure
    for (const record of data) {
      const row = String(record[this.rowKey]);
      const column = String(record[this.columnKey]);
      const value = record[this.valueKey];

      columns.add(column);

      if (!pivotMap.has(row)) {
        pivotMap.set(row, { [this.rowKey]: row });
      }

      const pivotRow = pivotMap.get(row)!;
      
      if (!pivotRow[column]) {
        pivotRow[column] = [];
      }
      
      (pivotRow[column] as unknown[]).push(value);
    }

    // Aggregate values
    const results: DataRecord[] = [];
    for (const [rowKey, pivotRow] of pivotMap) {
      const result: DataRecord = { [this.rowKey]: rowKey };
      
      for (const column of columns) {
        if (pivotRow[column]) {
          result[column] = this.aggregateFn(pivotRow[column] as unknown[]);
        }
      }
      
      results.push(result);
    }

    return results;
  }
}

/**
 * Create transformer from function
 */
export function createTransformer<T, R>(
  name: string,
  transformFn: (data: T) => R | Promise<R>,
  canTransformFn?: Predicate<unknown>
): ITransformer<T, R> {
  return new class extends BaseDataTransformer<T, R> {
    constructor() {
      super(name, TransformerType.MAP);
    }

    public transform(data: T): R | Promise<R> {
      return transformFn(data);
    }

    public canTransform(data: unknown): boolean {
      return canTransformFn ? canTransformFn(data) : true;
    }
  };
}