# AI Tool Golden Tasks

> **Document**: 202-DR-TEST-ai-golden-tasks
> **Epic**: EPIC 026 - AI Tool Rollout Framework
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Standardized evaluation tasks for comparing AI coding assistants. Each task tests specific capabilities with objective scoring criteria.

---

## Task Categories

| Category | Weight | Tasks |
|----------|--------|-------|
| Code Generation | 30% | GT-001 to GT-005 |
| Bug Fixing | 25% | GT-006 to GT-010 |
| Refactoring | 20% | GT-011 to GT-015 |
| Documentation | 15% | GT-016 to GT-018 |
| Testing | 10% | GT-019 to GT-020 |

---

## Code Generation Tasks

### GT-001: REST API Endpoint

**Prompt:**
```
Create a TypeScript REST API endpoint for user registration with:
- Email validation
- Password strength requirements (8+ chars, 1 uppercase, 1 number)
- Rate limiting (5 requests per minute per IP)
- Return proper HTTP status codes
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Correct HTTP methods | 2 |
| Input validation | 3 |
| Error handling | 2 |
| Security considerations | 2 |
| Clean code structure | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

### GT-002: Database Query Optimization

**Prompt:**
```
Optimize this SQL query that takes 30 seconds on a 10M row table:

SELECT * FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at > '2025-01-01'
ORDER BY o.total DESC
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Identifies missing indexes | 3 |
| Removes SELECT * | 2 |
| Suggests pagination | 2 |
| Query restructuring | 2 |
| Explains reasoning | 1 |
| **Total** | **10** |

**Pass threshold:** 6/10

---

### GT-003: React Component with State

**Prompt:**
```
Create a React component for a shopping cart that:
- Shows item list with quantities
- Allows quantity updates
- Calculates total with tax (8%)
- Persists to localStorage
- Has loading and error states
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Correct React patterns | 2 |
| State management | 2 |
| localStorage handling | 2 |
| Error boundaries | 2 |
| Accessibility | 1 |
| TypeScript types | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

### GT-004: CLI Tool

**Prompt:**
```
Create a Node.js CLI tool that:
- Takes a directory path as argument
- Recursively finds all TODO comments
- Groups by file
- Outputs as JSON or table (--format flag)
- Supports --ignore patterns
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Argument parsing | 2 |
| Recursive file handling | 2 |
| Pattern matching | 2 |
| Output formatting | 2 |
| Error handling | 1 |
| Help documentation | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

### GT-005: Async Data Pipeline

**Prompt:**
```
Create a data processing pipeline that:
- Reads from a CSV file (100k rows)
- Transforms data (parse dates, normalize fields)
- Validates against a schema
- Writes valid rows to DB, invalid to error file
- Shows progress bar
- Handles backpressure
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Stream processing | 3 |
| Error handling per row | 2 |
| Backpressure handling | 2 |
| Progress reporting | 1 |
| Schema validation | 1 |
| Memory efficiency | 1 |
| **Total** | **10** |

**Pass threshold:** 6/10

---

## Bug Fixing Tasks

### GT-006: Race Condition

**Prompt:**
```
Fix the race condition in this code:

let balance = 0;

async function deposit(amount) {
  const current = balance;
  await saveToDatabase(current + amount);
  balance = current + amount;
}

// Called concurrently: deposit(100), deposit(50)
// Expected balance: 150, Actual: sometimes 100 or 50
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Identifies race condition | 2 |
| Implements locking/mutex | 3 |
| Maintains async behavior | 2 |
| Handles errors | 2 |
| Explains fix | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

### GT-007: Memory Leak

**Prompt:**
```
Find and fix the memory leak:

class WebSocketManager {
  constructor() {
    this.connections = new Map();
  }

  addConnection(id, socket) {
    socket.on('message', (data) => {
      this.broadcast(data);
    });
    this.connections.set(id, socket);
  }

  removeConnection(id) {
    this.connections.delete(id);
  }
}
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Identifies event listener leak | 3 |
| Proper cleanup on remove | 3 |
| Suggests WeakMap or cleanup | 2 |
| Handles edge cases | 1 |
| Explains reasoning | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

### GT-008: SQL Injection

**Prompt:**
```
Fix the SQL injection vulnerability:

app.get('/users', (req, res) => {
  const query = `SELECT * FROM users WHERE name = '${req.query.name}'`;
  db.query(query, (err, results) => {
    res.json(results);
  });
});
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Uses parameterized query | 4 |
| Input validation | 2 |
| Error handling | 2 |
| Doesn't break functionality | 1 |
| Explains vulnerability | 1 |
| **Total** | **10** |

