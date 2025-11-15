// src/core/validators.ts
/**
 * Validation utilities for the analytics platform.
 */

import { BaseValidator } from './base.js';
import { ValidationException } from './exceptions.js';
import type { 
  ValidationRule, 
  ValidationResult,
  Predicate,
  EmailAddress,
  URL,
  UUID,
  Nullable
} from '../types.js';

/**
 * Validation rule builder
 */
export class ValidationRuleBuilder<T> {
  private rules: ValidationRule<T>[] = [];

  public addRule(validate: Predicate<T>, message: string): this {
    this.rules.push({ validate, message });
    return this;
  }

  public required(message = 'Value is required'): this {
    return this.addRule(
      (value) => value !== null && value !== undefined,
      message
    );
  }

  public min(minValue: number, message = `Value must be at least ${minValue}`): this {
    return this.addRule(
      (value) => typeof value === 'number' && value >= minValue,
      message
    );
  }

  public max(maxValue: number, message = `Value must be at most ${maxValue}`): this {
    return this.addRule(
      (value) => typeof value === 'number' && value <= maxValue,
      message
    );
  }

  public minLength(length: number, message = `Length must be at least ${length}`): this {
    return this.addRule(
      (value) => {
        if (typeof value === 'string') return value.length >= length;
        if (Array.isArray(value)) return value.length >= length;
        return false;
      },
      message
    );
  }

  public maxLength(length: number, message = `Length must be at most ${length}`): this {
    return this.addRule(
      (value) => {
        if (typeof value === 'string') return value.length <= length;
        if (Array.isArray(value)) return value.length <= length;
        return false;
      },
      message
    );
  }

  public pattern(regex: RegExp, message = 'Value does not match pattern'): this {
    return this.addRule(
      (value) => typeof value === 'string' && regex.test(value),
      message
    );
  }

  public email(message = 'Invalid email address'): this {
    return this.pattern(
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      message
    );
  }

  public url(message = 'Invalid URL'): this {
    return this.addRule(
      (value) => {
        if (typeof value !== 'string') return false;
        try {
          new globalThis.URL(value);
          return true;
        } catch {
          return false;
        }
      },
      message
    );
  }

  public uuid(message = 'Invalid UUID'): this {
    return this.pattern(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      message
    );
  }

  public custom(validate: Predicate<T>, message: string): this {
    return this.addRule(validate, message);
  }

  public build(): ValidationRule<T>[] {
    return [...this.rules];
  }

