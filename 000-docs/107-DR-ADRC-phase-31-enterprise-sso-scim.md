# ADR-107: Phase 31 Enterprise SSO & SCIM

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2025-12-17 18:30 CST |
| Author | Claude Opus 4.5 |
| Phase | Phase 31: Enterprise SSO & SCIM |
| Supersedes | None |
| Beads Epic | git-with-intent-6ne |

## Context

Enterprise customers require:
1. Single Sign-On integration with their identity providers (Okta, Azure AD, etc.)
2. Automated user provisioning via SCIM 2.0
3. Deterministic role mapping from IdP claims to internal roles
4. Audit trail for all identity operations

Git With Intent previously had basic Firebase Auth with email/password. Enterprise SSO was identified as a critical requirement for B2B sales.

## Decision

### 1. Identity Data Model

**Decision**: Store identity configuration per organization in `OrgIdentityConfig`

**Structure**:
```typescript
interface OrgIdentityConfig {
  orgId: string;
  idpConfigs: Array<{
    id: string;
    name: string;
    enabled: boolean;
    config: OidcConfig | SamlConfig;  // Discriminated union
  }>;
  scimConfig?: ScimConfig;
  roleMappingRules: RoleMappingRule[];
  defaultRole: Role;
}
```

**Rationale**:
- Supports multiple IdPs per org (e.g., corporate SSO + contractor SSO)
- Discriminated union provides type safety for OIDC vs SAML
- Role mapping rules are org-specific, not global

### 2. OIDC Implementation

**Decision**: Implement OIDC with PKCE (S256), JWKS validation, strict claim checks

**Security Features**:
- PKCE code_challenge_method: S256 (mandatory)
- State parameter with server-side storage (10-minute TTL)
- Nonce validation against replay attacks
- JWKS fetching with 1-hour cache
- Strict issuer and audience validation
- Expiration and iat (issued-at) validation

**Trade-offs**:
| Approach | Pros | Cons |
|----------|------|------|
| PKCE | Public clients secure, no client_secret needed | Extra parameters |
| Server-side state | CSRF protection, no cookies needed | Storage required |
| JWKS caching | Performance | Stale keys possible |

### 3. SAML Implementation

**Decision**: Implement SAML 2.0 SP-initiated SSO with signature validation

**Security Features**:
- x509 certificate validation of assertion signatures
- Issuer and audience validation
- Time condition checks (NotBefore, NotOnOrAfter)
- NameID extraction with format awareness
- SP metadata generation for IdP configuration

**Note**: Full signature verification requires additional crypto library. Current implementation validates structure and certificate presence. Production deployments should add xml-crypto or similar.

### 4. SCIM 2.0 Implementation

**Decision**: Full RFC 7644 compliant SCIM 2.0 endpoints for Users and Groups

**Endpoints**:
- `GET /scim/v2/Users` - List with filtering and pagination
- `POST /scim/v2/Users` - Create user
- `GET /scim/v2/Users/{id}` - Get user
- `PUT /scim/v2/Users/{id}` - Replace user
- `PATCH /scim/v2/Users/{id}` - Partial update
- `DELETE /scim/v2/Users/{id}` - Delete user
- Same pattern for `/scim/v2/Groups`

**Authentication**:
- Bearer token authentication
- Tokens stored as SHA256 hashes
- Multiple tokens per org supported
- Token expiration and deactivation

### 5. Role Mapping Engine

**Decision**: Deterministic rule engine with condition evaluation and priority ordering

**Mapping Flow**:
1. Rules sorted by priority (lower number = higher priority)
2. Each rule's conditions evaluated (AND logic)
3. First matching rule determines role
4. Default role used if no rules match

**Operators**:
- `equals`: Exact match
- `contains`: Array contains value or string contains substring
- `startsWith`: String prefix match
- `endsWith`: String suffix match
- `matches`: Regex match
- `in`: Value in comma-separated list

**Context Sources**:
- OIDC: Groups from `groups` claim, roles from `roles` claim
- SAML: Groups from various attribute schemas (Microsoft, standard)
- SCIM: Groups from provisioned group membership

### 6. Audit Events

**Decision**: Append-only audit log for all identity operations

**Events Logged**:
- `sso.login.success` - Successful SSO authentication
- `sso.login.failed` - Failed authentication attempt
- `scim.user.created` - User provisioned via SCIM
- `scim.user.updated` - User modified via SCIM
- `scim.user.deleted` - User deprovisioned
- `scim.group.created/updated/deleted` - Group operations
- `role.mapped` - Role assignment from mapping rules

**Event Structure**:
```typescript
interface IdentityAuditEvent {
  id: string;
  timestamp: string;
  orgId: string;
  actor: { type: 'user' | 'system'; id: string; email?: string };
  action: string;
  target?: { type: string; id: string };
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}
```

## Alternatives Considered

### Identity Protocol
- **OIDC only**: Simpler, but excludes SAML-only enterprises
- **SAML only**: Legacy support, but losing OIDC momentum
- **Both (chosen)**: Maximum compatibility, more code

### SCIM Version
- **SCIM 1.1**: Older, less adoption
- **SCIM 2.0 (chosen)**: Current standard, better schema

### Role Mapping
- **Static mapping tables**: Simple but inflexible
- **Rule engine (chosen)**: Flexible conditions, priority support
- **Policy language (OPA/Rego)**: Too complex for this use case

### Token Storage
- **Redis sessions**: Fast but requires Redis
- **JWT-only**: Stateless but hard to revoke
- **Server-side state (chosen)**: Works with in-memory/Firestore

## Consequences

### Positive
- Enterprise customers can use existing IdPs
- Automated user lifecycle via SCIM reduces admin burden
- Deterministic role mapping ensures consistent access
- Full audit trail for compliance

### Negative
- Added complexity in identity module
- SAML signature verification needs external library for production
- Multiple IdP configs increase testing matrix

### Neutral
- OpenAPI spec grows with SSO/SCIM endpoints
- ARV gate ensures identity module stays valid

## Technical Details

### Files Created
```
packages/core/src/identity/
├── index.ts           # Module exports
├── types.ts           # Zod schemas and types
├── store.ts           # IdentityStore interface + InMemoryIdentityStore
├── oidc.ts            # OidcService with PKCE, JWKS
├── saml.ts            # SamlService with assertion validation
├── scim.ts            # ScimService with full CRUD
└── mapping.ts         # RoleMappingEngine

scripts/arv/
└── identity-gate.ts   # ARV validation gate

test/contracts/
└── identity.test.ts   # Contract tests

apps/gateway/openapi.yaml  # Updated with SSO/SCIM endpoints
```

### Environment Variables
```bash
# No new env vars required for identity module
# Uses existing GWI_STORE_BACKEND for persistence
```

### Dependencies
- `zod`: Schema validation (existing)
- `crypto`: PKCE, token hashing (Node.js built-in)

## References

- RFC 7636: PKCE for OAuth 2.0
- RFC 7643: SCIM Core Schema
- RFC 7644: SCIM Protocol
- SAML 2.0 Core Specification
- OpenID Connect Core 1.0
