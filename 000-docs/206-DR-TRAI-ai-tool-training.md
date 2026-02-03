# AI Tool Training Materials

> **Document**: 206-DR-TRAI-ai-tool-training
> **Epic**: EPIC 026 - AI Tool Rollout Framework
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Training curriculum for AI coding assistant adoption. Structured in progressive levels from basics to advanced techniques.

---

## Training Tracks

| Track | Duration | Audience | Required |
|-------|----------|----------|----------|
| Fundamentals | 1.5 hours | All developers | Yes |
| Prompt Engineering | 2 hours | All developers | Yes |
| Security & Compliance | 30 min | All developers | Yes |
| Advanced Techniques | 2 hours | Power users | No |
| Team Lead Guide | 1 hour | Team leads | Yes (leads) |

---

## Track 1: Fundamentals (1.5 hours)

### Module 1.1: Introduction (15 min)

**What is an AI Coding Assistant?**
- Large Language Model (LLM) trained on code
- Understands context, generates suggestions
- Tool, not replacement for developer judgment

**Capabilities:**
- Code completion and generation
- Bug detection and fixing
- Documentation writing
- Test generation
- Code explanation

**Limitations:**
- May generate incorrect code
- Can hallucinate APIs/functions
- Context window limits
- No real-time information

### Module 1.2: Getting Started (30 min)

**Installation:**
```bash
# Claude Code
npm install -g @anthropic/claude-code

# Verify installation
claude --version

# Authenticate
claude auth login
```

**IDE Integration:**
- VS Code extension setup
- JetBrains plugin setup
- Vim/Neovim integration

**First Interaction:**
```
You: "Create a function that validates email addresses"

AI: Here's a TypeScript function to validate email addresses:

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Usage:
validateEmail("user@example.com"); // true
validateEmail("invalid-email"); // false
```

### Module 1.3: Basic Workflows (30 min)

**Code Completion:**
- Tab to accept
- Escape to dismiss
- Arrow keys to cycle options

**Chat Interface:**
- Ask questions about code
- Request explanations
- Generate new code

**Inline Editing:**
- Select code, right-click, "Ask AI"
- "Fix this", "Explain this", "Add tests"

**Lab Exercise:**
1. Generate a REST endpoint
2. Ask AI to add error handling
3. Request unit tests
4. Ask for documentation

### Module 1.4: Best Practices (15 min)

**Do:**
- Provide context in your prompts
- Review all generated code
- Use for repetitive tasks
- Ask for explanations
- Iterate on responses

**Don't:**
- Accept code blindly
- Share sensitive data
- Use for security-critical code without review
- Rely on it for architectural decisions
- Skip testing generated code

---

## Track 2: Prompt Engineering (2 hours)

### Module 2.1: Prompt Anatomy (20 min)

**Effective Prompt Structure:**
```
[Context] + [Task] + [Constraints] + [Output Format]
```

**Example:**
```
Context: I'm working on a Node.js Express API with TypeScript.

Task: Create a middleware function for rate limiting.

Constraints:
- Use Redis for storage
- Limit to 100 requests per minute per IP
- Return 429 status when exceeded

Output: TypeScript code with JSDoc comments
```

### Module 2.2: Context Techniques (30 min)

**Project Context:**
```
This project uses:
- TypeScript 5.0
- Express.js
- PostgreSQL with Prisma ORM
- Jest for testing

Follow patterns in src/middleware/auth.ts
```

**Code Context:**
```
Given this interface:

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

Create a function that...
```

**Error Context:**
```
I'm getting this error:

TypeError: Cannot read property 'map' of undefined
  at UserList (src/components/UserList.tsx:15:23)

The code is:
[paste relevant code]

What's wrong and how do I fix it?
```

### Module 2.3: Refinement Strategies (30 min)

**Iterative Refinement:**
```
Round 1: "Create a user registration function"
Round 2: "Add email validation"
Round 3: "Add password strength check"
Round 4: "Add rate limiting"
```

**Constraint Addition:**
```
"That's good, but also:
- Make it async
- Add proper error types
- Include logging"
```

**Specificity Ladder:**
```
Vague: "Make this better"
Better: "Improve the performance"
Best: "Optimize this query to use indexes on user_id and created_at"
```

### Module 2.4: Advanced Patterns (40 min)

**Chain of Thought:**
```
"Think through this step by step:
1. First, analyze the current implementation
2. Identify performance bottlenecks
3. Propose optimizations
4. Show the optimized code"
```

**Few-Shot Learning:**
```
"Here are examples of how we format API responses:

Example 1:
{ success: true, data: { ... } }

Example 2:
{ success: false, error: { code: 'NOT_FOUND', message: '...' } }

Now create a response for..."
```

**Role Assignment:**
```
"You are a senior security engineer reviewing this code.
Identify potential vulnerabilities and suggest fixes."
```

**Lab Exercise:**
1. Write a prompt for a complex feature
2. Refine through 3 iterations
3. Compare results with and without context

---

## Track 3: Security & Compliance (30 min)

### Module 3.1: Data Handling (10 min)

**Never Share:**
- API keys or secrets
- Passwords or credentials
- Personal Identifiable Information (PII)
- Customer data
- Internal business logic details

**Safe Patterns:**
```
# Bad - includes actual credentials
"Fix this connection string: postgres://admin:secretpass123@prod-db.company.com"

# Good - uses placeholders
"Fix this connection string format: postgres://[user]:[password]@[host]"
```

### Module 3.2: Code Review Requirements (10 min)

**All AI-generated code must:**
- Pass standard code review
- Have tests (unit and/or integration)
- Pass security scanning
- Meet style guidelines

