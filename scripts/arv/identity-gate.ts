#!/usr/bin/env npx tsx
/**
 * ARV Identity Gate
 *
 * Phase 31: Enterprise SSO & SCIM
 *
 * Verifies identity management controls are properly implemented:
 * 1. Identity module exists with required exports
 * 2. OIDC service has PKCE and JWKS support
 * 3. SAML service has assertion validation
 * 4. SCIM service has full CRUD operations
 * 5. Role mapping engine with condition evaluation
 * 6. Identity audit events integrated
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// =============================================================================
// Types
// =============================================================================

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string[];
}

// =============================================================================
// Checks
// =============================================================================

/**
 * Check 1: Identity module index exists and has all exports
 */
function checkIdentityModule(): CheckResult {
  const indexPath = join(ROOT, 'packages/core/src/identity/index.ts');

  if (!existsSync(indexPath)) {
    return {
      name: 'Identity Module',
      passed: false,
      message: 'Identity module index not found',
      details: [`Expected: ${indexPath}`],
    };
  }

  const content = readFileSync(indexPath, 'utf-8');
  const requiredExports = [
    // Types
    'OidcConfig',
    'SamlConfig',
    'ScimUser',
    'ScimGroup',
    'RoleMappingRule',
    'OrgIdentityConfig',
    'IdentityAuditEvent',
    // Store
    'IdentityStore',
    'InMemoryIdentityStore',
    'getIdentityStore',
    // OIDC
    'OidcService',
    'generateCodeVerifier',
    'generateCodeChallenge',
    // SAML
    'SamlService',
    // SCIM
    'ScimService',
    'SCIM_SCHEMAS',
    'hashScimToken',
    // Mapping
    'RoleMappingEngine',
    'buildContextFromOidc',
    'buildContextFromSaml',
  ];

  const missing = requiredExports.filter(exp => !content.includes(exp));

  if (missing.length > 0) {
    return {
      name: 'Identity Module',
      passed: false,
      message: `Identity module missing exports: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`,
      details: missing.map(m => `Missing: ${m}`),
    };
  }

  return {
    name: 'Identity Module',
    passed: true,
    message: 'Identity module present with all required exports',
  };
}

/**
 * Check 2: OIDC service has required functionality
 */
function checkOidcService(): CheckResult {
  const oidcPath = join(ROOT, 'packages/core/src/identity/oidc.ts');

  if (!existsSync(oidcPath)) {
    return {
      name: 'OIDC Service',
      passed: false,
      message: 'OIDC service not found',
      details: [`Expected: ${oidcPath}`],
    };
  }

  const content = readFileSync(oidcPath, 'utf-8');
  const requiredFeatures = [
    // PKCE
    { name: 'PKCE code verifier', pattern: 'generateCodeVerifier' },
    { name: 'PKCE code challenge', pattern: 'generateCodeChallenge' },
    { name: 'S256 method', pattern: "'S256'" },
    // State/Nonce
    { name: 'State generation', pattern: 'generateState' },
    { name: 'Nonce generation', pattern: 'generateNonce' },
    { name: 'State validation', pattern: 'consumeSsoState' },
    // Token validation
    { name: 'JWKS fetch', pattern: 'getJwks' },
    { name: 'ID token validation', pattern: 'validateIdToken' },
    { name: 'Issuer validation', pattern: 'claims.iss !== config.issuer' },
    { name: 'Audience validation', pattern: 'audiences.includes(config.clientId)' },
    { name: 'Expiration check', pattern: 'claims.exp < now' },
    { name: 'Nonce validation', pattern: 'claims.nonce !== expectedNonce' },
    // Audit
    { name: 'Audit event logging', pattern: 'appendAuditEvent' },
  ];

  const missing = requiredFeatures.filter(f => !content.includes(f.pattern));

  if (missing.length > 0) {
    return {
      name: 'OIDC Service',
      passed: false,
      message: `OIDC service missing features: ${missing.map(m => m.name).join(', ')}`,
      details: missing.map(m => `Missing: ${m.name}`),
    };
  }

  return {
    name: 'OIDC Service',
    passed: true,
    message: 'OIDC service has PKCE, JWKS, and proper validation',
  };
}

