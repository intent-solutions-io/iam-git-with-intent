/**
 * Identity Types for Enterprise SSO & SCIM
 *
 * Phase 31: Enterprise identity capabilities including:
 * - SSO via OIDC and SAML
 * - SCIM 2.0 provisioning (Users + Groups)
 * - Org/role mapping rules
 * - Identity audit events
 *
 * @module @gwi/core/identity/types
 */

import { z } from 'zod';

// =============================================================================
// IdP Configuration Types
// =============================================================================

/**
 * Supported identity provider types
 */
export type IdpType = 'oidc' | 'saml';

/**
 * OIDC provider configuration
 */
export const OidcConfigSchema = z.object({
  type: z.literal('oidc'),

  /** Display name for this IdP */
  name: z.string().min(1).max(128),

  /** Whether this IdP is enabled */
  enabled: z.boolean().default(true),

  /** OIDC issuer URL (used for auto-discovery) */
  issuer: z.string().url(),

  /** Client ID registered with the IdP */
  clientId: z.string().min(1),

  /** Client secret (stored as hashed reference) */
  clientSecretRef: z.string().optional(),

  /** Authorization endpoint (auto-discovered if not set) */
  authorizationEndpoint: z.string().url().optional(),

  /** Token endpoint (auto-discovered if not set) */
  tokenEndpoint: z.string().url().optional(),

  /** Userinfo endpoint (auto-discovered if not set) */
  userinfoEndpoint: z.string().url().optional(),

  /** JWKS URI for token validation (auto-discovered if not set) */
  jwksUri: z.string().url().optional(),

  /** Scopes to request (default: openid email profile) */
  scopes: z.array(z.string()).default(['openid', 'email', 'profile']),

  /** Claim name for groups/roles (e.g., "groups", "roles") */
  groupsClaim: z.string().default('groups'),

  /** Allowed redirect URIs (security allowlist) */
  allowedRedirectUris: z.array(z.string().url()),

  /** Clock skew tolerance in seconds for token validation */
  clockSkewSeconds: z.number().int().min(0).max(300).default(30),

  /** Use PKCE for authorization flow */
  usePkce: z.boolean().default(true),

  /** Created timestamp */
  createdAt: z.date(),

  /** Updated timestamp */
  updatedAt: z.date(),
});

export type OidcConfig = z.infer<typeof OidcConfigSchema>;

/**
 * SAML provider configuration
 */
export const SamlConfigSchema = z.object({
  type: z.literal('saml'),

  /** Display name for this IdP */
  name: z.string().min(1).max(128),

  /** Whether this IdP is enabled */
  enabled: z.boolean().default(true),

  /** Entity ID of the IdP */
  entityId: z.string().min(1),

  /** SSO URL for the IdP */
  ssoUrl: z.string().url(),

  /** SLO URL for the IdP (optional) */
  sloUrl: z.string().url().optional(),

  /** IdP X.509 certificate for signature validation (PEM format) */
  certificate: z.string().min(1),

  /** Allowed Assertion Consumer Service URLs */
  allowedAcsUrls: z.array(z.string().url()),

  /** Attribute name for email */
  emailAttribute: z.string().default('email'),

  /** Attribute name for groups/roles */
  groupsAttribute: z.string().optional(),

  /** Require signed assertions */
  requireSignedAssertions: z.boolean().default(true),

  /** Require signed responses */
  requireSignedResponses: z.boolean().default(false),

  /** Created timestamp */
  createdAt: z.date(),

  /** Updated timestamp */
  updatedAt: z.date(),
});

export type SamlConfig = z.infer<typeof SamlConfigSchema>;

/**
 * Union of all IdP configurations
 */
export const IdpConfigSchema = z.discriminatedUnion('type', [
  OidcConfigSchema,
  SamlConfigSchema,
]);

export type IdpConfig = z.infer<typeof IdpConfigSchema>;

// =============================================================================
// SCIM Configuration
// =============================================================================

/**
 * SCIM token for provisioning
 */