**Pass threshold:** 8/10

---

### GT-009: Timezone Bug

**Prompt:**
```
Fix the timezone handling:

function formatEventTime(event) {
  const date = new Date(event.timestamp);
  return date.toLocaleString(); // Shows wrong time for users in different timezones
}

// event.timestamp is stored as: "2025-06-15T14:00:00" (meant to be EST)
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Identifies timezone issue | 2 |
| Uses proper timezone handling | 3 |
| Considers user locale | 2 |
| Recommends UTC storage | 2 |
| Explains fix | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

### GT-010: Infinite Loop

**Prompt:**
```
Fix the infinite loop that crashes the browser:

function flattenTree(node) {
  const result = [node];
  if (node.children) {
    node.children.forEach(child => {
      child.parent = node; // Added for back-navigation
      result.push(...flattenTree(child));
    });
  }
  return result;
}

// Crashes when called on tree with circular references
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Identifies circular ref issue | 2 |
| Implements visited tracking | 3 |
| Maintains functionality | 2 |
| Handles edge cases | 2 |
| Explains solution | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

## Refactoring Tasks

### GT-011: Extract Method

**Prompt:**
```
Refactor this 200-line function into smaller, testable units:

async function processOrder(order) {
  // Validate order (30 lines)
  // Calculate pricing (40 lines)
  // Apply discounts (35 lines)
  // Check inventory (25 lines)
  // Process payment (40 lines)
  // Send confirmation (30 lines)
}
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Logical separation | 3 |
| Single responsibility | 2 |
| Testability improved | 2 |
| Error handling preserved | 2 |
| Clean interfaces | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

### GT-012: Replace Conditionals with Polymorphism

**Prompt:**
```
Refactor to remove the switch statement:

function calculateShipping(order) {
  switch (order.shippingMethod) {
    case 'standard': return order.weight * 0.5;
    case 'express': return order.weight * 1.0 + 5;
    case 'overnight': return order.weight * 2.0 + 15;
    case 'international': return order.weight * 3.0 + 25;
  }
}
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Uses strategy/polymorphism | 3 |
| Extensible design | 2 |
| Type safety | 2 |
| Maintains behavior | 2 |
| Clean code | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

## Documentation Tasks

### GT-016: API Documentation

**Prompt:**
```
Generate OpenAPI documentation for this endpoint:

POST /api/v1/orders
- Creates a new order
- Requires authentication
- Body: { items: [{productId, quantity}], shippingAddress: {...} }
- Returns: order object with ID and estimated delivery
- Can return 400, 401, 402, 500
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Correct OpenAPI syntax | 2 |
| Complete schema definitions | 2 |
| All response codes documented | 2 |
| Authentication specified | 2 |
| Examples included | 2 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

## Testing Tasks

### GT-019: Unit Test Generation

**Prompt:**
```
Generate comprehensive unit tests for this function:

function validatePassword(password) {
  if (password.length < 8) return { valid: false, error: 'Too short' };
  if (!/[A-Z]/.test(password)) return { valid: false, error: 'Need uppercase' };
  if (!/[0-9]/.test(password)) return { valid: false, error: 'Need number' };
  if (!/[!@#$%]/.test(password)) return { valid: false, error: 'Need special char' };
  return { valid: true };
}
```

**Scoring Rubric:**
| Criterion | Points |
|-----------|--------|
| Tests all branches | 3 |
| Edge cases covered | 2 |
| Clear test names | 2 |
| Proper assertions | 2 |
| Test organization | 1 |
| **Total** | **10** |

**Pass threshold:** 7/10

---

## Scoring Summary

**Total possible points:** 200 (20 tasks × 10 points)

| Rating | Score Range | Recommendation |
|--------|-------------|----------------|
| Excellent | 180-200 | Strongly recommend |
| Good | 150-179 | Recommend with notes |
| Acceptable | 120-149 | Conditional approval |
| Poor | < 120 | Do not recommend |

---

## Running Evaluations

```bash
# Run full evaluation suite
gwi evaluate --tool <tool-name> --task-set golden-v1 --output report.json

# Run specific category
gwi evaluate --tool claude-code --category bug-fixing

# Compare tools
gwi evaluate compare --tools "claude-code,copilot,cursor" --output comparison.md
```
