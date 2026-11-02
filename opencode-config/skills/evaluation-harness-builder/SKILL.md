---
# REQUIRED FIELDS
name: evaluation-harness-builder
description: >
  Builds regression test harnesses and evaluation frameworks for validating AI code quality.

# OPTIONAL METADATA
version: 1.0.0
category: testing

# COMPOSITION METADATA
dependencies: ["test-driven-development"]
synergies: ["test-driven-development", "verification-before-completion", "receiving-code-review"]
conflicts: []
outputs:
  - type: artifact
    name: test-harness
    location: project
  - type: artifact
    name: evaluation-report
    location: session
inputs:
  - type: context
    name: target-functionality
    required: true
  - type: context
    name: acceptance-criteria
    required: true
---

# Evaluation Harness Builder

## Overview

Creates comprehensive test harnesses and evaluation frameworks to measure AI code quality, regression risks, and functional correctness. Builds reusable test infrastructure.

## When to Use

Use this skill when:
- Need regression test suite for feature
- Want to benchmark AI code generation quality
- Building evaluation framework for prompts
- Need regression safety net for refactoring

Do NOT use this skill for:
- Simple one-off tests (use test-driven-development)
- When existing test coverage is sufficient
- Performance benchmarking (use specialized tools)

## Inputs Required

- **Target Functionality**: What functionality to test
- **Acceptance Criteria**: Success conditions

## Workflow

### Phase 1: Test Strategy

1. Analyze target functionality:
   - Identify testable behaviors
   - Map edge cases
   - Determine coverage targets
2. Design test architecture:
   - Test types (unit, integration, e2e)
   - Fixtures and mocks needed
   - Assertion strategies

### Phase 2: Harness Construction

1. Create test files with:
   - Descriptive test names
   - Arrange-Act-Assert structure
   - Clear failure messages
2. Add fixtures and helpers
3. Set up test data management

### Phase 3: Evaluation Metrics

1. Define success metrics:
   - Pass/fail rate
   - Code coverage
   - Edge case handling
2. Create evaluation runner
3. Add baseline comparisons

### Phase 4: Documentation

1. Document test coverage
2. Explain edge cases covered
3. Provide run instructions
4. Add to CI/CD if needed

## Must Do

- Create reusable, maintainable tests
- Cover happy path and edge cases
- Include clear failure diagnostics
- Document test strategy and coverage

## Must Not Do

- Create brittle tests dependent on exact output
- Skip error handling tests
- Hard-code values that should be parameterized
- Leave tests without documentation

## Handoff Protocol

### Receives From
- test-driven-development: Feature tests
- verification-before-completion: Validation needs

### Hands Off To
- test-driven-development: Implementation guidance
- receiving-code-review: Quality checks

## Output Contract

1. **Test Harness**: Complete test suite in project
2. **Evaluation Report**: Coverage metrics and findings
3. **Run Instructions**: How to execute tests
4. **CI Integration**: Commands for automated runs

## Quick Start

1. Analyze functionality for testable behaviors
2. Design test structure and coverage targets
3. Build test files with edge cases
4. Add evaluation metrics and reporting
5. Document and integrate
