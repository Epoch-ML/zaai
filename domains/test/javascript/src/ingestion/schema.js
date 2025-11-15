// ingestion/schema.js
/**
 * Schema detection and validation for the ingestion module.
 * 
 * This module provides utilities for detecting data schemas,
 * validating data against schemas, and schema transformation.
 */

import { SchemaError, ValidationError } from '../core/exceptions.js';
import { BaseValidator } from '../core/validators.js';

// Data types that can be detected
export const DataType = Object.freeze({
    STRING: 'string',
    INTEGER: 'integer',
    FLOAT: 'float',
    BOOLEAN: 'boolean',
    DATETIME: 'datetime',
    DATE: 'date',
    TIME: 'time',
    ARRAY: 'array',
    OBJECT: 'object',
    NULL: 'null',
    UNKNOWN: 'unknown'
});

/**
 * Represents a field in a data schema
 */
export class SchemaField {
    constructor(name, type, options = {}) {
        this.name = name;
        this.type = type;
        this.nullable = options.nullable ?? true;
        this.unique = options.unique || false;
        this.primaryKey = options.primaryKey || false;
        this.foreignKey = options.foreignKey || null;
        this.defaultValue = options.defaultValue || null;
        this.minValue = options.minValue || null;
        this.maxValue = options.maxValue || null;
        this.minLength = options.minLength || null;
        this.maxLength = options.maxLength || null;
        this.pattern = options.pattern || null;
        this.enum = options.enum || null;
        this.description = options.description || '';
    }

    validate(value) {
        // Check null values
        if (value === null || value === undefined) {
            if (!this.nullable) {
                throw new ValidationError(`Field '${this.name}' cannot be null`);
            }
            return true;
        }

        // Check type
        if (!this._validateType(value)) {
            throw new ValidationError(
                `Field '${this.name}' expected type ${this.type}, got ${typeof value}`
            );
        }

        // Check constraints
        this._validateConstraints(value);

        return true;
    }

    _validateType(value) {
        switch (this.type) {
            case DataType.STRING:
                return typeof value === 'string';
            case DataType.INTEGER:
                return Number.isInteger(value);
            case DataType.FLOAT:
                return typeof value === 'number';
            case DataType.BOOLEAN:
                return typeof value === 'boolean';
            case DataType.DATETIME:
            case DataType.DATE:
            case DataType.TIME:
                return value instanceof Date || !isNaN(Date.parse(value));
            case DataType.ARRAY:
                return Array.isArray(value);
            case DataType.OBJECT:
                return typeof value === 'object' && !Array.isArray(value);
            default:
                return true;
        }
    }

    _validateConstraints(value) {
        // Numeric constraints
        if (typeof value === 'number') {
            if (this.minValue !== null && value < this.minValue) {
                throw new ValidationError(
                    `Field '${this.name}' value ${value} is below minimum ${this.minValue}`
                );
            }
            if (this.maxValue !== null && value > this.maxValue) {
                throw new ValidationError(
                    `Field '${this.name}' value ${value} exceeds maximum ${this.maxValue}`
                );
            }
        }

        // String constraints
        if (typeof value === 'string') {
            if (this.minLength !== null && value.length < this.minLength) {
                throw new ValidationError(
                    `Field '${this.name}' length ${value.length} is below minimum ${this.minLength}`
                );
            }
            if (this.maxLength !== null && value.length > this.maxLength) {
                throw new ValidationError(
                    `Field '${this.name}' length ${value.length} exceeds maximum ${this.maxLength}`
                );
            }
            if (this.pattern && !new RegExp(this.pattern).test(value)) {
                throw new ValidationError(
                    `Field '${this.name}' value does not match pattern ${this.pattern}`
                );
            }
        }

        // Enum constraint
        if (this.enum && !this.enum.includes(value)) {
            throw new ValidationError(
                `Field '${this.name}' value must be one of: ${this.enum.join(', ')}`
            );
        }
    }

    toJSON() {
        return {
            name: this.name,
            type: this.type,
            nullable: this.nullable,
            unique: this.unique,
            primaryKey: this.primaryKey,
            foreignKey: this.foreignKey,
            defaultValue: this.defaultValue,
            constraints: {
                minValue: this.minValue,
                maxValue: this.maxValue,
                minLength: this.minLength,
                maxLength: this.maxLength,
                pattern: this.pattern,
                enum: this.enum
            },
            description: this.description
        };
    }
}

/**
 * Represents a table or collection schema
 */