export const ScimTokenSchema = z.object({
  /** Token ID */
  id: z.string(),

  /** Display name for this token */
  name: z.string().min(1).max(128),

  /** Hashed token value (never store plaintext) */
  tokenHash: z.string(),

  /** Token prefix for identification (first 8 chars) */
  tokenPrefix: z.string().length(8),

  /** Whether this token is active */
  active: z.boolean().default(true),

  /** When this token expires (null = never) */
  expiresAt: z.date().nullable(),

  /** Last used timestamp */
  lastUsedAt: z.date().nullable(),

  /** Created by user ID */
  createdBy: z.string(),

  /** Created timestamp */
  createdAt: z.date(),

  /** Revoked timestamp (null = not revoked) */
  revokedAt: z.date().nullable(),
});

export type ScimToken = z.infer<typeof ScimTokenSchema>;

/**
 * SCIM configuration for an organization
 */
export const ScimConfigSchema = z.object({
  /** Whether SCIM provisioning is enabled */
  enabled: z.boolean().default(false),

  /** SCIM tokens for this org */
  tokens: z.array(ScimTokenSchema).default([]),

  /** Auto-provision users on first sync */
  autoProvisionUsers: z.boolean().default(true),

  /** Auto-provision groups on first sync */
  autoProvisionGroups: z.boolean().default(true),

  /** Default role for provisioned users */
  defaultRole: z.enum(['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER']).default('VIEWER'),

  /** Created timestamp */
  createdAt: z.date(),

  /** Updated timestamp */
  updatedAt: z.date(),
});

export type ScimConfig = z.infer<typeof ScimConfigSchema>;

// =============================================================================
// Role Mapping Rules
// =============================================================================

/**
 * Source of identity information for mapping
 */
export type MappingSource = 'oidc_claim' | 'saml_attribute' | 'scim_group';

/**
 * Role mapping condition
 */
export const RoleMappingConditionSchema = z.object({
  /** Source of the value to match */
  source: z.enum(['oidc_claim', 'saml_attribute', 'scim_group']),

  /** Field/claim/attribute name */
  field: z.string().min(1),

  /** Operator for matching */
  operator: z.enum(['equals', 'contains', 'matches', 'in']),

  /** Value(s) to match against */
  value: z.union([z.string(), z.array(z.string())]),

  /** Case-insensitive matching */
  caseInsensitive: z.boolean().default(true),
});

export type RoleMappingCondition = z.infer<typeof RoleMappingConditionSchema>;

/**
 * Role mapping rule
 */
export const RoleMappingRuleSchema = z.object({
  /** Rule ID */
  id: z.string(),

  /** Rule name for display */
  name: z.string().min(1).max(128),

  /** Whether this rule is enabled */
  enabled: z.boolean().default(true),

  /** Priority (lower = higher priority, evaluated first) */
  priority: z.number().int().min(0).default(100),

  /** Conditions that must ALL match (AND logic) */
  conditions: z.array(RoleMappingConditionSchema).min(1),

  /** Role to assign when conditions match */
  assignedRole: z.enum(['VIEWER', 'DEVELOPER', 'ADMIN', 'OWNER']),

  /** Created timestamp */
  createdAt: z.date(),

  /** Updated timestamp */
  updatedAt: z.date(),
});

export type RoleMappingRule = z.infer<typeof RoleMappingRuleSchema>;

// =============================================================================
// Organization Identity Configuration
// =============================================================================

/**
 * Complete identity configuration for an organization
 */
export const OrgIdentityConfigSchema = z.object({
  /** Organization/tenant ID */
  orgId: z.string(),

  /** IdP configurations (can have multiple) */
  idpConfigs: z.array(IdpConfigSchema).default([]),

  /** SCIM configuration */
  scimConfig: ScimConfigSchema.optional(),

  /** Role mapping rules */
  roleMappingRules: z.array(RoleMappingRuleSchema).default([]),

  /** Whether to enforce SSO (block password login) */
  enforceSso: z.boolean().default(false),

  /** Allow JIT (Just-in-Time) user provisioning via SSO */
  allowJitProvisioning: z.boolean().default(true),

  /** Created timestamp */
  createdAt: z.date(),

  /** Updated timestamp */
  updatedAt: z.date(),
});

export type OrgIdentityConfig = z.infer<typeof OrgIdentityConfigSchema>;

