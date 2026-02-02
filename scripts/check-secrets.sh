#!/usr/bin/env bash
# A9.s4: Pre-commit secret detection
# Scans staged files for potential secrets before commit

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo "🔍 Scanning for secrets in staged files..."

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR | grep -v "scripts/check-secrets.sh")

if [ -z "$STAGED_FILES" ]; then
  echo -e "${GREEN}✓ No files staged for commit${NC}"
  exit 0
fi

# Patterns that indicate potential secrets
# Using grep -E for extended regex
SECRET_PATTERNS=(
  # API Keys
  "ANTHROPIC_API_KEY\s*=\s*['\"]?sk-ant-"
  "OPENAI_API_KEY\s*=\s*['\"]?sk-"
  "GOOGLE_API_KEY\s*=\s*['\"]?AIza"

  # Generic secrets
  "SECRET\s*=\s*['\"][A-Za-z0-9+/]{20,}"
  "PASSWORD\s*=\s*['\"][^'\"]{8,}"
  "API_KEY\s*=\s*['\"][A-Za-z0-9_-]{20,}"

  # Private keys
  "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"

  # GCP
  "private_key.*-----BEGIN"
  "client_secret.*[A-Za-z0-9_-]{20,}"

  # GitHub
  "GITHUB_TOKEN\s*=\s*['\"]?ghp_"
  "GITHUB_TOKEN\s*=\s*['\"]?gho_"
  "GITHUB_TOKEN\s*=\s*['\"]?github_pat_"

  # Stripe
  "STRIPE_SECRET_KEY\s*=\s*['\"]?sk_"
  "STRIPE_WEBHOOK_SECRET\s*=\s*['\"]?whsec_"

  # Generic high-entropy strings (base64-ish)
  "[A-Za-z0-9+/]{40,}={0,2}"
)

FOUND_SECRETS=0

# Files to skip for high-entropy base64 patterns (false positives from integrity hashes, documentation, and code with long URLs)
SKIP_BASE64_FILES="package-lock.json|pnpm-lock.yaml|yarn.lock|README.md|CLAUDE.md|openapi.yaml|\.test\.ts$|\.spec\.ts$|test/.*\.ts$|examples/.*\.ts$|apps/.*/src/.*\.ts$"

# Files that legitimately contain secret detection patterns (not actual secrets)
SECRET_PATTERN_DEFINITION_FILES="packages/core/src/security/secrets\.ts|scripts/check-secrets\.sh"

for pattern in "${SECRET_PATTERNS[@]}"; do
  # Check each staged file for the pattern
  while IFS= read -r file; do
    # Skip lock files for the generic base64 pattern (integrity hashes are not secrets)
    if [[ "$pattern" == "[A-Za-z0-9+/]{40,}={0,2}" ]] && echo "$file" | grep -qE "$SKIP_BASE64_FILES"; then
      continue
    fi
    # Skip files that define secret detection patterns (they contain patterns, not secrets)
    if echo "$file" | grep -qE "$SECRET_PATTERN_DEFINITION_FILES"; then
      continue
    fi
    if [ -f "$file" ] && git show ":$file" 2>/dev/null | grep -qE -- "$pattern"; then
      echo -e "${RED}❌ Potential secret found in: $file${NC}"
      echo "   Pattern: $pattern"
      FOUND_SECRETS=1
    fi
  done <<< "$STAGED_FILES"
done

# Check for .env files being committed
if echo "$STAGED_FILES" | grep -qE "^\.env|\.env\."; then
  echo -e "${RED}❌ .env file is staged for commit!${NC}"
  echo "   .env files should never be committed"
  FOUND_SECRETS=1
fi

# Check for credentials.json files
if echo "$STAGED_FILES" | grep -qE "credentials\.json|service.*account.*\.json"; then
  echo -e "${RED}❌ Credentials file is staged for commit!${NC}"
  echo "   Service account credentials should never be committed"
  FOUND_SECRETS=1
fi

if [ $FOUND_SECRETS -eq 1 ]; then
  echo ""
  echo -e "${RED}Secret detection failed!${NC}"
  echo ""
  echo "If these are false positives, you can:"
  echo "  1. Add the file to .gitignore"
  echo "  2. Use environment variables instead"
  echo "  3. Skip this check: git commit --no-verify (NOT RECOMMENDED)"
  echo ""
  exit 1
fi

echo -e "${GREEN}✓ No secrets detected in staged files${NC}"
exit 0
