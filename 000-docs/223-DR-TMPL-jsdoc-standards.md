# JSDoc Standards Template

> **Document**: 223-DR-TMPL-jsdoc-standards
> **Epic**: EPIC 012 - Documentation Generation
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Consistent JSDoc annotations enable automated documentation generation. This template defines standards for documenting TypeScript code.

---

## Basic Structure

### Function Documentation

```typescript
/**
 * Brief one-line description of what the function does.
 *
 * Longer description with more details. Can span multiple lines.
 * Include important behavior notes, edge cases, or caveats here.
 *
 * @param paramName - Description of the parameter
 * @param options - Configuration options
 * @param options.field1 - Description of nested field
 * @param options.field2 - Description of another field
 * @returns Description of what is returned
 * @throws {ErrorType} When this error occurs
 *
 * @example
 * ```typescript
 * const result = myFunction('input', { field1: true });
 * console.log(result); // expected output
 * ```
 *
 * @since 1.0.0
 * @see {@link relatedFunction} for related functionality
 * @deprecated Use {@link newFunction} instead
 */
export function myFunction(paramName: string, options: Options): ReturnType {
  // ...
}
```

---

## Tag Reference

### Essential Tags

| Tag | Usage | Required |
|-----|-------|----------|
| `@param` | Document each parameter | Yes |
| `@returns` | Document return value | Yes (if returns) |
| `@throws` | Document thrown errors | Yes (if throws) |
| `@example` | Show usage example | Recommended |

### Optional Tags

| Tag | Usage | When to Use |
|-----|-------|-------------|
| `@since` | Version introduced | API additions |
| `@deprecated` | Mark as deprecated | Before removal |
| `@see` | Link related items | Cross-references |
| `@internal` | Mark as internal | Non-public APIs |
| `@alpha` | Alpha stability | Early features |
| `@beta` | Beta stability | Testing features |
| `@public` | Public API | Exported items |
| `@readonly` | Read-only property | Immutable values |
| `@default` | Default value | Optional params |

---

## Documentation by Type

### Classes

```typescript
/**
 * Manages user authentication and session state.
 *
 * The AuthManager handles login, logout, token refresh, and session
 * validation. It integrates with the identity provider and maintains
 * local session cache for performance.
 *
 * @example
 * ```typescript
 * const auth = new AuthManager({
 *   provider: 'google',
 *   clientId: 'xxx',
 * });
 *
 * await auth.login();
 * const user = auth.getCurrentUser();
 * ```
 *
 * @see {@link SessionStore} for session persistence
 * @see {@link TokenManager} for token handling
 */
export class AuthManager {
  /**
   * Current authentication state.
   * @readonly
   */
  readonly state: AuthState;

  /**
   * Creates a new AuthManager instance.
   *
   * @param config - Authentication configuration
   * @param config.provider - Identity provider name
   * @param config.clientId - OAuth client ID
   * @param config.scopes - Requested OAuth scopes
   */
  constructor(config: AuthConfig) {
    // ...
  }

  /**
   * Initiates the login flow.
   *
   * Opens the identity provider login page and waits for callback.
   * On success, stores tokens and updates authentication state.
   *
   * @param options - Login options
   * @param options.redirect - URL to redirect after login
   * @param options.prompt - Whether to force re-authentication
   * @returns The authenticated user
   * @throws {AuthError} If login fails or is cancelled
   *
   * @example
   * ```typescript
   * try {
   *   const user = await auth.login({ redirect: '/dashboard' });
   *   console.log(`Welcome, ${user.name}`);
   * } catch (error) {
   *   console.error('Login failed:', error.message);
   * }
   * ```
   */
  async login(options?: LoginOptions): Promise<User> {
    // ...
  }
}
```

### Interfaces

```typescript
/**
 * Configuration for creating a new run.
 *
 * @example
 * ```typescript
 * const config: RunConfig = {
 *   type: 'triage',
 *   target: 'https://github.com/org/repo/pull/123',
 *   options: { detailed: true }
 * };
 * ```
 */
export interface RunConfig {
  /**
   * Type of run to execute.
   * - `triage`: Score PR complexity
   * - `review`: Generate review summary
   * - `resolve`: Resolve merge conflicts
   */
  type: RunType;

  /**
   * Target URL (PR, issue, or repository).
   */
  target: string;

  /**
   * Additional run options.
   * @default {}
   */
  options?: RunOptions;

  /**
   * Callback for progress updates.
   * Called with percentage (0-100) as run progresses.
   */
  onProgress?: (percent: number) => void;
}
```

### Type Aliases

```typescript
/**
 * Unique identifier for a run.
 *
 * Format: `run-{timestamp}-{random}`
 *
 * @example
 * ```typescript
 * const id: RunId = 'run-1706918400000-abc123';
 * ```
 */
export type RunId = `run-${number}-${string}`;

/**
 * Status of a pipeline run.
 *
 * State transitions:
 * ```
 * pending → running → completed
 *                  → failed
 *                  → cancelled
 * ```
 */
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
```

### Enums

