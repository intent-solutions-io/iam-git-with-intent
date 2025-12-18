/**
 * Enterprise Identity Module
 *
 * Phase 31: SSO (OIDC/SAML) and SCIM 2.0 provisioning
 *
 * @module @gwi/core/identity
 */

// Types and schemas
export {
  // IdP Configuration
  type IdpType,
  type OidcConfig,
  type SamlConfig,
  type IdpConfig,
  OidcConfigSchema,
  SamlConfigSchema,
  IdpConfigSchema,

  // SCIM Configuration
  type ScimToken,
  type ScimConfig,
  ScimTokenSchema,
  ScimConfigSchema,

  // Role Mapping
  type MappingSource,
  type RoleMappingCondition,
  type RoleMappingRule,
  RoleMappingConditionSchema,
  RoleMappingRuleSchema,

  // Org Identity Config
  type OrgIdentityConfig,
  OrgIdentityConfigSchema,

  // SSO State and Result
  type SsoState,
  type SsoAuthResult,
  SsoStateSchema,
  SsoAuthResultSchema,

  // Linked Identity
  type LinkedIdentity,
  LinkedIdentitySchema,

  // SCIM Resources
  type ScimUser,
  type ScimGroup,
  type ScimListResponse,
  type ScimError as ScimErrorType,
  type ScimPatchOperation,
  type ScimPatchRequest as ScimPatchRequestType,
  ScimUserSchema,
  ScimGroupSchema,
  ScimListResponseSchema,
  ScimErrorSchema,
  ScimPatchOperationSchema,
  ScimPatchRequestSchema,

  // Audit Events
  type IdentityAuditAction,
  type IdentityAuditEvent,
  IdentityAuditEventSchema,
} from './types.js';

// Store
export {
  type IdentityStore,
  InMemoryIdentityStore,
  getIdentityStore,
  setIdentityStore,
  resetIdentityStore,
} from './store.js';

// OIDC SSO
export {
  type OidcStartResult,
  type OidcCallbackParams,
  type OidcTokenResponse,
  type OidcIdTokenClaims,
  type OidcAuthResult,
  type JwksKey,
  type JwksResponse,
  type OidcDiscoveryDocument,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generateNonce,
  OidcService,
  OidcError,
  getOidcService,
  setOidcService,
  resetOidcService,
} from './oidc.js';

// SAML SSO
export {
  type SamlStartResult,
  type SamlCallbackParams,
  type SamlAssertion,
  type SamlAuthResult,
  SamlService,
  SamlError,
  getSamlService,
  setSamlService,
  resetSamlService,
} from './saml.js';

// SCIM 2.0 Provisioning
export {
  type ScimRequest,
  type ScimResponse,
  type ScimError,
  type ScimPatchOp,
  type ScimPatchRequest,
  SCIM_SCHEMAS,
  hashScimToken,
  generateScimToken,
  ScimService,
  getScimService,
  setScimService,
  resetScimService,
} from './scim.js';

// Role Mapping
export {
  type MappingContext,
  type MappingResult,
  RoleMappingEngine,
  buildContextFromOidc,
  buildContextFromSaml,
  buildContextFromScim,
  COMMON_RULES,
  getRoleMappingEngine,
  setRoleMappingEngine,
  resetRoleMappingEngine,
} from './mapping.js';
