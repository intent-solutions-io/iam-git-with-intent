/**
 * Approval Command Parser
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * Parses approval commands from PR comments, issue comments,
 * review comments, and CLI input.
 *
 * Command formats:
 *   /gwi approve <target> --scopes commit,push
 *   /gwi deny <target> --reason "reason"
 *   /gwi revoke <target>
 *
 * @module @gwi/core/approvals/parser
 */

import {
  type ParsedApprovalCommand,
  type ApprovalCommandAction,
  type ApprovalCommandSource,
  type ApprovalTargetType,
  type ApprovalScope,
  ApprovalScopeSchema,
  ALL_APPROVAL_SCOPES,
} from './types.js';

// =============================================================================
// Parser Result Types
// =============================================================================

export interface ParseResult {
  success: boolean;
  command?: ParsedApprovalCommand;
  error?: string;
}

// =============================================================================
// Command Patterns
// =============================================================================

/**
 * Main command regex pattern
 *
 * Matches:
 *   /gwi approve candidate-123 --scopes commit,push
 *   /gwi deny run-456 --reason "needs more review"
 *   /gwi revoke pr-789
 */
const COMMAND_PATTERN = /^\/gwi\s+(approve|deny|revoke)\s+(\S+)(.*)$/i;

/**
 * Scopes flag pattern
 * --scopes commit,push,merge
 */
const SCOPES_PATTERN = /--scopes?\s+([a-z_,]+)/i;

/**
 * Reason flag pattern
 * --reason "some reason" or --reason 'some reason' or --reason some_reason
 */
const REASON_PATTERN = /--reason\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i;

/**
 * Target patterns
 */