export class TableSchema {
    constructor(name, fields = [], options = {}) {
        this.name = name;
        this.fields = new Map();
        this.primaryKeys = [];
        this.foreignKeys = [];
        this.indexes = options.indexes || [];
        this.constraints = options.constraints || [];
        this.description = options.description || '';

        // Add fields
        for (const field of fields) {
            this.addField(field);
        }
    }

    addField(field) {
        if (!(field instanceof SchemaField)) {
            field = new SchemaField(field.name, field.type, field);
        }

        this.fields.set(field.name, field);

        if (field.primaryKey) {
            this.primaryKeys.push(field.name);
        }

        if (field.foreignKey) {
            this.foreignKeys.push({
                field: field.name,
                reference: field.foreignKey
            });
        }
    }

    removeField(name) {
        this.fields.delete(name);
        this.primaryKeys = this.primaryKeys.filter(pk => pk !== name);
        this.foreignKeys = this.foreignKeys.filter(fk => fk.field !== name);
    }

    getField(name) {
        return this.fields.get(name);
    }

    hasField(name) {
        return this.fields.has(name);
    }

    validate(record) {
        const errors = [];

        // Check for required fields
        for (const [name, field] of this.fields) {
            if (!field.nullable && !(name in record)) {
                errors.push(`Missing required field: ${name}`);
                continue;
            }

            if (name in record) {
                try {
                    field.validate(record[name]);
                } catch (error) {
                    errors.push(error.message);
                }
            }
        }

        if (errors.length > 0) {
            throw new SchemaError(
                `Schema validation failed: ${errors.join('; ')}`,
                this.name
            );
        }

        return true;
    }

    toJSON() {
        return {
            name: this.name,
            fields: Array.from(this.fields.values()).map(f => f.toJSON()),
            primaryKeys: this.primaryKeys,
            foreignKeys: this.foreignKeys,
            indexes: this.indexes,
            constraints: this.constraints,
            description: this.description
        };
    }

    static fromJSON(json) {
        const fields = json.fields.map(f => 
            new SchemaField(f.name, f.type, f)
        );
        
        return new TableSchema(json.name, fields, {
            indexes: json.indexes,
            constraints: json.constraints,
            description: json.description
        });
    }
}

/**
 * Schema detector for automatic schema inference
 */
export class SchemaDetector {
    constructor(options = {}) {
        this.sampleSize = options.sampleSize || 100;
        this.strictMode = options.strictMode || false;
        this.dateFormats = options.dateFormats || [
            /^\d{4}-\d{2}-\d{2}$/,
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
            /^\d{2}\/\d{2}\/\d{4}$/
        ];
    }

