// src/ingestion/schema.ts
/**
 * Schema detection and validation for the ingestion module.
 */

import { SchemaException, ValidationException } from '../core/exceptions.js';
import { BaseValidator } from '../core/base.js';
import type {
  DataSchema,
  SchemaField,
  SchemaDataType,
  ISchemaDetector,
  SchemaDifference,
  IDataSource,
  DataRecord,
  ForeignKey,
  Index,
  Constraint
} from './types.js';

/**
 * Schema field implementation
 */
export class SchemaFieldImpl implements SchemaField {
  public name: string;
  public type: SchemaDataType;
  public nullable?: boolean;
  public unique?: boolean;
  public defaultValue?: unknown;
  public minValue?: number;
  public maxValue?: number;
  public minLength?: number;
  public maxLength?: number;
  public pattern?: string;
  public enum?: unknown[];
  public description?: string;

  constructor(name: string, type: SchemaDataType, options: Partial<SchemaField> = {}) {
    this.name = name;
    this.type = type;
    Object.assign(this, options);
  }

  public validate(value: unknown): boolean {
    // Null check
    if (value === null || value === undefined) {
      if (!this.nullable) {
        throw new ValidationException(`Field '${this.name}' cannot be null`);
      }
      return true;
    }

    // Type check
    if (!this.validateType(value)) {
      throw new ValidationException(
        `Field '${this.name}' expected type ${this.type}, got ${typeof value}`,
        this.name,
        value
      );
    }

    // Constraint checks
    this.validateConstraints(value);
    
    return true;
  }

  private validateType(value: unknown): boolean {
    switch (this.type) {
      case SchemaDataType.STRING:
        return typeof value === 'string';
      case SchemaDataType.INTEGER:
        return Number.isInteger(value);
      case SchemaDataType.FLOAT:
        return typeof value === 'number';
      case SchemaDataType.BOOLEAN:
        return typeof value === 'boolean';
      case SchemaDataType.DATETIME:
      case SchemaDataType.DATE:
      case SchemaDataType.TIME:
        return value instanceof Date || !isNaN(Date.parse(value as string));
      case SchemaDataType.ARRAY:
        return Array.isArray(value);
      case SchemaDataType.OBJECT:
        return typeof value === 'object' && !Array.isArray(value);
      case SchemaDataType.NULL:
        return value === null;
      default:
        return true;
    }
  }

  private validateConstraints(value: unknown): void {
    // Numeric constraints
    if (typeof value === 'number') {
      if (this.minValue !== undefined && value < this.minValue) {
        throw new ValidationException(
          `Field '${this.name}' value ${value} is below minimum ${this.minValue}`,
          this.name,
          value
        );
      }
      if (this.maxValue !== undefined && value > this.maxValue) {
        throw new ValidationException(
          `Field '${this.name}' value ${value} exceeds maximum ${this.maxValue}`,
          this.name,
          value
        );
      }
    }

    // String constraints
    if (typeof value === 'string') {
      if (this.minLength !== undefined && value.length < this.minLength) {
        throw new ValidationException(
          `Field '${this.name}' length ${value.length} is below minimum ${this.minLength}`,
          this.name,
          value
        );
      }
      if (this.maxLength !== undefined && value.length > this.maxLength) {
        throw new ValidationException(
          `Field '${this.name}' length ${value.length} exceeds maximum ${this.maxLength}`,
          this.name,
          value
        );
      }
      if (this.pattern && !new RegExp(this.pattern).test(value)) {
        throw new ValidationException(
          `Field '${this.name}' value does not match pattern ${this.pattern}`,
          this.name,
          value
        );
      }
    }

    // Enum constraint
    if (this.enum && !this.enum.includes(value)) {
      throw new ValidationException(
        `Field '${this.name}' value must be one of: ${this.enum.join(', ')}`,
        this.name,
        value
      );
    }
  }

  public toJSON(): SchemaField {
    return {
      name: this.name,
      type: this.type,
      nullable: this.nullable,
      unique: this.unique,
      defaultValue: this.defaultValue,
      minValue: this.minValue,
      maxValue: this.maxValue,
      minLength: this.minLength,
      maxLength: this.maxLength,
      pattern: this.pattern,
      enum: this.enum,
      description: this.description
    };
  }
}

/**
 * Data schema implementation
 */
export class DataSchemaImpl implements DataSchema {
  public name: string;
  public fields: SchemaField[];
  public primaryKey?: string | string[];
  public foreignKeys?: ForeignKey[];
  public indexes?: Index[];
  public constraints?: Constraint[];

  private fieldMap: Map<string, SchemaField>;

  constructor(name: string, fields: SchemaField[] = []) {
    this.name = name;
    this.fields = fields;
    this.fieldMap = new Map(fields.map(f => [f.name, f]));
  }

  public addField(field: SchemaField): void {
    this.fields.push(field);
    this.fieldMap.set(field.name, field);
  }

  public removeField(name: string): void {
    this.fields = this.fields.filter(f => f.name !== name);
    this.fieldMap.delete(name);
  }