/**
 * Check 3: SAML service has required functionality
 */
function checkSamlService(): CheckResult {
  const samlPath = join(ROOT, 'packages/core/src/identity/saml.ts');

  if (!existsSync(samlPath)) {
    return {
      name: 'SAML Service',
      passed: false,
      message: 'SAML service not found',
      details: [`Expected: ${samlPath}`],
    };
  }

  const content = readFileSync(samlPath, 'utf-8');
  const requiredFeatures = [
    // Request building
    { name: 'AuthnRequest builder', pattern: 'buildAuthnRequest' },
    { name: 'Request encoding', pattern: 'encodeSamlRequest' },
    { name: 'RelayState', pattern: 'RelayState' },
    // Response parsing
    { name: 'Response parsing', pattern: 'parseSamlResponse' },
    { name: 'Assertion extraction', pattern: 'SamlAssertion' },
    { name: 'NameID extraction', pattern: 'nameId' },
    // Validation
    { name: 'Signature validation', pattern: 'validateSignature' },
    { name: 'Issuer validation', pattern: 'assertion.issuer !== config.entityId' },
    { name: 'Audience validation', pattern: 'assertion.audience' },
    { name: 'Time condition check', pattern: 'notOnOrAfter' },
    // Metadata
    { name: 'SP metadata generation', pattern: 'generateSpMetadata' },
    // Audit
    { name: 'Audit event logging', pattern: 'appendAuditEvent' },
  ];

  const missing = requiredFeatures.filter(f => !content.includes(f.pattern));

  if (missing.length > 0) {
    return {
      name: 'SAML Service',
      passed: false,
      message: `SAML service missing features: ${missing.map(m => m.name).join(', ')}`,
      details: missing.map(m => `Missing: ${m.name}`),
    };
  }

  return {
    name: 'SAML Service',
    passed: true,
    message: 'SAML service has assertion validation and SP metadata',
  };
}

/**
 * Check 4: SCIM service has full CRUD
 */
function checkScimService(): CheckResult {
  const scimPath = join(ROOT, 'packages/core/src/identity/scim.ts');

  if (!existsSync(scimPath)) {
    return {
      name: 'SCIM Service',
      passed: false,
      message: 'SCIM service not found',
      details: [`Expected: ${scimPath}`],
    };
  }

  const content = readFileSync(scimPath, 'utf-8');
  const requiredFeatures = [
    // User CRUD
    { name: 'Get user', pattern: 'getUser(' },
    { name: 'List users', pattern: 'listUsers(' },
    { name: 'Create user', pattern: 'createUser(' },
    { name: 'Replace user', pattern: 'replaceUser(' },
    { name: 'Patch user', pattern: 'patchUser(' },
    { name: 'Delete user', pattern: 'deleteUser(' },
    // Group CRUD
    { name: 'Get group', pattern: 'getGroup(' },
    { name: 'List groups', pattern: 'listGroups(' },
    { name: 'Create group', pattern: 'createGroup(' },
    { name: 'Replace group', pattern: 'replaceGroup(' },
    { name: 'Patch group', pattern: 'patchGroup(' },
    { name: 'Delete group', pattern: 'deleteGroup(' },
    // Auth
    { name: 'Token validation', pattern: 'validateToken' },
    { name: 'Bearer token', pattern: 'bearerToken' },
    // SCIM compliance
    { name: 'SCIM schemas constant', pattern: 'SCIM_SCHEMAS' },
    { name: 'List response schema', pattern: 'ListResponse' },
    { name: 'Error response', pattern: 'errorResponse' },
    // Audit
    { name: 'Audit event logging', pattern: 'logAuditEvent' },
  ];

  const missing = requiredFeatures.filter(f => !content.includes(f.pattern));

  if (missing.length > 0) {
    return {
      name: 'SCIM Service',
      passed: false,
      message: `SCIM service missing features: ${missing.map(m => m.name).join(', ')}`,
      details: missing.map(m => `Missing: ${m.name}`),
    };
  }

  return {
    name: 'SCIM Service',
    passed: true,
    message: 'SCIM service has full User and Group CRUD with auth',
  };
}

