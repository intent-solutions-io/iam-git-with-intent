# AI Tool Evaluation Rubrics

> **Document**: 204-DR-EVAL-ai-tool-rubrics
> **Epic**: EPIC 026 - AI Tool Rollout Framework
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Standardized scoring rubrics for evaluating AI coding assistants across multiple dimensions.

---

## Dimension 1: Code Quality (25%)

### 1.1 Correctness (10 points)

| Score | Criteria |
|-------|----------|
| 10 | Code works correctly on first attempt, handles all edge cases |
| 8 | Works correctly, minor edge cases missed |
| 6 | Works with minor fixes needed |
| 4 | Core logic correct but significant fixes required |
| 2 | Partially correct, major issues |
| 0 | Does not work or completely wrong approach |

### 1.2 Code Style (5 points)

| Score | Criteria |
|-------|----------|
| 5 | Matches project style perfectly, idiomatic |
| 4 | Minor style deviations |
| 3 | Acceptable but not idiomatic |
| 2 | Significant style issues |
| 1 | Poor style, hard to read |
| 0 | Unacceptable style |

### 1.3 Best Practices (5 points)

| Score | Criteria |
|-------|----------|
| 5 | Follows all best practices, exemplary code |
| 4 | Follows most best practices |
| 3 | Some best practices followed |
| 2 | Few best practices followed |
| 1 | Ignores most best practices |
| 0 | Anti-patterns throughout |

### 1.4 Error Handling (5 points)

| Score | Criteria |
|-------|----------|
| 5 | Comprehensive error handling, graceful degradation |
| 4 | Good error handling, minor gaps |
| 3 | Basic error handling |
| 2 | Minimal error handling |
| 1 | Poor error handling |
| 0 | No error handling |

---

## Dimension 2: Context Understanding (20%)

### 2.1 Project Context (7 points)

| Score | Criteria |
|-------|----------|
| 7 | Perfect understanding of project structure and patterns |
| 5 | Good understanding, minor misses |
| 3 | Partial understanding |
| 1 | Poor understanding |
| 0 | No understanding of context |

### 2.2 Codebase Integration (7 points)

| Score | Criteria |
|-------|----------|
| 7 | Seamlessly integrates with existing code |
| 5 | Integrates well with minor adjustments needed |
| 3 | Requires moderate integration work |
| 1 | Significant integration issues |
| 0 | Cannot integrate without rewrite |

### 2.3 Dependency Awareness (6 points)

| Score | Criteria |
|-------|----------|
| 6 | Uses correct dependencies, proper versions |
| 4 | Mostly correct dependency usage |
| 2 | Some dependency issues |
| 0 | Wrong or missing dependencies |

---

## Dimension 3: Security (20%)

### 3.1 Vulnerability Prevention (8 points)

| Score | Criteria |
|-------|----------|
| 8 | No vulnerabilities, proactively secure |
| 6 | No critical vulnerabilities |
| 4 | Minor security issues |
| 2 | Moderate security issues |
| 0 | Critical security vulnerabilities |

### 3.2 Secret Handling (6 points)

| Score | Criteria |
|-------|----------|
| 6 | Perfect secret handling, no hardcoded values |
| 4 | Good secret handling |
| 2 | Some hardcoded values or poor practices |
| 0 | Secrets exposed or logged |

### 3.3 Input Validation (6 points)

| Score | Criteria |
|-------|----------|
| 6 | Comprehensive input validation |
| 4 | Good validation, minor gaps |
| 2 | Basic validation |
| 0 | No input validation |

---

## Dimension 4: Performance (15%)

### 4.1 Algorithmic Efficiency (6 points)

| Score | Criteria |
|-------|----------|
| 6 | Optimal algorithm choice |
| 4 | Good algorithm, minor optimizations possible |
| 2 | Suboptimal but acceptable |
| 0 | Poor algorithm choice |

### 4.2 Resource Usage (5 points)

