// processing/transformers.js
/**
 * Data transformation utilities for the processing module.
 * 
 * This module provides various transformers for data manipulation,
 * cleaning, normalization, and conversion.
 */

import { BaseTransformer } from '../core/base.js';
import { TransformationError } from '../core/exceptions.js';
import { registerComponent, ComponentType } from '../core/registry.js';

/**
 * Field mapper transformer
 */
export class FieldMapper extends BaseTransformer {
    constructor(mapping) {
        super('FieldMapper');
        this.mapping = mapping;
    }

    async transform(data) {
        if (!data || typeof data !== 'object') {
            throw new TransformationError('FieldMapper requires object input', this.name);
        }

        const result = {};
        
        for (const [sourceField, targetField] of Object.entries(this.mapping)) {
            if (sourceField in data) {
                // Support nested field paths
                if (targetField.includes('.')) {
                    this._setNestedValue(result, targetField, data[sourceField]);
                } else {
                    result[targetField] = data[sourceField];
                }
            }
        }

        return result;
    }

    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in current)) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    canTransform(data) {
        return typeof data === 'object' && data !== null;
    }
}

/**
 * Field filter transformer
 */
export class FieldFilter extends BaseTransformer {
    constructor(fieldsToKeep = null, fieldsToRemove = null) {
        super('FieldFilter');
        this.fieldsToKeep = fieldsToKeep ? new Set(fieldsToKeep) : null;
        this.fieldsToRemove = fieldsToRemove ? new Set(fieldsToRemove) : null;
    }

    async transform(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const result = {};

        for (const [key, value] of Object.entries(data)) {
            // Check if field should be kept
            if (this.fieldsToKeep && !this.fieldsToKeep.has(key)) {
                continue;
            }
            
            // Check if field should be removed
            if (this.fieldsToRemove && this.fieldsToRemove.has(key)) {
                continue;
            }

            result[key] = value;
        }

        return result;
    }

    canTransform(data) {
        return typeof data === 'object' && data !== null;
    }
}

/**
 * Type converter transformer
 */
export class TypeConverter extends BaseTransformer {
    constructor(conversions) {
        super('TypeConverter');
        this.conversions = conversions;
    }

    async transform(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const result = { ...data };

        for (const [field, targetType] of Object.entries(this.conversions)) {
            if (field in result) {
                result[field] = this._convertType(result[field], targetType);
            }
        }

        return result;
    }

    _convertType(value, targetType) {
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
                return parseInt(value, 10);
            
            case 'boolean':
            case 'bool':
                return Boolean(value);
            
            case 'date':
            case 'datetime':
                return new Date(value);
            
            case 'json':
                return typeof value === 'string' ? JSON.parse(value) : value;
            
            case 'array':
                return Array.isArray(value) ? value : [value];
            
            default:
                return value;
        }
    }

    canTransform(data) {
        return typeof data === 'object' && data !== null;
    }
}

/**
 * String normalizer transformer
 */
export class StringNormalizer extends BaseTransformer {
    constructor(options = {}) {
        super('StringNormalizer');
        this.lowercase = options.lowercase || false;
        this.uppercase = options.uppercase || false;
        this.trim = options.trim ?? true;
        this.removeExtraSpaces = options.removeExtraSpaces || false;
        this.removeSpecialChars = options.removeSpecialChars || false;
        this.fields = options.fields || null; // Apply to specific fields only
    }

    async transform(data) {
        if (typeof data === 'string') {
            return this._normalizeString(data);
        }

        if (typeof data === 'object' && data !== null) {
            const result = { ...data };
            
            for (const [key, value] of Object.entries(result)) {
                if (this.fields && !this.fields.includes(key)) {
                    continue;
                }

                if (typeof value === 'string') {
                    result[key] = this._normalizeString(value);
                }
            }

            return result;
        }

        return data;
    }

    _normalizeString(str) {
        let result = str;

        if (this.trim) {
            result = result.trim();
        }

        if (this.removeExtraSpaces) {
            result = result.replace(/\s+/g, ' ');
        }

        if (this.removeSpecialChars) {
            result = result.replace(/[^a-zA-Z0-9\s]/g, '');
        }

        if (this.lowercase) {
            result = result.toLowerCase();
        } else if (this.uppercase) {
            result = result.toUpperCase();
        }

        return result;
    }

    canTransform(data) {
        return true;
    }
}

/**
 * Date formatter transformer
 */
export class DateFormatter extends BaseTransformer {
    constructor(format = 'ISO', fields = null) {
        super('DateFormatter');
        this.format = format;
        this.fields = fields;
    }

    async transform(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const result = { ...data };

        for (const [key, value] of Object.entries(result)) {
            if (this.fields && !this.fields.includes(key)) {
                continue;
            }

            if (this._isDateLike(value)) {
                result[key] = this._formatDate(value);
            }
        }

        return result;
    }