const TARGET_PATTERNS = {
  candidate: /^(?:candidate[-_]?)?([a-f0-9-]{36}|cand-[a-z0-9]+)$/i,
  run: /^(?:run[-_]?)?([a-f0-9-]{36}|run-[a-z0-9]+)$/i,
  pr: /^(?:pr[-_#]?)?(\d+)$/i,
};

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Parse an approval command from text
 *
 * @param text - Raw text (comment body, CLI input)
 * @param source - Source of the command
 * @returns Parse result
 */
export function parseApprovalCommand(
  text: string,
  source: ApprovalCommandSource
): ParseResult {
  // Trim and normalize whitespace
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  // Check for command pattern
  const match = normalizedText.match(COMMAND_PATTERN);

  if (!match) {
    // Check if it starts with /gwi but isn't an approval command
    if (normalizedText.toLowerCase().startsWith('/gwi')) {
      return {
        success: false,
        error: 'Invalid /gwi command. Use: /gwi approve|deny|revoke <target>',
      };
    }
    return {
      success: false,
      error: 'No approval command found',
    };
  }

  const [, actionStr, targetStr, flagsStr] = match;
  const action = actionStr.toLowerCase() as ApprovalCommandAction;

  // Parse target
  const targetResult = parseTarget(targetStr);
  if (!targetResult.success) {
    return {
      success: false,
      error: targetResult.error,
    };
  }

  // Parse flags
  const flags = parseFlags(flagsStr || '');

  // Validate based on action
  if (action === 'deny' && !flags.reason) {
    return {
      success: false,
      error: 'deny requires --reason flag',
    };
  }

  // Default scopes for approve
  let scopes = flags.scopes;
  if (action === 'approve' && scopes.length === 0) {
    // Default to all scopes if none specified
    scopes = [...ALL_APPROVAL_SCOPES];
  }

  // For deny/revoke, scopes are empty
  if (action === 'deny' || action === 'revoke') {
    scopes = [];
  }

  return {
    success: true,
    command: {
      action,
      targetType: targetResult.targetType!,
      targetId: targetResult.targetId!,
      scopes,
      reason: flags.reason,
      source,
      rawCommand: normalizedText,
    },
  };
}

/**
 * Parse target string to determine type and ID
 */
function parseTarget(target: string): {
  success: boolean;
  targetType?: ApprovalTargetType;
  targetId?: string;
  error?: string;
} {
  // Try each pattern
  const candidateMatch = target.match(TARGET_PATTERNS.candidate);
  if (candidateMatch) {
    return {
      success: true,
      targetType: 'candidate',
      targetId: candidateMatch[1],
    };
  }

  const runMatch = target.match(TARGET_PATTERNS.run);
  if (runMatch) {
    return {
      success: true,
      targetType: 'run',
      targetId: runMatch[1],
    };
  }

  const prMatch = target.match(TARGET_PATTERNS.pr);
  if (prMatch) {
    return {
      success: true,
      targetType: 'pr',
      targetId: prMatch[1],
    };
  }

  // If target looks like a UUID, default to candidate
  if (/^[a-f0-9-]{36}$/i.test(target)) {
    return {
      success: true,
      targetType: 'candidate',
      targetId: target,
    };
  }

  return {
    success: false,
    error: `Invalid target: "${target}". Use candidate-<id>, run-<id>, or pr-<number>`,
  };
}

/**
 * Parse flags from command string
 */
function parseFlags(flagsStr: string): {
  scopes: ApprovalScope[];
  reason?: string;
} {
  const result: { scopes: ApprovalScope[]; reason?: string } = {
    scopes: [],
  };

  // Parse scopes
  const scopesMatch = flagsStr.match(SCOPES_PATTERN);
  if (scopesMatch) {
    const scopeList = scopesMatch[1].toLowerCase().split(',');
    result.scopes = scopeList.filter((s): s is ApprovalScope => {
      const parsed = ApprovalScopeSchema.safeParse(s);
      return parsed.success;
    });
  }

  // Parse reason
  const reasonMatch = flagsStr.match(REASON_PATTERN);
  if (reasonMatch) {
    // Pick the first non-undefined capture group
    result.reason = reasonMatch[1] || reasonMatch[2] || reasonMatch[3];
  }

  return result;
}

// =============================================================================
// Comment Scanning
// =============================================================================

/**
 * Extract approval commands from a comment body
 *
 * A comment may contain multiple commands (one per line)
 */
export function extractCommandsFromComment(
  commentBody: string,
  source: ApprovalCommandSource
): ParsedApprovalCommand[] {
  const commands: ParsedApprovalCommand[] = [];

  // Split by lines
  const lines = commentBody.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and non-command lines
    if (!trimmedLine.startsWith('/gwi')) {
      continue;
    }

    const result = parseApprovalCommand(trimmedLine, source);
    if (result.success && result.command) {
      commands.push(result.command);
    }
  }

  return commands;
}

/**
 * Check if text contains an approval command
 */
export function hasApprovalCommand(text: string): boolean {
  return COMMAND_PATTERN.test(text.trim());
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a parsed command
 */
export function validateCommand(command: ParsedApprovalCommand): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check target ID is not empty
  if (!command.targetId || command.targetId.trim() === '') {
    errors.push('Target ID is required');
  }

  // Check action-specific requirements
  if (command.action === 'approve' && command.scopes.length === 0) {
    errors.push('At least one scope is required for approve');
  }

  if (command.action === 'deny' && !command.reason) {
    errors.push('Reason is required for deny');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// Command Formatting
// =============================================================================

/**
 * Format a command for display
 */
export function formatCommand(command: ParsedApprovalCommand): string {
  let formatted = `/gwi ${command.action} ${command.targetType}-${command.targetId}`;

  if (command.scopes.length > 0) {
    formatted += ` --scopes ${command.scopes.join(',')}`;
  }

  if (command.reason) {
    formatted += ` --reason "${command.reason}"`;
  }

  return formatted;
}

/**
 * Format a command result for PR comment
 */
export function formatCommandResult(
  command: ParsedApprovalCommand,
  success: boolean,
  message: string
): string {
  const icon = success ? '✅' : '❌';
  const action = command.action.charAt(0).toUpperCase() + command.action.slice(1);

  let result = `${icon} **${action}** for \`${command.targetType}-${command.targetId}\`\n\n`;
  result += message;

  if (command.scopes.length > 0) {
    result += `\n\n**Scopes:** ${command.scopes.join(', ')}`;
  }

  return result;
}