// =============================================================================
// SSO Session Types
// =============================================================================

/**
 * SSO state for CSRF protection
 */
export const SsoStateSchema = z.object({
  /** State token */
  state: z.string(),

  /** Nonce for OIDC (prevents replay attacks) */
  nonce: z.string().optional(),

  /** PKCE code verifier (if using PKCE) */
  codeVerifier: z.string().optional(),

  /** Organization ID */
  orgId: z.string(),

  /** IdP config ID */
  idpConfigId: z.string(),

  /** Redirect URL after successful login */
  redirectUri: z.string().url(),

  /** Final destination after auth */
  returnTo: z.string().optional(),

  /** Created timestamp */
  createdAt: z.date(),

  /** Expiration timestamp */
  expiresAt: z.date(),
});

export type SsoState = z.infer<typeof SsoStateSchema>;

/**
 * SSO authentication result
 */
export const SsoAuthResultSchema = z.object({
  /** Whether authentication was successful */
  success: z.boolean(),

  /** User's external ID from IdP */
  externalId: z.string().optional(),

  /** User's email */
  email: z.string().email().optional(),

  /** User's display name */
  displayName: z.string().optional(),

  /** Groups/roles from IdP */
  groups: z.array(z.string()).default([]),

  /** Raw claims/attributes from IdP */
  rawClaims: z.record(z.unknown()).optional(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Error code if failed */
  errorCode: z.string().optional(),
});

export type SsoAuthResult = z.infer<typeof SsoAuthResultSchema>;

// =============================================================================
// SCIM Resource Types
// =============================================================================

/**
 * SCIM User resource
 */
export const ScimUserSchema = z.object({
  /** SCIM resource schemas */
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:schemas:core:2.0:User']),

  /** User ID */
  id: z.string().optional(),

  /** External ID from IdP */
  externalId: z.string().optional(),

  /** Username */
  userName: z.string(),

  /** Name object */
  name: z.object({
    formatted: z.string().optional(),
    familyName: z.string().optional(),
    givenName: z.string().optional(),
  }).optional(),

  /** Display name */
  displayName: z.string().optional(),

  /** Emails */
  emails: z.array(z.object({
    value: z.string().email(),
    type: z.string().optional(),
    primary: z.boolean().optional(),
  })).optional(),

  /** Whether user is active */
  active: z.boolean().default(true),

  /** Groups the user belongs to */
  groups: z.array(z.object({
    value: z.string(),
    display: z.string().optional(),
  })).optional(),

  /** SCIM metadata */
  meta: z.object({
    resourceType: z.literal('User').default('User'),
    created: z.string().optional(),
    lastModified: z.string().optional(),
    location: z.string().optional(),
  }).optional(),
});

export type ScimUser = z.infer<typeof ScimUserSchema>;

/**
 * SCIM Group resource
 */
export const ScimGroupSchema = z.object({
  /** SCIM resource schemas */
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:schemas:core:2.0:Group']),

  /** Group ID */
  id: z.string().optional(),

  /** External ID from IdP */
  externalId: z.string().optional(),

  /** Display name */
  displayName: z.string(),

  /** Group members */
  members: z.array(z.object({
    value: z.string(),
    display: z.string().optional(),
    type: z.enum(['User', 'Group']).optional(),
  })).optional(),

  /** SCIM metadata */
  meta: z.object({
    resourceType: z.literal('Group').default('Group'),
    created: z.string().optional(),
    lastModified: z.string().optional(),
    location: z.string().optional(),
  }).optional(),
});

export type ScimGroup = z.infer<typeof ScimGroupSchema>;

/**
 * SCIM List Response
 */
export const ScimListResponseSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:api:messages:2.0:ListResponse']),
  totalResults: z.number().int().min(0),
  startIndex: z.number().int().min(1).default(1),
  itemsPerPage: z.number().int().min(0),
  Resources: z.array(z.union([ScimUserSchema, ScimGroupSchema])),
});

export type ScimListResponse = z.infer<typeof ScimListResponseSchema>;

/**
 * SCIM Error Response
 */
