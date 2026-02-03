# AI Prompt Packs

> **Document**: 203-DR-TMPL-ai-prompt-packs
> **Epic**: EPIC 026 - AI Tool Rollout Framework
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Standardized prompt templates for common development tasks. These prompts are optimized for consistency, quality, and security across the organization.

---

## Prompt Pack: Code Generation

### CG-001: New Feature Implementation

```
Implement [FEATURE_NAME] with the following requirements:

Context:
- Project: [PROJECT_NAME]
- Language: [LANGUAGE]
- Framework: [FRAMEWORK]
- Existing patterns: [LINK_TO_PATTERNS]

Requirements:
1. [REQUIREMENT_1]
2. [REQUIREMENT_2]
3. [REQUIREMENT_3]

Constraints:
- Follow existing code style in [FILE_PATH]
- Use [LIBRARY] for [PURPOSE]
- Must be backwards compatible with [VERSION]

Expected output:
- Implementation code
- Unit tests (>80% coverage)
- JSDoc/TSDoc comments
```

### CG-002: API Endpoint

```
Create a [METHOD] endpoint at [PATH] that:

Purpose: [DESCRIPTION]

Request:
- Headers: [HEADERS]
- Body schema: [SCHEMA]
- Query params: [PARAMS]

Response:
- Success (200): [SUCCESS_SCHEMA]
- Errors: [ERROR_CODES_AND_MEANINGS]

Requirements:
- Input validation using [LIBRARY]
- Authentication: [AUTH_METHOD]
- Rate limiting: [RATE_LIMIT]
- Logging: [LOG_LEVEL]

Follow patterns in: [EXISTING_ENDPOINT_PATH]
```

### CG-003: Database Migration

```
Create a database migration to:

Change: [DESCRIPTION]

Current schema:
[CURRENT_SCHEMA]

Target schema:
[TARGET_SCHEMA]

Requirements:
- Zero-downtime migration
- Rollback script included
- Data preservation for [FIELDS]
- Index recommendations

Database: [DB_TYPE] version [VERSION]
ORM: [ORM_NAME]
```

---

## Prompt Pack: Bug Fixing

### BF-001: Debug Issue

```
Debug this issue:

Error message:
[ERROR_MESSAGE]

Stack trace:
[STACK_TRACE]

Reproduction steps:
1. [STEP_1]
2. [STEP_2]
3. [STEP_3]

Environment:
- OS: [OS]
- Node/Runtime: [VERSION]
- Dependencies: [RELEVANT_DEPS]

What I've tried:
- [ATTEMPT_1]
- [ATTEMPT_2]

Provide:
1. Root cause analysis
2. Fix with explanation
3. Prevention recommendations
```

### BF-002: Performance Issue

```
Diagnose and fix this performance issue:

Symptom: [DESCRIPTION]
- Current: [CURRENT_METRIC]
- Expected: [TARGET_METRIC]

Code/Query:
[CODE_OR_QUERY]

Context:
- Data volume: [SIZE]
- Frequency: [CALLS_PER_SECOND]
- Timeout: [CURRENT_TIMEOUT]

Provide:
1. Bottleneck identification
2. Optimized solution
3. Benchmarking approach
4. Monitoring recommendations
```

### BF-003: Security Vulnerability

```
Review and fix potential security issues in:

Code:
[CODE_BLOCK]

Concerns:
- [SPECIFIC_CONCERN_1]
- [SPECIFIC_CONCERN_2]

Context:
- User input sources: [SOURCES]
- Data sensitivity: [LEVEL]
- Compliance: [REQUIREMENTS]

Provide:
1. Vulnerability assessment (CVSS if applicable)
2. Secure implementation
3. Additional hardening recommendations
4. Testing approach for security
```

---

## Prompt Pack: Code Review

### CR-001: PR Review

```
Review this pull request:

Title: [PR_TITLE]
Description: [PR_DESCRIPTION]

Changes:
[DIFF_OR_FILE_LIST]

Review for:
- [ ] Logic correctness
- [ ] Error handling
- [ ] Security concerns
- [ ] Performance implications
- [ ] Test coverage
- [ ] Code style consistency
- [ ] Documentation updates needed

Project standards: [LINK_TO_STANDARDS]

Provide feedback as:
1. Blocking issues (must fix)
2. Suggestions (should consider)
3. Nitpicks (optional)
```

