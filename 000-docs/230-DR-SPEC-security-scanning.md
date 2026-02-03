# Security Scanning Integration Specification

> **Document**: 230-DR-SPEC-security-scanning
> **Epic**: EPIC 016 - Security Scanning (SAST/DAST Integration)
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Automated security scanning identifies vulnerabilities before they reach production. This spec defines SAST/DAST integration, vulnerability management, and remediation workflows.

---

## Security Scanning Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SECURITY SCANNING PIPELINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │   Code   │──▶│   SAST   │──▶│  Build   │──▶│   DAST   │──▶│  Deploy  │  │
│  │  Commit  │   │   Scan   │   │  Image   │   │   Scan   │   │   Gate   │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘  │
│       │              │              │              │              │         │
│       ▼              ▼              ▼              ▼              ▼         │
│   Pre-commit     Semgrep      Container       OWASP ZAP     Findings       │
│   Hooks          CodeQL       Trivy          Nuclei        Dashboard       │
│                  Snyk                                                       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                  VULNERABILITY MANAGEMENT                             │   │
│  │  • Deduplication & correlation                                       │   │
│  │  • Severity assessment & prioritization                              │   │
│  │  • Remediation tracking                                              │   │
│  │  • SLA enforcement                                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## SAST (Static Analysis)

### Supported Scanners

| Scanner | Purpose | Languages | Integration |
|---------|---------|-----------|-------------|
| Semgrep | Pattern-based analysis | All | CLI, CI/CD |
| CodeQL | Semantic analysis | JS/TS, Python, Go, Java | GitHub Actions |
| Snyk Code | AI-powered analysis | All | CLI, CI/CD |
| ESLint Security | JS/TS security rules | JavaScript, TypeScript | npm |
| Bandit | Python security | Python | pip |

### SAST Configuration

```yaml
# .github/workflows/sast.yml
name: SAST Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Semgrep Scan
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/secrets
            p/typescript
            p/nodejs
          generateSarif: true

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: semgrep.sarif

  codeql:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3

  snyk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Snyk Code Test
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          command: code test
          args: --sarif-file-output=snyk.sarif

      - name: Upload Snyk SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: snyk.sarif
```

### Semgrep Rules

```yaml
# .semgrep/custom-rules.yml
rules:
  # Detect hardcoded secrets
  - id: hardcoded-api-key
    patterns:
      - pattern-regex: '(api[_-]?key|apikey)\s*[:=]\s*["\'][a-zA-Z0-9]{20,}["\']'
    message: "Potential hardcoded API key detected"
    severity: ERROR
    languages: [typescript, javascript]

  # Detect SQL injection
  - id: sql-injection
    patterns:
      - pattern: |
          $DB.query(`... ${$VAR} ...`)
    message: "Potential SQL injection via string interpolation"
    severity: ERROR
    languages: [typescript, javascript]

  # Detect command injection
  - id: command-injection
    patterns:
      - pattern: |
          exec($CMD)
      - pattern-not: |
          exec("...")
    message: "Potential command injection"
    severity: ERROR
    languages: [typescript, javascript]

  # Detect insecure random
  - id: insecure-random
    patterns:
      - pattern: Math.random()
    message: "Math.random() is not cryptographically secure. Use crypto.randomBytes() for security-sensitive operations."
    severity: WARNING
    languages: [typescript, javascript]
```

---

## DAST (Dynamic Analysis)

### Supported Scanners

| Scanner | Purpose | Target | Integration |
|---------|---------|--------|-------------|
| OWASP ZAP | Web app scanning | HTTP endpoints | Docker, CI/CD |
| Nuclei | Template-based scanning | HTTP endpoints | CLI, CI/CD |
| Burp Suite | Comprehensive scanning | Web apps | API |
| Nikto | Web server scanning | Web servers | CLI |

### DAST Configuration

```yaml
# .github/workflows/dast.yml
name: DAST Security Scan

on:
  deployment:
    types: [created]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  zap-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.10.0
        with:
          target: ${{ vars.STAGING_URL }}
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a -j'

      - name: Upload ZAP Report
        uses: actions/upload-artifact@v4
        with:
          name: zap-report
          path: report_html.html

  nuclei-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Nuclei Scan
        uses: projectdiscovery/nuclei-action@main
        with:
          target: ${{ vars.STAGING_URL }}
          templates: |
            cves/
            vulnerabilities/
            misconfiguration/
          output: nuclei-results.txt

      - name: Upload Nuclei Results
        uses: actions/upload-artifact@v4
        with:
          name: nuclei-report
          path: nuclei-results.txt
```

### ZAP Configuration