export const ScimErrorSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:api:messages:2.0:Error']),
  status: z.string(),
  scimType: z.string().optional(),
  detail: z.string().optional(),
});

export type ScimError = z.infer<typeof ScimErrorSchema>;

/**
 * SCIM Patch Operation
 */
export const ScimPatchOperationSchema = z.object({
  op: z.enum(['add', 'remove', 'replace']),
  path: z.string().optional(),
  value: z.unknown().optional(),
});

export type ScimPatchOperation = z.infer<typeof ScimPatchOperationSchema>;

/**
 * SCIM Patch Request
 */
export const ScimPatchRequestSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:api:messages:2.0:PatchOp']),
  Operations: z.array(ScimPatchOperationSchema),
});

export type ScimPatchRequest = z.infer<typeof ScimPatchRequestSchema>;

// =============================================================================
// Identity Audit Event Types
// =============================================================================

/**
 * Identity-related audit event actions
 */
export type IdentityAuditAction =
  // SSO events
  | 'sso.login.started'
  | 'sso.login.success'
  | 'sso.login.failed'
  | 'sso.logout'
  | 'sso.token.validated'
  | 'sso.token.invalid'
  // SCIM events
  | 'scim.user.created'
  | 'scim.user.updated'
  | 'scim.user.deleted'
  | 'scim.user.deactivated'
  | 'scim.group.created'
  | 'scim.group.updated'
  | 'scim.group.deleted'
  | 'scim.sync.completed'
  // IdP config events
  | 'idp.config.created'
  | 'idp.config.updated'
  | 'idp.config.deleted'
  | 'idp.config.enabled'
  | 'idp.config.disabled'
  // SCIM token events
  | 'scim.token.created'
  | 'scim.token.revoked'
  | 'scim.token.rotated'
  // Role mapping events
  | 'role.mapping.created'
  | 'role.mapping.updated'
  | 'role.mapping.deleted'
  | 'role.mapped'
  | 'role.mapping.failed';

/**
 * Identity audit event
 */
export const IdentityAuditEventSchema = z.object({
  /** Event ID */
  id: z.string(),

  /** Organization/tenant ID */
  orgId: z.string(),

  /** Timestamp (ISO string) */
  timestamp: z.string(),

  /** Actor who performed the action */
  actor: z.object({
    /** Actor type */
    type: z.enum(['user', 'system', 'scim', 'sso']),
    /** Actor ID (user ID or system identifier) */
    id: z.string(),
    /** Actor email (if user) */
    email: z.string().optional(),
    /** IP address (if available) */
    ipAddress: z.string().optional(),
    /** User agent (if available) */
    userAgent: z.string().optional(),
  }),

  /** Action performed */
  action: z.string(),

  /** Target of the action */
  target: z.object({
    /** Target type */
    type: z.enum(['user', 'group', 'idp_config', 'scim_token', 'mapping_rule']),
    /** Target ID */
    id: z.string(),
    /** Target display name */
    displayName: z.string().optional(),
  }).optional(),

  /** Outcome of the action */
  outcome: z.enum(['success', 'failure']),

  /** Failure reason (if outcome is failure) */
  failureReason: z.string().optional(),

  /** Additional context/metadata */
  context: z.record(z.unknown()).optional(),
});

export type IdentityAuditEvent = z.infer<typeof IdentityAuditEventSchema>;

// =============================================================================
// Linked Identity
// =============================================================================

/**
 * External identity linked to an internal user
 */
export const LinkedIdentitySchema = z.object({
  /** Internal user ID */
  userId: z.string(),

  /** Organization ID */
  orgId: z.string(),

  /** IdP type */
  idpType: z.enum(['oidc', 'saml']),

  /** IdP config ID */
  idpConfigId: z.string(),

  /** External ID from the IdP (subject claim / NameID) */
  externalId: z.string(),

  /** Email from the IdP */
  email: z.string().email(),

  /** Last known groups from IdP */
  lastKnownGroups: z.array(z.string()).default([]),

  /** First linked timestamp */
  linkedAt: z.date(),

  /** Last login via this identity */
  lastLoginAt: z.date().nullable(),
});

export type LinkedIdentity = z.infer<typeof LinkedIdentitySchema>;
