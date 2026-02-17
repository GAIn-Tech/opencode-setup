// Input validation utilities for OpenCode
// Replaces ad-hoc validation with structured validation

class ValidationResult {
  constructor(valid = true, errors = []) {
    this.valid = valid;
    this.errors = errors;
  }
  
  addError(field, message) {
    this.valid = false;
    this.errors.push({ field, message });
    return this;
  }
}

class Validator {
  constructor(value, fieldName = 'value') {
    this.value = value;
    this.fieldName = fieldName;
    this.errors = [];
  }
  
  required() {
    if (this.value === undefined || this.value === null || this.value === '') {
      this.errors.push(`${this.fieldName} is required`);
    }
    return this;
  }
  
  type(expectedType) {
    if (this.value === undefined || this.value === null) return this;
    
    const actualType = Array.isArray(this.value) ? 'array' : typeof this.value;
    if (actualType !== expectedType) {
      this.errors.push(`${this.fieldName} must be ${expectedType}, got ${actualType}`);
    }
    return this;
  }
  
  min(minVal) {
    if (this.value !== undefined && this.value !== null && this.value < minVal) {
      this.errors.push(`${this.fieldName} must be at least ${minVal}`);
    }
    return this;
  }
  
  max(maxVal) {
    if (this.value !== undefined && this.value !== null && this.value > maxVal) {
      this.errors.push(`${this.fieldName} must be at most ${maxVal}`);
    }
    return this;
  }
  
  pattern(regex, message) {
    if (this.value !== undefined && this.value !== null && !regex.test(this.value)) {
      this.errors.push(`${this.fieldName}: ${message || 'invalid format'}`);
    }
    return this;
  }
  
  schema(schema) {
    if (typeof this.value !== 'object' || this.value === null) {
      this.errors.push(`${this.fieldName} must be an object`);
      return this;
    }
    
    for (const [field, type] of Object.entries(schema)) {
      const validator = new Validator(this.value[field], `${this.fieldName}.${field}`);
      
      if (type === 'string') validator.type('string').required();
      else if (type === 'number') validator.type('number');
      else if (type === 'object') validator.type('object');
      else if (type === 'array') validator.type('array');
      
      this.errors.push(...validator.errors);
    }
    return this;
  }
  
  validate() {
    return new ValidationResult(this.errors.length === 0, this.errors);
  }
}

// Main validation function
function validate(value, fieldName = 'value') {
  return new Validator(value, fieldName);
}

// Type guards
function isString(val) { return typeof val === 'string'; }
function isNumber(val) { return typeof val === 'number' && !isNaN(val); }
function isObject(val) { return typeof val === 'object' && val !== null && !Array.isArray(val); }
function isArray(val) { return Array.isArray(val); }
function isBoolean(val) { return typeof val === 'boolean'; }
function isFunction(val) { return typeof val === 'function'; }

// String sanitization
function sanitizeString(str, maxLength = 1000) {
  if (!isString(str)) return '';
  return str.slice(0, maxLength).trim();
}

// HTML sanitization (basic)
function sanitizeHtml(html) {
  if (!isString(html)) return '';
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// JSON validation
function isValidJson(str) {
  if (!isString(str)) return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// Email validation
function isValidEmail(email) {
  if (!isString(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// URL validation
function isValidUrl(url) {
  if (!isString(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  ValidationResult,
  Validator,
  validate,
  isString,
  isNumber,
  isObject,
  isArray,
  isBoolean,
  isFunction,
  sanitizeString,
  sanitizeHtml,
  isValidJson,
  isValidEmail,
  isValidUrl
};