  public getField(name: string): SchemaField | undefined {
    return this.fieldMap.get(name);
  }

  public hasField(name: string): boolean {
    return this.fieldMap.has(name);
  }

  public validate(record: DataRecord): boolean {
    const errors: string[] = [];

    // Check for required fields
    for (const field of this.fields) {
      if (!field.nullable && !(field.name in record)) {
        errors.push(`Missing required field: ${field.name}`);
        continue;
      }

      if (field.name in record) {
        try {
          if (field instanceof SchemaFieldImpl) {
            field.validate(record[field.name]);
          }
        } catch (error: any) {
          errors.push(error.message);
        }
      }
    }

    if (errors.length > 0) {
      throw new SchemaException(
        `Schema validation failed: ${errors.join('; ')}`,
        this.name,
        errors.reduce((acc, err) => {
          const field = err.split(':')[0];
          if (field) {
            acc[field] = acc[field] || [];
            acc[field].push(err);
          }
          return acc;
        }, {} as Record<string, string[]>)
      );
    }

    return true;
  }

  public toJSON(): DataSchema {
    return {
      name: this.name,
      fields: this.fields.map(f => 
        f instanceof SchemaFieldImpl ? f.toJSON() : f
      ),
      primaryKey: this.primaryKey,
      foreignKeys: this.foreignKeys,
      indexes: this.indexes,
      constraints: this.constraints
    };
  }

  public static fromJSON(json: DataSchema): DataSchemaImpl {
    const fields = json.fields.map(f => 
      new SchemaFieldImpl(f.name, f.type, f)
    );
    
    const schema = new DataSchemaImpl(json.name, fields);
    schema.primaryKey = json.primaryKey;
    schema.foreignKeys = json.foreignKeys;
    schema.indexes = json.indexes;
    schema.constraints = json.constraints;
    
    return schema;
  }
}

/**
 * Schema detector implementation
 */
export class SchemaDetector implements ISchemaDetector {
  private readonly sampleSize: number;
  private readonly strictMode: boolean;
  private readonly dateFormats: RegExp[];

  constructor(options: {
    sampleSize?: number;
    strictMode?: boolean;
    dateFormats?: RegExp[];
  } = {}) {
    this.sampleSize = options.sampleSize || 100;
    this.strictMode = options.strictMode || false;
    this.dateFormats = options.dateFormats || [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      /^\d{2}\/\d{2}\/\d{4}$/
    ];
  }

  public detect(sample: DataRecord[]): DataSchema {
    if (!sample || sample.length === 0) {
      throw new SchemaException('Cannot detect schema from empty sample');
    }

    const fieldStats = this.analyzeFields(sample);
    const fields = this.inferFields(fieldStats);

    return new DataSchemaImpl('detected', fields);
  }

  public async detectFromSource(
    source: IDataSource, 
    sampleSize?: number
  ): Promise<DataSchema> {
    const sample: DataRecord[] = [];
    const size = sampleSize || this.sampleSize;

    for await (const record of source.read({ limit: size })) {
      sample.push(record);
      if (sample.length >= size) break;
    }

    return this.detect(sample);
  }

  public merge(schemas: DataSchema[]): DataSchema {
    if (schemas.length === 0) {
      throw new SchemaException('Cannot merge empty schema list');
    }

    if (schemas.length === 1) {
      return schemas[0]!;
    }

    const mergedFields: Map<string, SchemaField> = new Map();
    
    for (const schema of schemas) {
      for (const field of schema.fields) {
        const existing = mergedFields.get(field.name);
        
        if (existing) {
          // Merge field definitions
          mergedFields.set(field.name, this.mergeFields(existing, field));
        } else {
          mergedFields.set(field.name, field);
        }
      }
    }

    return new DataSchemaImpl(
      'merged',
      Array.from(mergedFields.values())
    );
  }

  public compare(schema1: DataSchema, schema2: DataSchema): SchemaDifference[] {
    const differences: SchemaDifference[] = [];
    const fields1 = new Map(schema1.fields.map(f => [f.name, f]));
    const fields2 = new Map(schema2.fields.map(f => [f.name, f]));

    // Check for added fields
    for (const [name, field] of fields2) {
      if (!fields1.has(name)) {
        differences.push({
          type: 'added',
          field: name,
          newValue: field,
          description: `Field '${name}' added`
        });
      }
    }

    // Check for removed fields
    for (const [name, field] of fields1) {
      if (!fields2.has(name)) {
        differences.push({
          type: 'removed',
          field: name,
          oldValue: field,
          description: `Field '${name}' removed`
        });
      }
    }

    // Check for modified fields
    for (const [name, field1] of fields1) {
      const field2 = fields2.get(name);
      if (field2 && !this.fieldsEqual(field1, field2)) {
        differences.push({
          type: 'modified',
          field: name,
          oldValue: field1,
          newValue: field2,
          description: `Field '${name}' modified`
        });
      }
    }

    return differences;
  }