/**
 * Check 5: Role mapping engine
 */
function checkRoleMapping(): CheckResult {
  const mappingPath = join(ROOT, 'packages/core/src/identity/mapping.ts');

  if (!existsSync(mappingPath)) {
    return {
      name: 'Role Mapping',
      passed: false,
      message: 'Role mapping engine not found',
      details: [`Expected: ${mappingPath}`],
    };
  }

  const content = readFileSync(mappingPath, 'utf-8');
  const requiredFeatures = [
    // Core engine
    { name: 'Mapping engine class', pattern: 'RoleMappingEngine' },
    { name: 'Map role method', pattern: 'mapRole(' },
    { name: 'Evaluate rule', pattern: 'evaluateRule(' },
    { name: 'Evaluate condition', pattern: 'evaluateCondition(' },
    // Operators (schema supports: equals, contains, matches, in)
    { name: 'Equals operator', pattern: "case 'equals'" },
    { name: 'Contains operator', pattern: "case 'contains'" },
    { name: 'Matches (regex) operator', pattern: "case 'matches'" },
    { name: 'In operator', pattern: "case 'in'" },
    // Context builders
    { name: 'OIDC context builder', pattern: 'buildContextFromOidc' },
    { name: 'SAML context builder', pattern: 'buildContextFromSaml' },
    { name: 'SCIM context builder', pattern: 'buildContextFromScim' },
    // Priority
    { name: 'Priority sorting', pattern: 'sort((a, b) => a.priority - b.priority)' },
    // Audit
    { name: 'Mapping audit event', pattern: 'logMappingEvent' },
  ];

  const missing = requiredFeatures.filter(f => !content.includes(f.pattern));

  if (missing.length > 0) {
    return {
      name: 'Role Mapping',
      passed: false,
      message: `Role mapping missing features: ${missing.map(m => m.name).join(', ')}`,
      details: missing.map(m => `Missing: ${m.name}`),
    };
  }

  return {
    name: 'Role Mapping',
    passed: true,
    message: 'Role mapping engine with condition operators and context builders',
  };
}

/**
 * Check 6: Identity store with all methods
 */
function checkIdentityStore(): CheckResult {
  const storePath = join(ROOT, 'packages/core/src/identity/store.ts');

  if (!existsSync(storePath)) {
    return {
      name: 'Identity Store',
      passed: false,
      message: 'Identity store not found',
      details: [`Expected: ${storePath}`],
    };
  }

  const content = readFileSync(storePath, 'utf-8');
  const requiredMethods = [
    // Org config
    'getOrgIdentityConfig',
    'saveOrgIdentityConfig',
    'deleteOrgIdentityConfig',
    // SSO state
    'saveSsoState',
    'consumeSsoState',
    'cleanupExpiredSsoStates',
    // Linked identities
    'getLinkedIdentityByExternalId',
    'getLinkedIdentitiesForUser',
    'saveLinkedIdentity',
    'deleteLinkedIdentity',
    // SCIM users
    'getScimUser',
    'getScimUserByExternalId',
    'getScimUserByUsername',
    'listScimUsers',
    'createScimUser',
    'updateScimUser',
    'deleteScimUser',
    // SCIM groups
    'getScimGroup',
    'getScimGroupByExternalId',
    'listScimGroups',
    'createScimGroup',
    'updateScimGroup',
    'deleteScimGroup',
    // Audit
    'appendAuditEvent',
    'queryAuditEvents',
  ];

  const missing = requiredMethods.filter(m => !content.includes(m));

  if (missing.length > 0) {
    return {
      name: 'Identity Store',
      passed: false,
      message: `Identity store missing methods: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`,
      details: missing.map(m => `Missing: ${m}`),
    };
  }

  // Check for in-memory implementation
  if (!content.includes('InMemoryIdentityStore')) {
    return {
      name: 'Identity Store',
      passed: false,
      message: 'Missing InMemoryIdentityStore implementation',
    };
  }

  return {
    name: 'Identity Store',
    passed: true,
    message: 'Identity store with all CRUD methods for config, users, groups, audit',
  };
}