```tsv
# .zap/rules.tsv
# Rule ID	Action	Description
10010	IGNORE	Cookie No HttpOnly Flag (acceptable in dev)
10011	WARN	Cookie Without Secure Flag
10015	FAIL	Incomplete or No Cache-control Header Set
10017	FAIL	Cross-Domain JavaScript Source File Inclusion
10019	WARN	Content-Type Header Missing
10020	FAIL	X-Frame-Options Header
10021	FAIL	X-Content-Type-Options Header Missing
10035	FAIL	Strict-Transport-Security Header
10038	FAIL	Content Security Policy (CSP) Header Not Set
10055	FAIL	CSP: script-src unsafe-inline
10096	FAIL	Timestamp Disclosure
10098	WARN	Cross-Domain Misconfiguration
40012	FAIL	Cross Site Scripting (Reflected)
40014	FAIL	Cross Site Scripting (Persistent)
40018	FAIL	SQL Injection
90033	FAIL	Loosely Scoped Cookie
```

---

## Container Scanning

### Trivy Integration

```yaml
# .github/workflows/container-scan.yml
name: Container Security Scan

on:
  push:
    paths:
      - 'apps/**/Dockerfile'
      - '.github/workflows/container-scan.yml'

jobs:
  trivy:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api, gateway, worker, webhook]
    steps:
      - uses: actions/checkout@v4

      - name: Build Image
        run: |
          docker build -t gwi-${{ matrix.service }}:scan \
            -f apps/${{ matrix.service }}/Dockerfile .

      - name: Trivy Vulnerability Scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: gwi-${{ matrix.service }}:scan
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          vuln-type: 'os,library'

      - name: Upload Trivy SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-results.sarif

      - name: Trivy SBOM
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: gwi-${{ matrix.service }}:scan
          format: 'cyclonedx'
          output: 'sbom.json'

      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom-${{ matrix.service }}
          path: sbom.json
```

---

## Vulnerability Management

### Finding Schema

```typescript
// packages/core/src/security/types.ts

interface SecurityFinding {
  id: string;
  source: 'sast' | 'dast' | 'container' | 'dependency';
  scanner: string;

  // Classification
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'high' | 'medium' | 'low';
  category: string;  // CWE category

  // Location
  file?: string;
  line?: number;
  endpoint?: string;

  // Details
  title: string;
  description: string;
  recommendation: string;

  // References
  cwe_id?: string;
  cve_id?: string;
  owasp_category?: string;
  references: string[];

  // Status
  status: 'open' | 'confirmed' | 'false_positive' | 'accepted_risk' | 'fixed';
  assignee?: string;
  due_date?: Date;
  fixed_in?: string;

  // Metadata
  first_seen: Date;
  last_seen: Date;
  occurrences: number;
}
```

### Severity SLAs

| Severity | Response Time | Remediation Time | Escalation |
|----------|---------------|------------------|------------|
| Critical | 4 hours | 24 hours | Immediate to CTO |
| High | 24 hours | 7 days | Team lead |
| Medium | 72 hours | 30 days | Sprint planning |
| Low | 1 week | 90 days | Backlog |

### Finding Deduplication

```typescript
// packages/core/src/security/dedup.ts

class FindingDeduplicator {
  deduplicate(findings: SecurityFinding[]): SecurityFinding[] {
    const grouped = new Map<string, SecurityFinding[]>();

    for (const finding of findings) {
      const key = this.generateKey(finding);
      const existing = grouped.get(key) || [];
      existing.push(finding);
      grouped.set(key, existing);
    }

    return Array.from(grouped.values()).map((group) => {
      // Merge findings, keep highest severity
      const merged = group.reduce((acc, f) => ({
        ...acc,
        severity: this.maxSeverity(acc.severity, f.severity),
        occurrences: acc.occurrences + f.occurrences,
        scanners: [...new Set([...acc.scanners, f.scanner])],
      }));

      return merged;
    });
  }

  private generateKey(finding: SecurityFinding): string {
    // Key based on location + vulnerability type
    return `${finding.file}:${finding.line}:${finding.cwe_id || finding.title}`;
  }
}
```

---

## Security Dashboard

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ SECURITY DASHBOARD                                                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ SUMMARY                                                                       ║
║   Open Findings:     47                                                       ║
║   Critical:          2   [██░░░░░░░░░░░░░░░░░░]                               ║
║   High:              8   [████░░░░░░░░░░░░░░░░]                               ║
║   Medium:           23   [██████████░░░░░░░░░░]                               ║
║   Low:              14   [██████░░░░░░░░░░░░░░]                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ SLA STATUS                                                                    ║
║   Within SLA:        43 (91%)                                                 ║
║   Approaching SLA:    3 (6%)   ⚠                                              ║
║   Overdue:            1 (2%)   🚨                                             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ RECENT CRITICAL FINDINGS                                                      ║
║                                                                               ║
║ 🔴 SQL Injection in user query                      packages/core/db.ts:145  ║
║    CWE-89 | Found by: Semgrep | Age: 2 days | Due: 22 hours                  ║
║    [View] [Assign] [Remediate]                                                ║
║                                                                               ║
║ 🔴 Hardcoded API key in config                      apps/api/config.ts:23    ║
║    CWE-798 | Found by: Semgrep | Age: 1 day | Due: 3 hours                   ║
║    [View] [Assign] [Remediate]                                                ║
║                                                                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ SCAN HISTORY (Last 7 Days)                                                    ║
║   SAST:      ████████████████████  142 scans                                 ║
║   DAST:      ████░░░░░░░░░░░░░░░░   14 scans                                 ║
║   Container: ████████░░░░░░░░░░░░   28 scans                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## CI/CD Integration

