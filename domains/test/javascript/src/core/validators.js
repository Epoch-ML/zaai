// core/validators.js
/**
 * Validation utilities for the analytics platform.
 * 
 * This module provides validators for data types, schemas, configurations,
 * and other platform components.
 */

import path from 'path';
import fs from 'fs';
import { ValidationError, SchemaError } from './exceptions.js';

/**
 * Represents a validation rule
 */
export class ValidationRule {
    constructor(name, validator, errorMessage, required = true) {
        this.name = name;
        this.validator = validator;
        this.errorMessage = errorMessage;
        this.required = required;
    }

    validate(value) {
        if (value === null || value === undefined) {
            if (this.required) {
                throw new ValidationError(`${this.name}: Value is required`);
            }
            return true;
        }

        try {
            const result = this.validator(value);
            if (!result) {
                throw new ValidationError(`${this.name}: ${this.errorMessage}`);
            }
            return true;
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new ValidationError(`${this.name}: Validation failed - ${error.message}`);
        }
    }
}

/**
 * Abstract base class for validators
 */
export class BaseValidator {
    constructor(strict = false) {
        this.strict = strict;
        this.errors = [];
    }

    /**
     * Validate a value
     * @abstract
     */
    validate(value) {
        throw new Error('Method validate() must be implemented');
    }

    /**
     * Make validator callable as a function
     */
    call(value) {
        return this.validate(value);
    }

    addError(error) {
        this.errors.push(error);
        if (this.strict) {
            throw new ValidationError(error);
        }
    }

    clearErrors() {
        this.errors = [];
    }

    getErrors() {
        return [...this.errors];
    }

    hasErrors() {
        return this.errors.length > 0;
    }
}

/**
 * Validator for checking data types
 */
export class TypeValidator extends BaseValidator {
    constructor(expectedType, strict = false) {
        super(strict);
        this.expectedType = expectedType;
    }

    validate(value) {
        const actualType = typeof value;
        
        // Handle special cases
        if (this.expectedType === 'array' && !Array.isArray(value)) {
            this.addError(`Expected array, got ${actualType}`);
            return false;
        }
        
        if (this.expectedType === 'null' && value !== null) {
            this.addError(`Expected null, got ${actualType}`);
            return false;
        }
        
        if (this.expectedType !== 'array' && this.expectedType !== 'null') {
            if (actualType !== this.expectedType) {
                this.addError(`Expected type ${this.expectedType}, got ${actualType}`);
                return false;
            }
        }
        
        return true;
    }
}

/**
 * Validator for numeric ranges
 */
export class RangeValidator extends BaseValidator {
    constructor(minValue = null, maxValue = null, strict = false) {
        super(strict);
        this.minValue = minValue;
        this.maxValue = maxValue;
    }

    validate(value) {
        if (typeof value !== 'number' && typeof value !== 'bigint') {
            this.addError(`Value must be numeric, got ${typeof value}`);
            return false;
        }

        const numValue = Number(value);

        if (this.minValue !== null && numValue < this.minValue) {
            this.addError(`Value ${numValue} is below minimum ${this.minValue}`);
            return false;
        }

        if (this.maxValue !== null && numValue > this.maxValue) {
            this.addError(`Value ${numValue} is above maximum ${this.maxValue}`);
            return false;
        }

        return true;
    }
}

/**
 * Validator for string patterns using regex
 */
export class PatternValidator extends BaseValidator {
    constructor(pattern, strict = false) {
        super(strict);
        this.pattern = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    }

    validate(value) {
        if (typeof value !== 'string') {
            this.addError(`Value must be string, got ${typeof value}`);
            return false;
        }

        if (!this.pattern.test(value)) {
            this.addError(`Value '${value}' does not match pattern ${this.pattern}`);
            return false;
        }

        return true;
    }
}

/**
 * Validator for object schemas
 */
export class SchemaValidator extends BaseValidator {
    constructor(schema, strict = false) {
        super(strict);
        this.schema = schema;
    }