**High-risk areas requiring extra review:**
- Authentication/authorization
- Payment processing
- Data encryption
- User input handling
- External API calls

### Module 3.3: Compliance Checklist (10 min)

**Before Using AI Assistance:**
- [ ] No secrets in prompt
- [ ] No PII in prompt
- [ ] No proprietary algorithms shared

**Before Committing AI-Generated Code:**
- [ ] Code reviewed by human
- [ ] Tests written and passing
- [ ] Security scan clean
- [ ] License compliance verified

**Quiz:** 5 scenario questions (pass required: 4/5)

---

## Track 4: Advanced Techniques (2 hours)

### Module 4.1: Complex Code Generation (30 min)

**Multi-file Generation:**
```
"Create a complete CRUD service for 'Products' including:
- src/models/product.ts (Prisma model)
- src/services/productService.ts (business logic)
- src/controllers/productController.ts (Express handlers)
- src/routes/productRoutes.ts (route definitions)
- tests/product.test.ts (unit tests)

Follow patterns in the existing User module."
```

**Architecture Scaffolding:**
```
"Design a microservice architecture for an e-commerce platform.
Include:
- Service boundaries
- API contracts
- Data flow diagrams
- Event schemas"
```

### Module 4.2: Debugging & Optimization (30 min)

**Debugging Workflow:**
```
1. Share error + stack trace
2. Share relevant code
3. Share what you've tried
4. Ask for root cause analysis
```

**Performance Optimization:**
```
"Profile this function and optimize for:
- Time complexity (target: O(n log n))
- Memory usage (target: < 100MB for 1M records)
- Database queries (target: N+1 elimination)"
```

### Module 4.3: Testing Strategies (30 min)

**Test Generation:**
```
"Generate comprehensive tests for [function]:
- Happy path cases
- Edge cases (null, empty, max values)
- Error cases
- Boundary conditions

Use Jest with the following patterns: [example]"
```

**Test-Driven Development:**
```
"I want to implement [feature].
First, write the tests that define the expected behavior.
Then I'll ask you to implement the code."
```

### Module 4.4: Documentation Automation (30 min)

**API Documentation:**
```
"Generate OpenAPI 3.0 spec for this Express router.
Include:
- All endpoints with methods
- Request/response schemas
- Authentication requirements
- Example requests/responses"
```

**Code Documentation:**
```
"Add comprehensive JSDoc to this module including:
- Module overview
- All public functions
- Parameter descriptions
- Return types
- Usage examples
- Thrown exceptions"
```

---

## Track 5: Team Lead Guide (1 hour)

### Module 5.1: Rollout Planning (20 min)

**Onboarding Checklist:**
- [ ] Licenses procured
- [ ] Training scheduled
- [ ] Support channels established
- [ ] Success metrics defined
- [ ] Feedback mechanism ready

**Communication Template:**
```
Subject: AI Coding Assistant Rollout - [Team Name]

Team,

We're rolling out [Tool] starting [Date]. Here's what you need to know:

1. Getting access: [Instructions]
2. Required training: [Links]
3. Support: [Channels]
4. Expectations: [Usage guidelines]

Questions? [Contact]
```

### Module 5.2: Metrics & Reporting (20 min)

**Key Metrics to Track:**
- Activation rate (target: 90%+)
- Weekly active users
- Acceptance rate
- Team satisfaction

**Weekly Check-in Template:**
```
1. Usage stats review
2. Wins/success stories
3. Blockers/challenges
4. Training needs
5. Feedback to share up
```

### Module 5.3: Troubleshooting (20 min)

**Common Issues:**

| Issue | Cause | Solution |
|-------|-------|----------|
| Low adoption | Training gap | Schedule refresher |
| Low acceptance rate | Poor prompts | Prompt engineering session |
| Security concerns | Misunderstanding | Compliance review |
| Performance complaints | Infrastructure | Check with IT |

**Escalation Path:**
1. Peer support (Slack)
2. Team lead
3. AI Tools admin
4. Vendor support

---

## Certification

### Requirements

| Level | Requirements |
|-------|--------------|
| Basic | Complete Tracks 1-3, pass quiz |
| Advanced | Basic + Track 4, practical exam |
| Champion | Advanced + Track 5, train others |

### Quiz Format

- 20 multiple choice questions
- 70% passing score
- Open book (except security section)
- Retake allowed after 24 hours

### Practical Exam (Advanced)

Complete 3 tasks in 60 minutes:
1. Generate a feature with tests
2. Debug a provided bug
3. Optimize provided code

Graded on:
- Prompt quality
- Result accuracy
- Best practices followed

---

## Resources

### Quick Reference Card

```
┌─────────────────────────────────────────────┐
│ AI TOOL QUICK REFERENCE                     │
├─────────────────────────────────────────────┤
│ PROMPTING                                   │
│ ✓ Be specific                               │
│ ✓ Provide context                           │
│ ✓ Specify output format                     │
│ ✓ Iterate and refine                        │
├─────────────────────────────────────────────┤
│ SECURITY                                    │
│ ✗ No secrets                                │
│ ✗ No PII                                    │
│ ✗ No customer data                          │
│ ✓ Always review generated code              │
├─────────────────────────────────────────────┤
│ SUPPORT                                     │
│ Slack: #ai-tools                            │
│ Wiki: wiki.company.com/ai-tools             │
│ Office hours: Thursdays 2-3pm               │
└─────────────────────────────────────────────┘
```

### Additional Materials

- Video tutorials: [internal-link]
- Practice exercises: [internal-link]
- FAQ: [internal-link]
- Prompt library: [203-DR-TMPL-ai-prompt-packs.md](./203-DR-TMPL-ai-prompt-packs.md)