/**
 * Check 7: Types with Zod schemas
 */
function checkTypes(): CheckResult {
  const typesPath = join(ROOT, 'packages/core/src/identity/types.ts');

  if (!existsSync(typesPath)) {
    return {
      name: 'Identity Types',
      passed: false,
      message: 'Identity types not found',
      details: [`Expected: ${typesPath}`],
    };
  }

  const content = readFileSync(typesPath, 'utf-8');
  const requiredSchemas = [
    'OidcConfigSchema',
    'SamlConfigSchema',
    'IdpConfigSchema',
    'ScimTokenSchema',
    'ScimConfigSchema',
    'RoleMappingConditionSchema',
    'RoleMappingRuleSchema',
    'OrgIdentityConfigSchema',
    'SsoStateSchema',
    'LinkedIdentitySchema',
    'ScimUserSchema',
    'ScimGroupSchema',
    'IdentityAuditEventSchema',
  ];

  const missing = requiredSchemas.filter(s => !content.includes(s));

  if (missing.length > 0) {
    return {
      name: 'Identity Types',
      passed: false,
      message: `Identity types missing schemas: ${missing.join(', ')}`,
      details: missing.map(m => `Missing: ${m}`),
    };
  }

  // Check for Zod usage
  if (!content.includes("from 'zod'") && !content.includes('from "zod"')) {
    return {
      name: 'Identity Types',
      passed: false,
      message: 'Types not using Zod for schema validation',
    };
  }

  return {
    name: 'Identity Types',
    passed: true,
    message: 'Identity types with Zod schemas for all entities',
  };
}

/**
 * Check 8: Core package exports identity module
 */
function checkCoreExports(): CheckResult {
  const corePath = join(ROOT, 'packages/core/src/index.ts');

  if (!existsSync(corePath)) {
    return {
      name: 'Core Exports',
      passed: false,
      message: 'Core index not found',
    };
  }

  const content = readFileSync(corePath, 'utf-8');

  if (!content.includes("'./identity/index.js'") && !content.includes('"./identity/index.js"')) {
    return {
      name: 'Core Exports',
      passed: false,
      message: 'Core package does not export identity module',
      details: ["Expected: export * from './identity/index.js'"],
    };
  }

  return {
    name: 'Core Exports',
    passed: true,
    message: 'Core package exports identity module',
  };
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Identity Gate (Phase 31: SSO & SCIM)             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  const checks = [
    checkIdentityModule,
    checkOidcService,
    checkSamlService,
    checkScimService,
    checkRoleMapping,
    checkIdentityStore,
    checkTypes,
    checkCoreExports,
  ];

  const results: CheckResult[] = [];

  for (const check of checks) {
    const result = check();
    results.push(result);

    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}`);

    if (result.details && result.details.length > 0) {
      for (const detail of result.details.slice(0, 5)) {
        console.log(`   - ${detail}`);
      }
      if (result.details.length > 5) {
        console.log(`   ... and ${result.details.length - 5} more`);
      }
    }
    console.log();
  }

  // Summary
  console.log('═'.repeat(60));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Identity Gate: ${passed}/${results.length} checks passed`);

  if (failed > 0) {
    console.log('\n❌ IDENTITY GATE FAILED');
    console.log('Fix the above issues before proceeding.');
    process.exit(1);
  }

  console.log('\n✅ IDENTITY GATE PASSED');
  console.log('Phase 31 enterprise identity controls verified.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
