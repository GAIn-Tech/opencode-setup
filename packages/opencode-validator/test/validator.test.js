import { describe, it, expect } from 'bun:test';
const { ValidationResult, Validator, validate, isObject, isArray } = require('../src/index.js');

describe('ValidationResult', () => {
  it('constructor: defaults to valid=true, errors=[]', () => {
    const result = new ValidationResult();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('constructor: accepts valid and errors arguments', () => {
    const errors = [{ field: 'email', message: 'invalid' }];
    const result = new ValidationResult(false, errors);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(errors);
  });

  it('addError: sets valid to false', () => {
    const result = new ValidationResult();
    result.addError('name', 'required');
    expect(result.valid).toBe(false);
  });

  it('addError: appends error to errors array', () => {
    const result = new ValidationResult();
    result.addError('name', 'required');
    result.addError('email', 'invalid format');
    expect(result.errors.length).toBe(2);
    expect(result.errors[0]).toEqual({ field: 'name', message: 'required' });
    expect(result.errors[1]).toEqual({ field: 'email', message: 'invalid format' });
  });

  it('addError: returns this for chaining', () => {
    const result = new ValidationResult();
    const chained = result.addError('field1', 'msg1').addError('field2', 'msg2');
    expect(chained).toBe(result);
    expect(result.errors.length).toBe(2);
  });
});

describe('Validator.required()', () => {
  it('passes for non-empty string', () => {
    const validator = new Validator('hello', 'name');
    validator.required();
    expect(validator.errors.length).toBe(0);
  });

  it('passes for number (including 0)', () => {
    const validator = new Validator(0, 'count');
    validator.required();
    expect(validator.errors.length).toBe(0);
  });

  it('passes for boolean false', () => {
    const validator = new Validator(false, 'flag');
    validator.required();
    expect(validator.errors.length).toBe(0);
  });

  it('fails for undefined', () => {
    const validator = new Validator(undefined, 'name');
    validator.required();
    expect(validator.errors.length).toBe(1);
    expect(validator.errors[0]).toContain('is required');
  });

  it('fails for null', () => {
    const validator = new Validator(null, 'name');
    validator.required();
    expect(validator.errors.length).toBe(1);
    expect(validator.errors[0]).toContain('is required');
  });

  it('fails for empty string', () => {
    const validator = new Validator('', 'name');
    validator.required();
    expect(validator.errors.length).toBe(1);
    expect(validator.errors[0]).toContain('is required');
  });
});

describe('Validator.type()', () => {
  it('passes for correct string type', () => {
    const validator = new Validator('hello', 'name');
    validator.type('string');
    expect(validator.errors.length).toBe(0);
  });

  it('passes for correct number type', () => {
    const validator = new Validator(42, 'age');
    validator.type('number');
    expect(validator.errors.length).toBe(0);
  });

  it('passes for correct object type', () => {
    const validator = new Validator({ key: 'value' }, 'data');
    validator.type('object');
    expect(validator.errors.length).toBe(0);
  });

  it('passes for correct array type', () => {
    const validator = new Validator([1, 2, 3], 'items');
    validator.type('array');
    expect(validator.errors.length).toBe(0);
  });

  it('fails for wrong type', () => {
    const validator = new Validator('hello', 'age');
    validator.type('number');
    expect(validator.errors.length).toBe(1);
    expect(validator.errors[0]).toContain('must be number');
  });

  it('skips validation for undefined', () => {
    const validator = new Validator(undefined, 'name');
    validator.type('string');
    expect(validator.errors.length).toBe(0);
  });

  it('skips validation for null', () => {
    const validator = new Validator(null, 'name');
    validator.type('string');
    expect(validator.errors.length).toBe(0);
  });

  it('distinguishes array from object', () => {
    const validator1 = new Validator([1, 2], 'items');
    validator1.type('object');
    expect(validator1.errors.length).toBe(1);

    const validator2 = new Validator({ a: 1 }, 'data');
    validator2.type('array');
    expect(validator2.errors.length).toBe(1);
  });

  it('handles NaN (typeof NaN is number)', () => {
    const validator = new Validator(NaN, 'value');
    validator.type('number');
    expect(validator.errors.length).toBe(0);
  });
});

describe('Validator.min()', () => {
  it('passes for value >= min', () => {
    const validator = new Validator(10, 'age');
    validator.min(5);
    expect(validator.errors.length).toBe(0);
  });

  it('passes for value equal to min', () => {
    const validator = new Validator(5, 'age');
    validator.min(5);
    expect(validator.errors.length).toBe(0);
  });

  it('fails for value < min', () => {
    const validator = new Validator(3, 'age');
    validator.min(5);
    expect(validator.errors.length).toBe(1);
    expect(validator.errors[0]).toContain('must be at least 5');
  });

  it('skips validation for undefined', () => {
    const validator = new Validator(undefined, 'age');
    validator.min(5);
    expect(validator.errors.length).toBe(0);
  });

  it('skips validation for null', () => {
    const validator = new Validator(null, 'age');
    validator.min(5);
    expect(validator.errors.length).toBe(0);
  });

  it('works with string length comparison', () => {
    const validator = new Validator('hello', 'password');
    validator.min(3);
    expect(validator.errors.length).toBe(0);
  });
});

describe('Validator.max()', () => {
  it('passes for value <= max', () => {
    const validator = new Validator(10, 'age');
    validator.max(20);
    expect(validator.errors.length).toBe(0);
  });

  it('passes for value equal to max', () => {
    const validator = new Validator(20, 'age');
    validator.max(20);
    expect(validator.errors.length).toBe(0);
  });

  it('fails for value > max', () => {
    const validator = new Validator(25, 'age');
    validator.max(20);
    expect(validator.errors.length).toBe(1);
    expect(validator.errors[0]).toContain('must be at most 20');
  });

  it('skips validation for undefined', () => {
    const validator = new Validator(undefined, 'age');
    validator.max(20);
    expect(validator.errors.length).toBe(0);
  });

  it('skips validation for null', () => {
    const validator = new Validator(null, 'age');
    validator.max(20);
    expect(validator.errors.length).toBe(0);
  });
});

describe('Validator.pattern()', () => {
  it('passes for matching regex', () => {
    const validator = new Validator('hello123', 'code');
    validator.pattern(/^[a-z]+\d+$/);
    expect(validator.errors.length).toBe(0);
  });

  it('fails for non-matching regex', () => {
    const validator = new Validator('hello', 'code');
    validator.pattern(/^\d+$/);
    expect(validator.errors.length).toBe(1);
  });

  it('uses custom message when provided', () => {
    const validator = new Validator('invalid', 'email');
    validator.pattern(/^[^\s@]+@[^\s@]+$/, 'must be valid email');
    expect(validator.errors[0]).toContain('must be valid email');
  });

  it('uses default message when not provided', () => {
    const validator = new Validator('invalid', 'email');
    validator.pattern(/^[^\s@]+@[^\s@]+$/);
    expect(validator.errors[0]).toContain('invalid format');
  });

  it('skips validation for undefined', () => {
    const validator = new Validator(undefined, 'email');
    validator.pattern(/^[^\s@]+@[^\s@]+$/);
    expect(validator.errors.length).toBe(0);
  });

  it('skips validation for null', () => {
    const validator = new Validator(null, 'email');
    validator.pattern(/^[^\s@]+@[^\s@]+$/);
    expect(validator.errors.length).toBe(0);
  });
});

describe('Validator.schema()', () => {
  it('validates object with correct schema', () => {
    const obj = { name: 'John', age: 30 };
    const validator = new Validator(obj, 'user');
    validator.schema({ name: 'string', age: 'number' });
    expect(validator.errors.length).toBe(0);
  });

  it('fails for non-object value', () => {
    const validator = new Validator('not an object', 'user');
    validator.schema({ name: 'string' });
    expect(validator.errors.length).toBe(1);
    expect(validator.errors[0]).toContain('must be an object');
  });

  it('fails for null (not an object)', () => {
    const validator = new Validator(null, 'user');
    validator.schema({ name: 'string' });
    expect(validator.errors.length).toBe(1);
  });

  it('validates nested field names', () => {
    const obj = { name: 'John' };
    const validator = new Validator(obj, 'user');
    validator.schema({ name: 'string' });
    expect(validator.errors.length).toBe(0);
  });

  it('fails when required string field is missing', () => {
    const obj = { age: 30 };
    const validator = new Validator(obj, 'user');
    validator.schema({ name: 'string' });
    expect(validator.errors.length).toBeGreaterThan(0);
  });

  it('validates multiple field types', () => {
    const obj = { name: 'John', age: 30, tags: ['a', 'b'], meta: {} };
    const validator = new Validator(obj, 'user');
    validator.schema({ name: 'string', age: 'number', tags: 'array', meta: 'object' });
    expect(validator.errors.length).toBe(0);
  });

  it('fails when field type is wrong', () => {
    const obj = { name: 123, age: 'thirty' };
    const validator = new Validator(obj, 'user');
    validator.schema({ name: 'string', age: 'number' });
    expect(validator.errors.length).toBeGreaterThan(0);
  });
});

describe('Validator chaining', () => {
  it('chains required().type()', () => {
    const validator = new Validator('hello', 'name');
    validator.required().type('string');
    expect(validator.errors.length).toBe(0);
  });

  it('chains required().type().min().max()', () => {
    const validator = new Validator('hello', 'password');
    validator.required().type('string').min(5).max(20);
    expect(validator.errors.length).toBe(0);
  });

  it('accumulates errors from multiple validators', () => {
    const validator = new Validator(3, 'age');
    validator.required().type('number').min(5).max(20);
    expect(validator.errors.length).toBe(1);
    expect(validator.errors[0]).toContain('must be at least 5');
  });

  it('chains pattern() with other validators', () => {
    const validator = new Validator('abc123', 'code');
    validator.required().type('string').pattern(/^[a-z]+\d+$/);
    expect(validator.errors.length).toBe(0);
  });

  it('returns this for chaining', () => {
    const validator = new Validator('test', 'field');
    const result = validator.required();
    expect(result).toBe(validator);
  });
});

describe('validate() factory function', () => {
  it('returns Validator instance', () => {
    const validator = validate('hello');
    expect(validator instanceof Validator).toBe(true);
  });

  it('accepts value and fieldName', () => {
    const validator = validate('hello', 'username');
    expect(validator.value).toBe('hello');
    expect(validator.fieldName).toBe('username');
  });

  it('defaults fieldName to "value"', () => {
    const validator = validate('hello');
    expect(validator.fieldName).toBe('value');
  });

  it('allows chaining after factory call', () => {
    const result = validate('hello', 'name').required().type('string').validate();
    expect(result.valid).toBe(true);
  });
});

describe('Validator.validate()', () => {
  it('returns ValidationResult with valid=true when no errors', () => {
    const validator = new Validator('hello', 'name');
    validator.required().type('string');
    const result = validator.validate();
    expect(result instanceof ValidationResult).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('returns ValidationResult with valid=false when errors exist', () => {
    const validator = new Validator('', 'name');
    validator.required();
    const result = validator.validate();
    expect(result.valid).toBe(false);
  });

  it('includes errors in ValidationResult', () => {
    const validator = new Validator('', 'name');
    validator.required().type('number');
    const result = validator.validate();
    expect(result.errors.length).toBe(2);
  });
});

describe('isObject()', () => {
  it('returns true for plain object', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ key: 'value' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isObject(null)).toBe(false);
  });

  it('returns false for array', () => {
    expect(isObject([])).toBe(false);
    expect(isObject([1, 2, 3])).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isObject('string')).toBe(false);
    expect(isObject(123)).toBe(false);
    expect(isObject(true)).toBe(false);
    expect(isObject(undefined)).toBe(false);
  });

  it('returns false for functions', () => {
    expect(isObject(() => {})).toBe(false);
  });
});

describe('isArray()', () => {
  it('returns true for array', () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2, 3])).toBe(true);
  });

  it('returns false for object', () => {
    expect(isArray({})).toBe(false);
    expect(isArray({ key: 'value' })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isArray('string')).toBe(false);
    expect(isArray(123)).toBe(false);
    expect(isArray(true)).toBe(false);
    expect(isArray(null)).toBe(false);
    expect(isArray(undefined)).toBe(false);
  });

  it('returns false for functions', () => {
    expect(isArray(() => {})).toBe(false);
  });
});