    _isDateLike(value) {
        if (value instanceof Date) return true;
        if (typeof value === 'string') {
            const date = new Date(value);
            return !isNaN(date.getTime());
        }
        return false;
    }

    _formatDate(value) {
        const date = value instanceof Date ? value : new Date(value);

        switch (this.format) {
            case 'ISO':
                return date.toISOString();
            
            case 'UTC':
                return date.toUTCString();
            
            case 'timestamp':
                return date.getTime();
            
            case 'date':
                return date.toLocaleDateString();
            
            case 'time':
                return date.toLocaleTimeString();
            
            case 'datetime':
                return date.toLocaleString();
            
            default:
                // Custom format string
                return this._customFormat(date, this.format);
        }
    }

    _customFormat(date, format) {
        const replacements = {
            'YYYY': date.getFullYear(),
            'MM': String(date.getMonth() + 1).padStart(2, '0'),
            'DD': String(date.getDate()).padStart(2, '0'),
            'HH': String(date.getHours()).padStart(2, '0'),
            'mm': String(date.getMinutes()).padStart(2, '0'),
            'ss': String(date.getSeconds()).padStart(2, '0')
        };

        let result = format;
        for (const [key, value] of Object.entries(replacements)) {
            result = result.replace(key, value);
        }

        return result;
    }

    canTransform(data) {
        return typeof data === 'object' && data !== null;
    }
}

/**
 * Value replacer transformer
 */
export class ValueReplacer extends BaseTransformer {
    constructor(replacements, fields = null) {
        super('ValueReplacer');
        this.replacements = replacements;
        this.fields = fields;
    }

    async transform(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const result = { ...data };

        for (const [key, value] of Object.entries(result)) {
            if (this.fields && !this.fields.includes(key)) {
                continue;
            }

            if (value in this.replacements) {
                result[key] = this.replacements[value];
            }
        }

        return result;
    }

    canTransform(data) {
        return typeof data === 'object' && data !== null;
    }
}

/**
 * Array flattener transformer
 */
export class ArrayFlattener extends BaseTransformer {
    constructor(fields = null, separator = '_') {
        super('ArrayFlattener');
        this.fields = fields;
        this.separator = separator;
    }

    async transform(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const result = {};

        for (const [key, value] of Object.entries(data)) {
            if (this.fields && !this.fields.includes(key)) {
                result[key] = value;
                continue;
            }

            if (Array.isArray(value)) {
                // Flatten array into separate fields
                value.forEach((item, index) => {
                    result[`${key}${this.separator}${index}`] = item;
                });
            } else if (typeof value === 'object' && value !== null) {
                // Recursively flatten nested objects
                const flattened = await this.transform(value);
                for (const [nestedKey, nestedValue] of Object.entries(flattened)) {
                    result[`${key}${this.separator}${nestedKey}`] = nestedValue;
                }
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    canTransform(data) {
        return typeof data === 'object' && data !== null;
    }
}

/**
 * Data enricher transformer
 */
export class DataEnricher extends BaseTransformer {
    constructor(enrichments) {
        super('DataEnricher');
        this.enrichments = enrichments;
    }

    async transform(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const result = { ...data };

        for (const [field, enrichment] of Object.entries(this.enrichments)) {
            if (typeof enrichment === 'function') {
                result[field] = await enrichment(data);
            } else {
                result[field] = enrichment;
            }
        }

        return result;
    }

    canTransform(data) {
        return typeof data === 'object' && data !== null;
    }
}

/**
 * Conditional transformer
 */
export class ConditionalTransformer extends BaseTransformer {
    constructor(condition, trueTransformer, falseTransformer = null) {
        super('ConditionalTransformer');
        this.condition = condition;
        this.trueTransformer = trueTransformer;
        this.falseTransformer = falseTransformer;
    }

    async transform(data) {
        const conditionMet = typeof this.condition === 'function' 
            ? await this.condition(data)
            : Boolean(this.condition);

        if (conditionMet && this.trueTransformer) {
            return await this.trueTransformer.transform(data);
        } else if (!conditionMet && this.falseTransformer) {
            return await this.falseTransformer.transform(data);
        }

        return data;
    }

    canTransform(data) {
        return true;
    }
}

/**
 * Chain transformer - applies multiple transformers in sequence
 */
export class ChainTransformer extends BaseTransformer {
    constructor(transformers) {
        super('ChainTransformer');
        this.transformers = transformers;
    }

    async transform(data) {
        let result = data;

        for (const transformer of this.transformers) {
            result = await transformer.transform(result);
        }

        return result;
    }

    canTransform(data) {
        return this.transformers.length > 0 && 
               this.transformers[0].canTransform(data);
    }
}

/**
 * Create a custom transformer from a function
 */
export function createTransformer(name, transformFn, canTransformFn = null) {
    return new class extends BaseTransformer {
        constructor() {
            super(name);
        }

        async transform(data) {
            return await transformFn(data);
        }

        canTransform(data) {
            return canTransformFn ? canTransformFn(data) : true;
        }
    };
}