| Score | Criteria |
|-------|----------|
| 5 | Efficient memory and CPU usage |
| 3 | Acceptable resource usage |
| 1 | Wasteful resource usage |
| 0 | Resource leaks or excessive usage |

### 4.3 Scalability (4 points)

| Score | Criteria |
|-------|----------|
| 4 | Scales well with data/load increase |
| 2 | Scales acceptably |
| 0 | Does not scale |

---

## Dimension 5: Usability (10%)

### 5.1 Response Speed (4 points)

| Score | Criteria |
|-------|----------|
| 4 | < 5 seconds for simple tasks |
| 3 | 5-15 seconds |
| 2 | 15-30 seconds |
| 1 | 30-60 seconds |
| 0 | > 60 seconds or timeout |

### 5.2 Explanation Quality (3 points)

| Score | Criteria |
|-------|----------|
| 3 | Clear, helpful explanations |
| 2 | Adequate explanations |
| 1 | Minimal explanations |
| 0 | No explanations or confusing |

### 5.3 Iteration Support (3 points)

| Score | Criteria |
|-------|----------|
| 3 | Excellent follow-up understanding |
| 2 | Good iteration support |
| 1 | Limited iteration capability |
| 0 | Cannot iterate effectively |

---

## Dimension 6: Compliance (10%)

### 6.1 License Compliance (4 points)

| Score | Criteria |
|-------|----------|
| 4 | All code/suggestions license-compliant |
| 2 | Mostly compliant |
| 0 | License violations |

### 6.2 Data Handling (3 points)

| Score | Criteria |
|-------|----------|
| 3 | Proper data handling, no retention concerns |
| 2 | Acceptable data handling |
| 0 | Data handling concerns |

### 6.3 Audit Trail (3 points)

| Score | Criteria |
|-------|----------|
| 3 | Full audit trail available |
| 2 | Partial audit capability |
| 0 | No audit trail |

---

## Scoring Summary

**Maximum Score: 100 points**

| Dimension | Max Points |
|-----------|------------|
| Code Quality | 25 |
| Context Understanding | 20 |
| Security | 20 |
| Performance | 15 |
| Usability | 10 |
| Compliance | 10 |
| **Total** | **100** |

### Rating Scale

| Score | Rating | Recommendation |
|-------|--------|----------------|
| 90-100 | Excellent | Strongly approve |
| 80-89 | Good | Approve |
| 70-79 | Acceptable | Conditional approval |
| 60-69 | Below Average | Additional review needed |
| < 60 | Poor | Do not approve |

---

## Evaluation Process

### Step 1: Task Selection
Select 5 tasks from each category in [202-DR-TEST-ai-golden-tasks.md](./202-DR-TEST-ai-golden-tasks.md)

### Step 2: Blind Evaluation
- Evaluate each tool without bias indicators
- Use same prompts across all tools
- Document exact inputs and outputs

### Step 3: Scoring
- Apply rubrics consistently
- Document reasoning for each score
- Calculate weighted totals

### Step 4: Review
- Cross-check scores with second evaluator
- Resolve discrepancies
- Finalize report

### Step 5: Documentation
Generate evaluation report with:
- Overall scores per tool
- Dimension breakdown
- Strengths/weaknesses
- Recommendation with rationale

---

## Evaluation Report Template

```markdown
# AI Tool Evaluation Report

**Date:** [DATE]
**Evaluator:** [NAME]
**Tools Evaluated:** [TOOL_LIST]

## Summary Scores

| Tool | Quality | Context | Security | Perf | Usability | Compliance | Total |
|------|---------|---------|----------|------|-----------|------------|-------|
| Tool A | XX | XX | XX | XX | XX | XX | XX |
| Tool B | XX | XX | XX | XX | XX | XX | XX |

## Recommendation

[RECOMMENDATION]

## Detailed Analysis

### [Tool Name]
**Strengths:**
- [STRENGTH_1]
- [STRENGTH_2]

**Weaknesses:**
- [WEAKNESS_1]
- [WEAKNESS_2]

**Notable Observations:**
[OBSERVATIONS]
```
