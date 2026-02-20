# Documentation Style Guide

This guide defines the standards for all documentation in the opencode-setup repository. Consistent documentation improves readability, maintainability, and user experience.

## Markdown Formatting Standards

### Headings
- Use `#` for main title (one per document)
- Use `##` for major sections (Overview, When to Use, etc.)
- Use `###` for subsections (Phase 1, Inputs Required, etc.)
- Use `####` for sub-subsections (Step 1, etc.)
- Never skip heading levels

### Lists
- Use `-` for unordered lists
- Use `1.` for ordered lists
- Always put a blank line before and after lists
- Use consistent indentation for nested lists

### Code Blocks
- Use triple backticks with language specification:
  ```bash
  npm install package-name
  ```
  ```json
  {"key": "value"}
  ```
  ```javascript
  function example() {}
  ```
- Always specify the language for syntax highlighting
- Use `line-numbers` for code blocks longer than 5 lines

### Emphasis
- Use `*italic*` for emphasis
- Use `**bold**` for strong emphasis
- Use `***bold italic***` for strong emphasis with italics
- Never use underscores for emphasis

### Tables
- Use pipes (`|`) and dashes (`-`) to create tables
- Align columns with colons:
  | Column 1 | Column 2 |
  | -------- | -------- |
  | Value 1  | Value 2  |
- Always include a header row
- Use consistent spacing

### Links
- Use `[text](url)` format
- Use full URLs for external links
- Use relative paths for internal links

## Visual Hierarchy Principles

1. **Information Density**: Prioritize clarity over completeness. Use bullet points instead of paragraphs when possible.

2. **Section Grouping**: Group related sections together with clear headings.

3. **White Space**: Use blank lines to separate sections and improve readability.

4. **Consistent Structure**: Follow the same structure across similar documents (e.g., all SKILL.md files).

5. **Visual Cues**: Use icons sparingly and consistently:
   - ✅ for success/required
   - ❌ for failure/prohibited
   - ⚠️ for warnings/important notes
   - 💡 for tips/suggestions

## Writing Style

### Tone and Voice
- Use active voice: "The system validates inputs" not "Inputs are validated by the system"
- Use second person: "You should" not "One should"
- Be direct and concise
- Avoid unnecessary jargon

### Conciseness
- Eliminate redundant phrases
- Use short sentences
- Avoid passive constructions
- Remove filler words (very, really, quite, etc.)

### Precision
- Use specific terms instead of vague ones
- Define acronyms on first use
- Be explicit about requirements and constraints

### Tone
- Professional but approachable
- Confident but not arrogant
- Helpful and supportive
- Avoid humor and sarcasm

## Template Usage Guidelines

### SKILL.md Template
- Always use the YAML frontmatter format
- Fill all required fields
- Use the exact section headings from the template
- Add sub-sections as needed, but don't remove required sections
- Use the template's structure for consistency

### ADDITION-PROCEDURE.md Template
- Follow the exact structure
- Use the checklist format for verification
- Keep the step-by-step format
- Use tables for quick reference

### General Documentation
- Use consistent naming conventions for files and sections
- Update documentation when code changes
- Remove outdated information
- Add examples where helpful

## Examples

### Good vs Bad Examples

**Bad**: 
```
This skill is used when you need to do things. It can help with a lot of stuff.
```

**Good**:
```
Use this skill when:
- You need to validate user input
- You're processing form data
- You're implementing authentication
```

**Bad**:
```
1. Do this
2. Do that
3. Do something else
```

**Good**:
```
1. Validate the input
2. Transform the data
3. Store the result
```

**Bad**:
```
|Input|Description|
|-----|-----------|
|scope|The boundary of the task|
```

**Good**:
```
| Input | Description |
|-------|-------------|
| scope | The boundary of the task |
```

## Enforcement

- All new documentation must follow this style guide
- Existing documentation will be updated during maintenance cycles
- Code reviews will check for style guide compliance
- Automated checks will be added to `verify-integration.mjs` in future iterations

---

*This document is part of the opencode-setup documentation ecosystem. See LIVING-DOCS.md for governance information.*