```typescript
/**
 * Severity levels for log messages.
 *
 * Ordered from most to least severe. Use appropriate level
 * based on impact and actionability.
 */
export enum LogLevel {
  /**
   * System is unusable. Immediate action required.
   * @example Database connection lost, out of memory
   */
  FATAL = 0,

  /**
   * Error that needs attention but system can continue.
   * @example API request failed, invalid input
   */
  ERROR = 1,

  /**
   * Potentially harmful situation.
   * @example Deprecated API usage, approaching quota
   */
  WARN = 2,

  /**
   * General operational information.
   * @example Request processed, user logged in
   */
  INFO = 3,

  /**
   * Detailed debugging information.
   * @example Function entry/exit, variable values
   */
  DEBUG = 4,
}
```

### Constants

```typescript
/**
 * Maximum number of retries for transient failures.
 *
 * Used by the retry middleware for API calls. Exponential
 * backoff is applied between attempts.
 *
 * @see {@link RetryPolicy} for retry configuration
 */
export const MAX_RETRIES = 3;

/**
 * Default timeout for API requests in milliseconds.
 *
 * Can be overridden per-request via options.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Supported AI model identifiers.
 *
 * @example
 * ```typescript
 * if (SUPPORTED_MODELS.includes(userModel)) {
 *   // Model is valid
 * }
 * ```
 */
export const SUPPORTED_MODELS = [
  'claude-sonnet-4',
  'claude-opus-4',
  'gpt-4o',
  'gemini-2.0-flash',
] as const;
```

---

## Patterns

### Async Functions

```typescript
/**
 * Fetches user data from the API.
 *
 * Makes an authenticated request to the user service.
 * Results are cached for 5 minutes.
 *
 * @param userId - The user's unique identifier
 * @returns The user data, or null if not found
 * @throws {AuthError} If not authenticated
 * @throws {NetworkError} If request fails
 *
 * @example
 * ```typescript
 * const user = await fetchUser('usr_abc123');
 * if (user) {
 *   console.log(user.name);
 * }
 * ```
 */
async function fetchUser(userId: string): Promise<User | null> {
  // ...
}
```

### Callbacks

```typescript
/**
 * Registers a listener for run status changes.
 *
 * The callback is invoked whenever the run transitions
 * to a new status. Multiple listeners can be registered.
 *
 * @param runId - The run to monitor
 * @param callback - Function called on status change
 * @param callback.status - The new status
 * @param callback.timestamp - When the change occurred
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * const unsubscribe = onStatusChange('run-123', ({ status }) => {
 *   console.log(`Run is now: ${status}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
function onStatusChange(
  runId: string,
  callback: (event: StatusChangeEvent) => void
): () => void {
  // ...
}
```

### Factory Functions

```typescript
/**
 * Creates a configured HTTP client instance.
 *
 * The client includes automatic retry, timeout, and
 * authentication handling.
 *
 * @param config - Client configuration
 * @returns Configured HTTP client
 *
 * @example
 * ```typescript
 * const client = createHttpClient({
 *   baseUrl: 'https://api.example.com',
 *   timeout: 5000,
 * });
 *
 * const data = await client.get('/users');
 * ```
 */
function createHttpClient(config: HttpClientConfig): HttpClient {
  // ...
}
```

### Overloaded Functions

```typescript
/**
 * Formats a value for display.
 *
 * @param value - Number to format
 * @returns Formatted string with commas
 */
function format(value: number): string;

/**
 * Formats a date for display.
 *
 * @param value - Date to format
 * @param pattern - Format pattern (default: 'YYYY-MM-DD')
 * @returns Formatted date string
 */
function format(value: Date, pattern?: string): string;

/**
 * Formats a value for display.
 *
 * Handles numbers, dates, and strings with appropriate
 * formatting for each type.
 *
 * @example
 * ```typescript
 * format(1234567);        // '1,234,567'
 * format(new Date());     // '2026-02-03'
 * format(new Date(), 'MMM D'); // 'Feb 3'
 * ```
 */
function format(value: number | Date, pattern?: string): string {
  // ...
}
```

---

## Best Practices

### Do

- Start with a verb (Creates, Returns, Handles)
- Document all public APIs
- Include working examples
- Document error conditions
- Link to related items
- Keep descriptions concise but complete

### Don't

- Repeat the function name in description
- Document obvious things (getter returns value)
- Use vague descriptions ("does stuff")
- Leave out error documentation
- Write examples that don't compile
- Document internal implementation details

---

## ESLint Configuration

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['jsdoc'],
  rules: {
    'jsdoc/require-jsdoc': ['warn', {
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
        ArrowFunctionExpression: false,
      },
      publicOnly: true,
    }],
    'jsdoc/require-param': 'warn',
    'jsdoc/require-param-description': 'warn',
    'jsdoc/require-param-type': 'off', // TypeScript provides types
    'jsdoc/require-returns': 'warn',
    'jsdoc/require-returns-description': 'warn',
    'jsdoc/require-throws': 'warn',
    'jsdoc/check-param-names': 'error',
    'jsdoc/check-tag-names': 'error',
    'jsdoc/check-types': 'off', // TypeScript provides types
    'jsdoc/valid-types': 'off', // TypeScript provides types
  },
};
```

---

## Related Documentation

- [222-DR-SPEC-documentation-generation.md](./222-DR-SPEC-documentation-generation.md)
- [TypeDoc](https://typedoc.org/)
- [JSDoc Reference](https://jsdoc.app/)