    detectFromSample(data) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new SchemaError('Cannot detect schema from empty or non-array data');
        }

        const sample = data.slice(0, this.sampleSize);
        const fieldStats = this._analyzeFields(sample);
        const fields = this._inferFields(fieldStats);

        return new TableSchema('detected', fields);
    }

    _analyzeFields(sample) {
        const fieldStats = new Map();

        for (const record of sample) {
            if (typeof record !== 'object' || record === null) continue;

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

                const stats = fieldStats.get(key);

                if (value === null || value === undefined) {
                    stats.nullCount++;
                } else {
                    const type = this._detectType(value);
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

    _detectType(value) {
        if (value === null || value === undefined) {
            return DataType.NULL;
        }

        if (typeof value === 'boolean') {
            return DataType.BOOLEAN;
        }

        if (typeof value === 'number') {
            return Number.isInteger(value) ? DataType.INTEGER : DataType.FLOAT;
        }

        if (typeof value === 'string') {
            // Check for date/time patterns
            for (const pattern of this.dateFormats) {
                if (pattern.test(value)) {
                    if (value.includes('T') || value.includes(' ')) {
                        return DataType.DATETIME;
                    }
                    return DataType.DATE;
                }
            }

            // Check for numeric strings
            if (/^-?\d+$/.test(value)) {
                return DataType.INTEGER;
            }
            if (/^-?\d+\.\d+$/.test(value)) {
                return DataType.FLOAT;
            }
            if (/^(true|false)$/i.test(value)) {
                return DataType.BOOLEAN;
            }

            return DataType.STRING;
        }

        if (Array.isArray(value)) {
            return DataType.ARRAY;
        }

        if (typeof value === 'object') {
            return DataType.OBJECT;
        }

        return DataType.UNKNOWN;
    }

    _inferFields(fieldStats) {
        const fields = [];

        for (const [name, stats] of fieldStats) {
            // Determine primary type
            let primaryType = DataType.STRING;
            let maxTypeCount = 0;

            for (const [type, count] of stats.types) {
                if (count > maxTypeCount) {
                    maxTypeCount = count;
                    primaryType = type;
                }
            }

            // Create field with inferred properties
            const field = new SchemaField(name, primaryType, {
                nullable: stats.nullCount > 0,
                unique: stats.uniqueValues.size === (stats.types.size + stats.nullCount),
                minValue: stats.minValue,
                maxValue: stats.maxValue,
                minLength: stats.minLength,
                maxLength: stats.maxLength
            });

            fields.push(field);
        }

        return fields;
    }
}

/**
 * Schema validator
 */
export class SchemaValidator extends BaseValidator {
    constructor(schema, strict = false) {
        super(strict);
        this.schema = schema instanceof TableSchema ? schema : TableSchema.fromJSON(schema);
    }

    validate(record) {
        try {
            return this.schema.validate(record);
        } catch (error) {
            this.addError(error.message);
            return false;
        }
    }
}

/**
 * Utility function to detect schema from data
 */
export function detectSchema(data, options = {}) {
    const detector = new SchemaDetector(options);
    return detector.detectFromSample(data);
}

/**
 * Utility function to validate data against schema
 */
export function validateSchema(data, schema) {
    const validator = new SchemaValidator(schema);
    
    if (Array.isArray(data)) {
        const errors = [];
        for (let i = 0; i < data.length; i++) {
            if (!validator.validate(data[i])) {
                errors.push(`Record ${i}: ${validator.getErrors().join(', ')}`);
                validator.clearErrors();
            }
        }
        if (errors.length > 0) {
            throw new SchemaError(`Validation failed: ${errors.join('; ')}`);
        }
        return true;
    } else {
        return validator.validate(data);
    }
}

/**
 * Convert schema between formats
 */
export function convertSchema(schema, targetFormat) {
    // Implement schema conversion logic for different formats
    // e.g., JSON Schema, Avro, Parquet, etc.
    switch (targetFormat) {
        case 'jsonschema':
            return convertToJSONSchema(schema);
        case 'sql':
            return convertToSQL(schema);
        default:
            throw new SchemaError(`Unsupported target format: ${targetFormat}`);
    }
}

function convertToJSONSchema(schema) {
    const jsonSchema = {
        type: 'object',
        properties: {},
        required: []
    };

    for (const [name, field] of schema.fields) {
        const property = {
            type: mapTypeToJSONSchema(field.type)
        };

        if (field.description) {
            property.description = field.description;
        }

        if (field.enum) {
            property.enum = field.enum;
        }

        if (field.pattern) {
            property.pattern = field.pattern;
        }

        jsonSchema.properties[name] = property;

        if (!field.nullable) {
            jsonSchema.required.push(name);
        }
    }

    return jsonSchema;
}

function mapTypeToJSONSchema(type) {
    const typeMap = {
        [DataType.STRING]: 'string',
        [DataType.INTEGER]: 'integer',
        [DataType.FLOAT]: 'number',
        [DataType.BOOLEAN]: 'boolean',
        [DataType.DATETIME]: 'string',
        [DataType.DATE]: 'string',
        [DataType.TIME]: 'string',
        [DataType.ARRAY]: 'array',
        [DataType.OBJECT]: 'object',
        [DataType.NULL]: 'null'
    };
    return typeMap[type] || 'string';
}

function convertToSQL(schema) {
    const columns = [];
    
    for (const [name, field] of schema.fields) {
        let columnDef = `${name} ${mapTypeToSQL(field.type)}`;
        
        if (!field.nullable) {
            columnDef += ' NOT NULL';
        }
        
        if (field.primaryKey) {
            columnDef += ' PRIMARY KEY';
        }
        
        if (field.unique) {
            columnDef += ' UNIQUE';
        }
        
        if (field.defaultValue !== null) {
            columnDef += ` DEFAULT ${field.defaultValue}`;
        }
        
        columns.push(columnDef);
    }
    
    return `CREATE TABLE ${schema.name} (\n  ${columns.join(',\n  ')}\n);`;
}

function mapTypeToSQL(type) {
    const typeMap = {
        [DataType.STRING]: 'VARCHAR(255)',
        [DataType.INTEGER]: 'INTEGER',
        [DataType.FLOAT]: 'FLOAT',
        [DataType.BOOLEAN]: 'BOOLEAN',
        [DataType.DATETIME]: 'TIMESTAMP',
        [DataType.DATE]: 'DATE',
        [DataType.TIME]: 'TIME',
        [DataType.ARRAY]: 'JSON',
        [DataType.OBJECT]: 'JSON',
        [DataType.NULL]: 'VARCHAR(255)'
    };
    return typeMap[type] || 'VARCHAR(255)';
}