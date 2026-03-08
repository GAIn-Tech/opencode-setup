# opencode-validator

Input validation utilities for OpenCode. Replaces ad-hoc validation with structured, chainable validators.

## Features

- **Chainable API**: Fluent validation with `.required().string().minLength(3)`
- **Validation Results**: Structured result objects with field-level errors
- **Common Validators**: String, number, enum, array, object type checks
- **Custom Rules**: Extensible with custom validation functions

## Usage

```javascript
const { Validator, validate } = require('opencode-validator');

const result = new Validator(input, 'username')
  .required()
  .string()
  .minLength(3)
  .maxLength(50)
  .result();

if (!result.valid) {
  console.error(result.errors);
}
```

## API

### `Validator`

Chainable validator instance.

| Method | Description |
|--------|-------------|
| `required()` | Value must not be null/undefined/empty |
| `string()` | Value must be a string |
| `number()` | Value must be a number |
| `minLength(n)` | String/array minimum length |
| `maxLength(n)` | String/array maximum length |
| `oneOf(values)` | Value must be in allowed set |
| `result()` | Return `ValidationResult` |

### `ValidationResult`

| Property | Type | Description |
|----------|------|-------------|
| `valid` | `boolean` | Whether validation passed |
| `errors` | `Array<{field, message}>` | List of validation errors |

## License

MIT
