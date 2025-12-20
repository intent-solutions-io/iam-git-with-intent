# Firestore Security Rules Tests

This directory contains tests for the Firestore security rules defined in `/firestore.rules`.

## Running the Tests

The Firestore rules tests require the Firebase emulator to be running. Follow these steps:

### 1. Start the Firestore Emulator

From the project root:

```bash
firebase emulators:start --only firestore
```

The emulator will start on `localhost:8080` by default.

### 2. Run the Tests

In a separate terminal, run:

```bash
npm test
```

Or to run only the Firestore rules tests:

```bash
cd packages/core
npm test -- firestore-rules
```

## Test Coverage

The test suite (`firestore-rules.test.ts`) validates:

1. **Tenant Isolation**
   - Users can only access data within their tenant
   - Cross-tenant read/write attempts are blocked
   - Tenant ID validation against user claims

2. **RBAC (Role-Based Access Control)**
   - Owner role permissions
   - Admin role permissions
   - Developer role permissions
   - Member (viewer) role permissions

3. **Collection-Level Rules**
   - Tenants collection
   - Runs collection
   - Users collection
   - Memberships collection
   - Audit events (immutable)
   - Idempotency records (service account only)
   - Repos subcollection
   - Settings subcollection

4. **Service Account Access**
   - Service accounts can bypass user restrictions
   - Service account detection via custom claims

5. **Suspended Tenants**
   - Suspended tenants cannot write data
   - Read access remains for visibility

6. **Default Deny**
   - Unknown collections are denied
   - Unauthenticated access is denied

## Test Architecture

- Tests use `@firebase/rules-unit-testing` to simulate different authentication contexts
- Each test creates isolated authenticated/unauthenticated Firestore instances
- Data is seeded before each test and cleared between tests
- Tests automatically skip if the emulator is not running (no CI failures)

## CI/CD

In CI environments where the emulator is not running, these tests will be skipped with a warning message. To enable them in CI:

1. Add Firebase emulator to the CI environment
2. Start the emulator before running tests
3. Ensure port 8080 is available

Example GitHub Actions:

```yaml
- name: Start Firestore Emulator
  run: firebase emulators:start --only firestore &

- name: Wait for Emulator
  run: sleep 5

- name: Run Tests
  run: npm test
```

## Security Considerations

These tests validate **defense-in-depth** security controls:

- Application-layer security (implemented in storage adapters)
- Database-layer security (enforced by Firestore rules)

Both layers must be tested and maintained independently.

## Related Files

- `/firestore.rules` - The rules being tested
- `/firestore.indexes.json` - Firestore indexes configuration
- `/firebase.json` - Firebase project configuration