### Pre-commit Hooks

```bash
#!/bin/bash
# .husky/pre-commit

# Run secret detection
echo "Scanning for secrets..."
if command -v gitleaks &> /dev/null; then
  gitleaks protect --staged --verbose
  if [ $? -ne 0 ]; then
    echo "❌ Secrets detected in staged files!"
    exit 1
  fi
fi

# Run SAST on changed files
echo "Running SAST on changed files..."
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$')
if [ -n "$CHANGED_FILES" ]; then
  npx semgrep --config=p/security-audit $CHANGED_FILES
  if [ $? -ne 0 ]; then
    echo "❌ Security issues found!"
    exit 1
  fi
fi

echo "✅ Security checks passed"
```

### PR Security Gate

```yaml
# .github/workflows/pr-security-gate.yml
name: PR Security Gate

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  security-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get Changed Files
        id: changed
        run: |
          echo "files=$(git diff --name-only origin/main...HEAD | tr '\n' ' ')" >> $GITHUB_OUTPUT

      - name: SAST Scan
        run: |
          npx semgrep --config=p/security-audit \
            --sarif --output=sast.sarif \
            ${{ steps.changed.outputs.files }}

      - name: Check Critical Findings
        run: |
          CRITICAL=$(jq '.runs[].results[] | select(.level == "error")' sast.sarif | wc -l)
          if [ "$CRITICAL" -gt 0 ]; then
            echo "❌ $CRITICAL critical security findings"
            exit 1
          fi

      - name: Post PR Comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const sarif = JSON.parse(fs.readFileSync('sast.sarif'));
            const findings = sarif.runs[0].results;

            if (findings.length === 0) {
              return;
            }

            let comment = '## 🔒 Security Scan Results\n\n';
            comment += `Found ${findings.length} finding(s)\n\n`;

            for (const f of findings.slice(0, 10)) {
              const emoji = f.level === 'error' ? '🔴' : f.level === 'warning' ? '🟡' : '🔵';
              comment += `${emoji} **${f.ruleId}**: ${f.message.text}\n`;
              comment += `   📍 ${f.locations[0].physicalLocation.artifactLocation.uri}:${f.locations[0].physicalLocation.region.startLine}\n\n`;
            }

            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: comment
            });
```

---

## Remediation Workflow

```typescript
// packages/core/src/security/remediation.ts

interface RemediationSuggestion {
  finding_id: string;
  severity: string;

  // Fix information
  fix_type: 'code_change' | 'config_change' | 'dependency_update' | 'manual';
  description: string;
  code_suggestion?: string;

  // Effort estimation
  estimated_effort: 'trivial' | 'small' | 'medium' | 'large';

  // Related resources
  documentation: string[];
  similar_fixes: string[];
}

class RemediationService {
  async suggestRemediation(finding: SecurityFinding): Promise<RemediationSuggestion> {
    // Get remediation template based on CWE
    const template = await this.getRemediationTemplate(finding.cwe_id);

    // Generate code fix suggestion using AI
    const codeSuggestion = await this.generateCodeFix(finding);

    return {
      finding_id: finding.id,
      severity: finding.severity,
      fix_type: template.fix_type,
      description: template.description,
      code_suggestion: codeSuggestion,
      estimated_effort: this.estimateEffort(finding, template),
      documentation: template.documentation,
      similar_fixes: await this.findSimilarFixes(finding),
    };
  }

  private async generateCodeFix(finding: SecurityFinding): Promise<string | undefined> {
    if (!finding.file || !finding.line) return undefined;

    const context = await this.getCodeContext(finding.file, finding.line);

    // Use AI to suggest fix
    const response = await this.llm.complete(`
      Security vulnerability found:
      - Type: ${finding.title}
      - CWE: ${finding.cwe_id}
      - Description: ${finding.description}

      Code context:
      ${context}

      Suggest a secure fix for this vulnerability.
    `);

    return response;
  }
}
```

---

## API Endpoints

```typescript
// GET /api/v1/security/findings
interface ListFindingsRequest {
  severity?: string[];
  status?: string[];
  scanner?: string[];
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

// GET /api/v1/security/findings/:id
interface FindingDetail extends SecurityFinding {
  history: FindingHistory[];
  remediation: RemediationSuggestion;
}

// PATCH /api/v1/security/findings/:id
interface UpdateFindingRequest {
  status?: string;
  assignee?: string;
  notes?: string;
}

// POST /api/v1/security/scans
interface TriggerScanRequest {
  type: 'sast' | 'dast' | 'container' | 'all';
  target?: string;
}

// GET /api/v1/security/stats
interface SecurityStatsResponse {
  total_findings: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  sla_compliance: number;
  trend: { date: string; count: number }[];
}
```

---

## Related Documentation

- [231-DR-TMPL-security-policy.md](./231-DR-TMPL-security-policy.md)
- [110-DR-TMOD-security-threat-model.md](./110-DR-TMOD-security-threat-model.md)
