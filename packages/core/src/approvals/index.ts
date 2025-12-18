/**
 * Approvals Module
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * @module @gwi/core/approvals
 */

// Types - use prefixed names to avoid conflicts
export {
  type ApprovalScope as Phase25ApprovalScope,
  type ApprovalCommandAction,
  type ApprovalCommandSource,
  type ApprovalTargetType,
  type ParsedApprovalCommand,
  type ApproverType,
  type ApproverIdentity,
  type ApprovalDecision as Phase25ApprovalDecision,
  type SignedApproval,
  type CreateSignedApproval,
  type ApprovalStatus,
  type ApprovalEventType as ApprovalAuditEventType,
  ApprovalScopeSchema,
  ApprovalCommandAction as ApprovalCommandActionSchema,
  ApprovalCommandSource as ApprovalCommandSourceSchema,
  ApprovalTargetType as ApprovalTargetTypeSchema,
  ParsedApprovalCommand as ParsedApprovalCommandSchema,
  ApproverType as ApproverTypeSchema,
  ApproverIdentity as ApproverIdentitySchema,
  ApprovalDecision as ApprovalDecisionSchema,
  SignedApproval as SignedApprovalSchema,
  ApprovalStatus as ApprovalStatusSchema,
  ApprovalEventType as ApprovalEventTypeSchema,
  ALL_APPROVAL_SCOPES,
  generateApprovalId,
  validateScopes,
  hasRequiredScope,
  hasAllRequiredScopes,
} from './types.js';

// Parser
export {
  type ParseResult as ApprovalParseResult,
  parseApprovalCommand,
  extractCommandsFromComment,
  hasApprovalCommand,
  validateCommand as validateApprovalCommand,
  formatCommand as formatApprovalCommand,
  formatCommandResult as formatApprovalCommandResult,
} from './parser.js';

// Signature - use prefixed names to avoid conflicts
export {
  type SigningKeyPair,
  type PublicKeyRecord,
  type VerificationResult as ApprovalSignatureVerificationResult,
  type KeyStore,
  generateSigningKeyPair,
  canonicalizeApprovalPayload,
  computePayloadHash,
  signPayload,
  createSignedApproval,
  verifyApprovalSignature,
  computeIntentHash,
  computePatchHash as computeApprovalPatchHash,
  InMemoryKeyStore,
  verifyApprovalWithKeyStore,
} from './signature.js';