### CR-002: Architecture Review

```
Review this architectural decision:

Proposal: [DESCRIPTION]

Current state:
[CURRENT_ARCHITECTURE]

Proposed change:
[PROPOSED_ARCHITECTURE]

Evaluate:
- Scalability implications
- Maintainability
- Cost impact
- Migration complexity
- Risk assessment

Constraints:
- Budget: [BUDGET]
- Timeline: [TIMELINE]
- Team skills: [SKILLS]
```

---

## Prompt Pack: Documentation

### DOC-001: Function Documentation

```
Generate comprehensive documentation for:

[FUNCTION_CODE]

Include:
- Purpose description
- Parameter documentation with types
- Return value documentation
- Exceptions/errors that can be thrown
- Usage examples (2-3)
- Edge cases and limitations

Format: [JSDOC/TSDOC/DOCSTRING]
```

### DOC-002: README Section

```
Write a README section for [COMPONENT]:

Purpose: [DESCRIPTION]

Include:
- Overview (2-3 sentences)
- Installation steps
- Configuration options (table format)
- Quick start example
- Common use cases
- Troubleshooting (3-5 common issues)

Audience: [DEVELOPER_LEVEL]
Tone: Professional but approachable
```

### DOC-003: Runbook

```
Create an operational runbook for [SYSTEM/PROCESS]:

Covers:
- Normal operation verification
- Common failure modes
- Troubleshooting flowchart
- Escalation procedures
- Recovery steps

Include:
- Specific commands (copy-pasteable)
- Expected outputs
- Warning signs
- SLA requirements: [SLA]

On-call audience, 3 AM readability required.
```

---

## Prompt Pack: Testing

### TEST-001: Unit Tests

```
Generate unit tests for:

[CODE_TO_TEST]

Requirements:
- Framework: [JEST/MOCHA/PYTEST]
- Coverage target: [PERCENTAGE]%
- Mock: [DEPENDENCIES_TO_MOCK]

Include:
- Happy path tests
- Error cases
- Edge cases
- Boundary conditions

Naming convention: [CONVENTION]
```

### TEST-002: Integration Tests

```
Generate integration tests for [FEATURE]:

Components involved:
- [COMPONENT_1]
- [COMPONENT_2]
- [COMPONENT_3]

Test scenarios:
1. [SCENARIO_1]
2. [SCENARIO_2]
3. [SCENARIO_3]

Setup requirements:
- Database: [TEST_DB_SETUP]
- External services: [MOCK_OR_REAL]
- Test data: [DATA_REQUIREMENTS]

Cleanup: [CLEANUP_APPROACH]
```

---

## Prompt Pack: Refactoring

### REF-001: Code Modernization

```
Modernize this code to current standards:

[LEGACY_CODE]

Target:
- Language version: [VERSION]
- Framework version: [FRAMEWORK_VERSION]
- Patterns: [DESIRED_PATTERNS]

Preserve:
- Public API compatibility
- Existing test compatibility
- [SPECIFIC_BEHAVIORS]

Avoid:
- Breaking changes
- [SPECIFIC_ANTIPATTERNS]
```

### REF-002: Extract Service

```
Extract [FUNCTIONALITY] into a separate service:

Current location:
[CURRENT_CODE_LOCATION]

Responsibilities to extract:
1. [RESPONSIBILITY_1]
2. [RESPONSIBILITY_2]
3. [RESPONSIBILITY_3]

Interface requirements:
- Sync/Async: [PREFERENCE]
- Error handling: [APPROACH]
- Versioning: [STRATEGY]

Dependencies to handle:
- [DEP_1]: [HANDLING]
- [DEP_2]: [HANDLING]
```

---

## Usage Guidelines

### Do's
- Fill in all bracketed placeholders
- Provide context about existing patterns
- Specify constraints upfront
- Include examples of expected output

### Don'ts
- Don't include sensitive data (API keys, passwords)
- Don't include PII
- Don't ask for production credentials
- Don't request code that bypasses security controls

### Customization

Teams may extend these prompts with:
- Team-specific patterns
- Project-specific constraints
- Additional context

Submit extensions via PR to `docs/ai-prompts/extensions/`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-03 | Initial release |