  private analyzeFields(sample: DataRecord[]): Map<string, FieldStats> {
    const fieldStats = new Map<string, FieldStats>();

    for (const record of sample) {
      for (const [key, value] of Object.entries(record)) {
        if (!fieldStats.has(key)) {
          fieldStats.set(key, {
            name: key,
            types: new Map(),
            nullCount: 0,
            uniqueValues: new Set(),
            minValue: null,
            maxValue: null,
            minLength: null,
            maxLength: null
          });
        }

        const stats = fieldStats.get(key)!;
        
        if (value === null || value === undefined) {
          stats.nullCount++;
        } else {
          const type = this.detectType(value);
          stats.types.set(type, (stats.types.get(type) || 0) + 1);
          stats.uniqueValues.add(JSON.stringify(value));

          // Update numeric stats
          if (typeof value === 'number') {
            stats.minValue = stats.minValue === null ? value : Math.min(stats.minValue, value);
            stats.maxValue = stats.maxValue === null ? value : Math.max(stats.maxValue, value);
          }

          // Update string stats
          if (typeof value === 'string') {
            const len = value.length;
            stats.minLength = stats.minLength === null ? len : Math.min(stats.minLength, len);
            stats.maxLength = stats.maxLength === null ? len : Math.max(stats.maxLength, len);
          }
        }
      }
    }

    return fieldStats;
  }

  private inferFields(fieldStats: Map<string, FieldStats>): SchemaField[] {
    const fields: SchemaField[] = [];

    for (const [name, stats] of fieldStats) {
      // Determine primary type
      let primaryType = SchemaDataType.STRING;
      let maxTypeCount = 0;

      for (const [type, count] of stats.types) {
        if (count > maxTypeCount) {
          maxTypeCount = count;
          primaryType = type;
        }
      }

      fields.push(new SchemaFieldImpl(name, primaryType, {
        nullable: stats.nullCount > 0,
        unique: stats.uniqueValues.size === (Array.from(stats.types.values()).reduce((a, b) => a + b, 0) + stats.nullCount),
        minValue: stats.minValue ?? undefined,
        maxValue: stats.maxValue ?? undefined,
        minLength: stats.minLength ?? undefined,
        maxLength: stats.maxLength ?? undefined
      }));
    }

    return fields;
  }

  private detectType(value: unknown): SchemaDataType {
    if (value === null || value === undefined) {
      return SchemaDataType.NULL;
    }

    if (typeof value === 'boolean') {
      return SchemaDataType.BOOLEAN;
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) ? SchemaDataType.INTEGER : SchemaDataType.FLOAT;
    }

    if (typeof value === 'string') {
      for (const pattern of this.dateFormats) {
        if (pattern.test(value)) {
          if (value.includes('T') || value.includes(' ')) {
            return SchemaDataType.DATETIME;
          }
          return SchemaDataType.DATE;
        }
      }
      return SchemaDataType.STRING;
    }

    if (Array.isArray(value)) {
      return SchemaDataType.ARRAY;
    }

    if (typeof value === 'object') {
      return SchemaDataType.OBJECT;
    }

    return SchemaDataType.UNKNOWN;
  }

  private mergeFields(field1: SchemaField, field2: SchemaField): SchemaField {
    // Prefer less restrictive type
    const type = this.getLessRestrictiveType(field1.type, field2.type);
    
    return new SchemaFieldImpl(field1.name, type, {
      nullable: field1.nullable || field2.nullable,
      unique: field1.unique && field2.unique,
      minValue: Math.min(field1.minValue ?? Infinity, field2.minValue ?? Infinity),
      maxValue: Math.max(field1.maxValue ?? -Infinity, field2.maxValue ?? -Infinity),
      minLength: Math.min(field1.minLength ?? Infinity, field2.minLength ?? Infinity),
      maxLength: Math.max(field1.maxLength ?? 0, field2.maxLength ?? 0)
    });
  }

  private getLessRestrictiveType(type1: SchemaDataType, type2: SchemaDataType): SchemaDataType {
    if (type1 === type2) return type1;
    
    // Prefer string as most general
    if (type1 === SchemaDataType.STRING || type2 === SchemaDataType.STRING) {
      return SchemaDataType.STRING;
    }
    
    // Integer can be promoted to float
    if ((type1 === SchemaDataType.INTEGER && type2 === SchemaDataType.FLOAT) ||
        (type1 === SchemaDataType.FLOAT && type2 === SchemaDataType.INTEGER)) {
      return SchemaDataType.FLOAT;
    }
    
    return SchemaDataType.STRING;
  }

  private fieldsEqual(field1: SchemaField, field2: SchemaField): boolean {
    return field1.type === field2.type &&
           field1.nullable === field2.nullable &&
           field1.unique === field2.unique;
  }
}

interface FieldStats {
  name: string;
  types: Map<SchemaDataType, number>;
  nullCount: number;
  uniqueValues: Set<string>;
  minValue: number | null;
  maxValue: number | null;
  minLength: number | null;
  maxLength: number | null;
}