    validate(value) {
        if (typeof value !== 'object' || value === null) {
            this.addError(`Value must be object, got ${typeof value}`);
            return false;
        }

        let valid = true;

        // Check required fields
        for (const [field, rule] of Object.entries(this.schema)) {
            if (rule instanceof ValidationRule) {
                if (rule.required && !(field in value)) {
                    this.addError(`Required field '${field}' is missing`);
                    valid = false;
                } else if (field in value) {
                    try {
                        rule.validate(value[field]);
                    } catch (error) {
                        this.addError(`Field '${field}': ${error.message}`);
                        valid = false;
                    }
                }
            } else if (typeof rule === 'function') {
                // Simple type check
                if (!(field in value)) {
                    this.addError(`Required field '${field}' is missing`);
                    valid = false;
                } else if (rule.name && typeof value[field] !== rule.name.toLowerCase()) {
                    this.addError(
                        `Field '${field}' expected type ${rule.name}, ` +
                        `got ${typeof value[field]}`
                    );
                    valid = false;
                }
            }
        }

        // Check for unexpected fields in strict mode
        if (this.strict) {
            const schemaKeys = new Set(Object.keys(this.schema));
            const unexpected = Object.keys(value).filter(key => !schemaKeys.has(key));
            if (unexpected.length > 0) {
                this.addError(`Unexpected fields: ${unexpected.join(', ')}`);
                valid = false;
            }
        }

        return valid;
    }
}

/**
 * Validator for file paths and properties
 */
export class FileValidator extends BaseValidator {
    constructor(options = {}, strict = false) {
        super(strict);
        this.mustExist = options.mustExist ?? true;
        this.allowedExtensions = options.allowedExtensions || null;
        this.maxSizeBytes = options.maxSizeBytes || null;
    }

    validate(value) {
        let filePath;
        
        if (typeof value === 'string') {
            filePath = path.resolve(value);
        } else if (value && typeof value === 'object' && value.path) {
            filePath = path.resolve(value.path);
        } else {
            this.addError(`Value must be string or path object, got ${typeof value}`);
            return false;
        }

        if (this.mustExist && !fs.existsSync(filePath)) {
            this.addError(`File does not exist: ${filePath}`);
            return false;
        }

        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            
            if (!stats.isFile()) {
                this.addError(`Path is not a file: ${filePath}`);
                return false;
            }

            if (this.allowedExtensions) {
                const ext = path.extname(filePath);
                if (!this.allowedExtensions.includes(ext)) {
                    this.addError(
                        `File extension '${ext}' not in allowed extensions: ` +
                        `${this.allowedExtensions.join(', ')}`
                    );
                    return false;
                }
            }

            if (this.maxSizeBytes && stats.size > this.maxSizeBytes) {
                this.addError(
                    `File size ${stats.size} bytes exceeds maximum ${this.maxSizeBytes} bytes`
                );
                return false;
            }
        }

        return true;
    }
}

/**
 * Composite validator that combines multiple validators
 */
export class CompositeValidator extends BaseValidator {
    constructor(validators, requireAll = true, strict = false) {
        super(strict);
        this.validators = validators;
        this.requireAll = requireAll;
    }

    validate(value) {
        const results = [];

        for (const validator of this.validators) {
            try {
                const result = validator.validate(value);
                results.push(result);
                
                if (!result) {
                    this.errors.push(...validator.getErrors());
                    if (this.requireAll) {
                        return false;
                    }
                }
            } catch (error) {
                this.addError(error.message);
                if (this.requireAll) {
                    return false;
                }
            }
        }

        if (this.requireAll) {
            return results.every(r => r);
        } else {
            return results.some(r => r);
        }
    }
}

// Utility validation functions

/**
 * Validate email address format
 */
export function validateEmail(email) {
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(email);
}

/**
 * Validate URL format
 */
export function validateURL(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate ISO date string
 */
export function validateISODate(dateStr) {
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date) && date.toISOString() === dateStr;
}

/**
 * Validate JSON string
 */
export function validateJSON(jsonStr) {
    try {
        JSON.parse(jsonStr);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create a custom validator function
 */
export function createValidator(validationFn, errorMessage = 'Validation failed') {
    return class CustomValidator extends BaseValidator {
        validate(value) {
            try {
                const result = validationFn(value);
                if (!result) {
                    this.addError(errorMessage);
                    return false;
                }
                return true;
            } catch (error) {
                this.addError(`${errorMessage}: ${error.message}`);
                return false;
            }
        }
    };
}

/**
 * Validate data against JSON schema (simplified)
 */
export function validateJSONSchema(data, schema) {
    const validator = new SchemaValidator(schema, true);
    return validator.validate(data);
}

/**
 * Chain multiple validators
 */
export function chain(...validators) {
    return new CompositeValidator(validators, true);
}

/**
 * At least one validator must pass
 */
export function oneOf(...validators) {
    return new CompositeValidator(validators, false);
}