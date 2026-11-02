module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
    "prettier"
  ],
  ignorePatterns: ["node_modules/", "dist/", "build/"],
  overrides: [
    {
      files: ["tests/**/*.ts"],
      rules: {
        "@typescript-eslint/await-thenable": "off",
        "@typescript-eslint/no-empty-function": "off"
      }
    }
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-empty-function": [
      "error",
      {
        "allow": ["methods", "asyncMethods", "functions", "asyncFunctions", "arrowFunctions"]
      }
    ],
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }
    ],
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        "prefer": "type-imports"
      }
    ]
  }
};