  public validate(value: T): ValidationResult {
    const errors: string[] = [];
    
    for (const rule of this.rules) {
      if (!rule.validate(value)) {
        errors.push(rule.message);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Type validator
 */
export class TypeValidator<T = unknown> extends BaseValidator<T> {
  constructor(
    private readonly expectedType: string,
    private readonly typeCheck: Predicate<unknown>
  ) {
    super(`TypeValidator<${expectedType}>`);
  }

  public validate(value: T): boolean {
    const valid = this.typeCheck(value);
    if (!valid) {
      this.addError(`Expected type ${this.expectedType}, got ${typeof value}`);
    }
    return valid;
  }

  public async initialize(): Promise<void> {
    // No initialization needed
  }

  public async cleanup(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Range validator
 */
export class RangeValidator extends BaseValidator<number> {
  constructor(
    private readonly min?: number,
    private readonly max?: number
  ) {
    super('RangeValidator');
  }

  public validate(value: number): boolean {
    this.clearErrors();

    if (typeof value !== 'number' || isNaN(value)) {
      this.addError('Value must be a valid number');
      return false;
    }

    if (this.min !== undefined && value < this.min) {
      this.addError(`Value ${value} is below minimum ${this.min}`);
      return false;
    }

    if (this.max !== undefined && value > this.max) {
      this.addError(`Value ${value} is above maximum ${this.max}`);
      return false;
    }

    return true;
  }

  public async initialize(): Promise<void> {
    // No initialization needed
  }

  public async cleanup(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Pattern validator
 */
export class PatternValidator extends BaseValidator<string> {
  private readonly pattern: RegExp;

  constructor(pattern: RegExp | string) {
    super('PatternValidator');
    this.pattern = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  }

  public validate(value: string): boolean {
    this.clearErrors();

    if (typeof value !== 'string') {
      this.addError('Value must be a string');
      return false;
    }

    if (!this.pattern.test(value)) {
      this.addError(`Value '${value}' does not match pattern ${this.pattern}`);
      return false;
    }

    return true;
  }

  public async initialize(): Promise<void> {
    // No initialization needed
  }

  public async cleanup(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Schema validator
 */
export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  rules?: ValidationRule<unknown>[];
}

export interface Schema {
  fields: SchemaField[];
  strict?: boolean;
}

export class SchemaValidator extends BaseValidator<Record<string, unknown>> {
  constructor(private readonly schema: Schema) {
    super('SchemaValidator');
  }

  public validate(value: Record<string, unknown>): boolean {
    this.clearErrors();

    if (typeof value !== 'object' || value === null) {
      this.addError('Value must be an object');
      return false;
    }

    let valid = true;

    // Check required fields
    for (const field of this.schema.fields) {
      const fieldValue = value[field.name];

      if (field.required && (fieldValue === null || fieldValue === undefined)) {
        this.addError(`Required field '${field.name}' is missing`);
        valid = false;
        continue;
      }

      if (fieldValue !== undefined && fieldValue !== null) {
        // Type check
        if (!this.checkType(fieldValue, field.type)) {
          this.addError(
            `Field '${field.name}' expected type ${field.type}, got ${typeof fieldValue}`
          );
          valid = false;
        }

        // Additional rules
        if (field.rules) {
          for (const rule of field.rules) {
            if (!rule.validate(fieldValue)) {
              this.addError(`Field '${field.name}': ${rule.message}`);
              valid = false;
            }
          }
        }
      }
    }

    // Check for unexpected fields in strict mode
    if (this.schema.strict) {
      const schemaFields = new Set(this.schema.fields.map(f => f.name));
      const unexpectedFields = Object.keys(value).filter(k => !schemaFields.has(k));
      
      if (unexpectedFields.length > 0) {
        this.addError(`Unexpected fields: ${unexpectedFields.join(', ')}`);
        valid = false;
      }
    }

    return valid;
  }

  private checkType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return false;
    }
  }

  public async initialize(): Promise<void> {
    // No initialization needed
  }

  public async cleanup(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Composite validator
 */
export class CompositeValidator<T = unknown> extends BaseValidator<T> {
  constructor(
    private readonly validators: BaseValidator<T>[],
    private readonly requireAll = true
  ) {
    super('CompositeValidator');
  }

  public async validate(value: T): Promise<boolean> {
    this.clearErrors();
    const results: boolean[] = [];

    for (const validator of this.validators) {
      const valid = await validator.validate(value);
      results.push(valid);

      if (!valid) {
        this.errors.push(...validator.getErrors());
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

  public async initialize(): Promise<void> {
    await Promise.all(this.validators.map(v => v.initialize()));
  }

  public async cleanup(): Promise<void> {
    await Promise.all(this.validators.map(v => v.cleanup()));
  }
}

/**
 * Validation utilities
 */
export class ValidationUtils {
  public static isEmail(value: unknown): value is EmailAddress {
    if (typeof value !== 'string') return false;
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(value);
  }

  public static isURL(value: unknown): value is URL {
    if (typeof value !== 'string') return false;
    try {
      new globalThis.URL(value);
      return true;
    } catch {
      return false;
    }
  }

  public static isUUID(value: unknown): value is UUID {
    if (typeof value !== 'string') return false;
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return pattern.test(value);
  }

  public static isISODate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return !isNaN(date.getTime()) && date.toISOString() === value;
  }

  public static isJSON(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  public static isInteger(value: unknown): boolean {
    return typeof value === 'number' && Number.isInteger(value);
  }

  public static isPositive(value: unknown): boolean {
    return typeof value === 'number' && value > 0;
  }

  public static isNegative(value: unknown): boolean {
    return typeof value === 'number' && value < 0;
  }

  public static isBetween(value: unknown, min: number, max: number): boolean {
    return typeof value === 'number' && value >= min && value <= max;
  }

  public static isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  public static isNotEmpty(value: unknown): boolean {
    return !this.isEmpty(value);
  }
}

/**
 * Create a validator from a predicate function
 */
export function createValidator<T>(
  name: string,
  predicate: Predicate<T>,
  errorMessage = 'Validation failed'
): BaseValidator<T> {
  return new class extends BaseValidator<T> {
    constructor() {
      super(name);
    }

    public validate(value: T): boolean {
      const valid = predicate(value);
      if (!valid) {
        this.addError(errorMessage);
      }
      return valid;
    }

    public async initialize(): Promise<void> {
      // No initialization needed
    }

    public async cleanup(): Promise<void> {
      // No cleanup needed
    }
  };
}

/**
 * Chain multiple validators
 */
export function chain<T>(...validators: BaseValidator<T>[]): CompositeValidator<T> {
  return new CompositeValidator(validators, true);
}

/**
 * At least one validator must pass
 */
export function oneOf<T>(...validators: BaseValidator<T>[]): CompositeValidator<T> {
  return new CompositeValidator(validators, false);
}

/**
 * Validate and throw exception if invalid
 */
export function validateOrThrow<T>(
  value: T,
  validator: BaseValidator<T> | ValidationRule<T>[],
  fieldName?: string
): void {
  if (Array.isArray(validator)) {
    const builder = new ValidationRuleBuilder<T>();
    validator.forEach(rule => builder.addRule(rule.validate, rule.message));
    const result = builder.validate(value);
    
    if (!result.valid) {
      throw new ValidationException(
        result.errors.join('; '),
        fieldName,
        value
      );
    }
  } else {
    const valid = validator.validate(value);
    
    if (!valid) {
      throw new ValidationException(
        validator.getErrors().join('; '),
        fieldName,
        value
      );
    }
  }
}