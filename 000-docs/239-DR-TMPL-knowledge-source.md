# Knowledge Source Configuration Template

> **Document**: 239-DR-TMPL-knowledge-source
> **Epic**: EPIC 023 - Knowledge Base / RAG Search
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Use this template to configure knowledge sources for the RAG system. Each source defines what content to index, how to process it, and when to refresh.

---

## Source Configuration Template

```yaml
# knowledge-sources.yaml
# Knowledge base source configurations

# ═══════════════════════════════════════════════════════════════════════════════
# CODE REPOSITORY SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
sources:
  - id: main-codebase
    name: "Main Codebase"
    type: code
    enabled: true

    # Connection
    connection:
      type: local  # local | github | gitlab
      path: ./
      # For remote:
      # type: github
      # repo: org/repo
      # branch: main
      # token_secret: GITHUB_TOKEN

    # File patterns
    patterns:
      include:
        - "**/*.ts"
        - "**/*.tsx"
        - "**/*.js"
        - "**/*.jsx"
        - "**/*.py"
        - "**/*.go"
        - "**/*.java"
        - "**/*.rs"
        - "**/*.rb"
        - "**/*.php"
        - "**/*.cs"
        - "**/*.swift"
        - "**/*.kt"
      exclude:
        - "**/node_modules/**"
        - "**/dist/**"
        - "**/build/**"
        - "**/target/**"
        - "**/.git/**"
        - "**/vendor/**"
        - "**/*.min.js"
        - "**/*.bundle.js"
        - "**/coverage/**"
        - "**/__pycache__/**"

    # Chunking configuration
    chunking:
      strategy: ast_aware
      options:
        granularity: function  # file | class | function | method
        include_imports: true
        include_comments: true
        preserve_signatures: true
        max_chunk_tokens: 1000
        min_chunk_tokens: 50
        overlap_tokens: 100

    # Metadata extraction
    metadata:
      extract:
        - language
        - file_path
        - file_type
        - imports
        - exports
        - class_name
        - function_name
        - dependencies
        - complexity_score
      custom:
        - name: framework_detection
          pattern: "react|vue|angular|express|fastapi|django"

    # Refresh settings
    refresh:
      trigger: on_commit  # realtime | on_commit | hourly | daily | weekly
      full_reindex: weekly
      watch_paths:
        - "packages/**"
        - "apps/**"
        - "src/**"

    # Access control
    access:
      visibility: tenant
      tenant_id: "${TENANT_ID}"

# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENTATION SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
  - id: documentation
    name: "Documentation"
    type: markdown
    enabled: true

    connection:
      type: local
      path: ./

    patterns:
      include:
        - "**/*.md"
        - "**/docs/**"
        - "**/README*"
        - "**/CHANGELOG*"
        - "**/CONTRIBUTING*"
      exclude:
        - "**/node_modules/**"
        - "**/CHANGELOG.md"  # Often too large/noisy

    chunking:
      strategy: semantic
      options:
        header_boundaries: true
        preserve_sections: true
        max_section_depth: 3
        max_chunk_tokens: 500
        min_chunk_tokens: 50
        overlap_tokens: 50

    metadata:
      extract:
        - title
        - headers
        - links
        - tags
        - file_path
      custom:
        - name: doc_type
          pattern: "API|guide|tutorial|reference|spec"

    refresh:
      trigger: on_commit
      full_reindex: weekly

# ═══════════════════════════════════════════════════════════════════════════════
# API SPECIFICATION SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
  - id: api-specs
    name: "API Specifications"
    type: openapi
    enabled: true

    connection:
      type: local
      path: ./

    patterns:
      include:
        - "**/openapi.yaml"
        - "**/openapi.json"
        - "**/swagger.yaml"
        - "**/swagger.json"
        - "**/api-spec.*"

    chunking:
      strategy: endpoint
      options:
        include_schemas: true
        include_examples: true
        max_chunk_tokens: 800

    metadata:
      extract:
        - endpoint_path
        - http_method
        - operation_id
        - tags
        - parameters
        - response_codes

    refresh:
      trigger: on_commit

# ═══════════════════════════════════════════════════════════════════════════════
# GITHUB PULL REQUESTS SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
  - id: github-prs
    name: "GitHub Pull Requests"
    type: github_pr
    enabled: true

    connection:
      type: github
      repo: "${GITHUB_REPO}"
      token_secret: GITHUB_TOKEN

    filters:
      state: merged
      since: 180d  # Last 6 months
      labels_exclude:
        - "wontfix"
        - "invalid"

    content:
      include:
        - title
        - description
        - review_comments
        - diff_context
        - commit_messages
      max_diff_size: 10000  # Characters

    chunking:
      strategy: semantic
      options:
        chunk_by: pr  # Single chunk per PR
        include_reviews: true
        max_chunk_tokens: 2000

    metadata:
      extract:
        - pr_number
        - author
        - reviewers
        - labels
        - files_changed
        - lines_added
        - lines_removed
        - merged_at
        - merge_commit

    refresh:
      trigger: daily
      full_reindex: monthly

# ═══════════════════════════════════════════════════════════════════════════════
# GITHUB ISSUES SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
  - id: github-issues
    name: "GitHub Issues"
    type: github_issues
    enabled: true

    connection:
      type: github
      repo: "${GITHUB_REPO}"
      token_secret: GITHUB_TOKEN

    filters:
      state: all
      since: 365d
      labels_exclude:
        - "spam"
        - "duplicate"

    content:
      include:
        - title
        - body
        - comments
        - labels
        - reactions

    chunking:
      strategy: semantic
      options:
        chunk_by: issue
        include_comments: true
        max_comments: 20
        max_chunk_tokens: 1500

    metadata:
      extract:
        - issue_number
        - author
        - labels
        - state
        - created_at
        - closed_at
        - assignees

    refresh:
      trigger: daily

# ═══════════════════════════════════════════════════════════════════════════════
# JIRA SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
  - id: jira-tickets
    name: "Jira Tickets"
    type: jira
    enabled: false  # Enable if using Jira

    connection:
      type: jira
      url: "https://company.atlassian.net"
      project: "PROJ"
      token_secret: JIRA_API_TOKEN
      email_secret: JIRA_EMAIL

    filters:
      jql: "project = PROJ AND created >= -365d"
      issue_types:
        - Story
        - Bug
        - Task
        - Epic

    content:
      include:
        - summary
        - description
        - comments
        - acceptance_criteria
      custom_fields:
        - root_cause
        - solution

    chunking:
      strategy: semantic
      options:
        chunk_by: ticket
        max_chunk_tokens: 1500

    metadata:
      extract:
        - key
        - summary
        - status
        - priority
        - assignee
        - reporter
        - labels
        - components
        - sprint

    refresh:
      trigger: hourly

# ═══════════════════════════════════════════════════════════════════════════════
# CONFLUENCE SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
  - id: confluence-docs
    name: "Confluence Documentation"
    type: confluence
    enabled: false  # Enable if using Confluence

    connection:
      type: confluence
      url: "https://company.atlassian.net/wiki"
      space: "DOCS"
      token_secret: CONFLUENCE_API_TOKEN
      email_secret: CONFLUENCE_EMAIL

    filters:
      spaces:
        - DOCS
        - ARCH
        - OPS
      content_types:
        - page
        - blogpost
      updated_since: 365d

    content:
      include:
        - title
        - body
        - comments
        - attachments_list

    chunking:
      strategy: semantic
      options:
        header_boundaries: true
        max_chunk_tokens: 500

    metadata:
      extract:
        - page_id
        - title
        - space
        - author
        - labels
        - last_modified
        - parent_page

    refresh:
      trigger: daily

# ═══════════════════════════════════════════════════════════════════════════════
# SLACK ARCHIVE SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
  - id: slack-archive
    name: "Slack Archive"
    type: slack
    enabled: false  # Enable if using Slack

    connection:
      type: slack
      token_secret: SLACK_BOT_TOKEN

    filters:
      channels:
        - engineering
        - incidents
        - architecture
      since: 180d
      exclude_threads: false
      exclude_bots: true

    content:
      include:
        - messages
        - threads
        - reactions
        - links

    chunking:
      strategy: semantic
      options:
        chunk_by: thread  # or day
        max_chunk_tokens: 1000

    metadata:
      extract:
        - channel
        - author
        - timestamp
        - reactions
        - thread_reply_count

    refresh:
      trigger: daily

# ═══════════════════════════════════════════════════════════════════════════════
# GIT HISTORY SOURCE
# ═══════════════════════════════════════════════════════════════════════════════
  - id: git-history
    name: "Git History"
    type: git_history
    enabled: true

    connection:
      type: local
      path: ./

    filters:
      branches:
        - main
        - develop
      depth: 1000  # Number of commits
      since: 365d

    content:
      include:
        - commit_message
        - diff_summary
        - files_changed
        - author
      exclude_merges: false

    chunking:
      strategy: semantic
      options:
        chunk_by: commit
        include_diff_context: true
        max_diff_lines: 100
        max_chunk_tokens: 800

    metadata:
      extract:
        - commit_sha
        - author
        - date
        - files_changed
        - lines_added
        - lines_removed
        - is_merge

    refresh:
      trigger: on_commit
```

---

## Source Type Reference

### Code Source

| Field | Description | Default |
|-------|-------------|---------|
| `patterns.include` | File globs to include | Required |
| `patterns.exclude` | File globs to exclude | `node_modules`, etc. |
| `chunking.strategy` | `ast_aware` recommended | `ast_aware` |
| `chunking.options.granularity` | `file`, `class`, `function`, `method` | `function` |

### Documentation Source

| Field | Description | Default |
|-------|-------------|---------|
| `patterns.include` | Markdown file patterns | `**/*.md` |
| `chunking.strategy` | `semantic` recommended | `semantic` |
| `chunking.options.header_boundaries` | Split on headers | `true` |

### GitHub PR Source

| Field | Description | Default |
|-------|-------------|---------|
| `filters.state` | `open`, `closed`, `merged`, `all` | `merged` |
| `filters.since` | Time window | `180d` |
| `content.include` | PR content to index | All |

### GitHub Issues Source

| Field | Description | Default |
|-------|-------------|---------|
| `filters.state` | `open`, `closed`, `all` | `all` |
| `filters.since` | Time window | `365d` |
| `content.include_comments` | Index comments | `true` |

---

## Refresh Triggers

| Trigger | Description | Use Case |
|---------|-------------|----------|
| `realtime` | Index on every change | Small repos, critical content |
| `on_commit` | Index on git push | Code, documentation |
| `hourly` | Every hour | Jira, active channels |
| `daily` | Once per day | PRs, issues, archives |
| `weekly` | Once per week | Historical, rarely changing |

---

## CLI Commands

```bash
# List configured sources
gwi knowledge sources list

# Add a new source
gwi knowledge sources add --config source.yaml

# Update source configuration
gwi knowledge sources update main-codebase --config updated.yaml

# Enable/disable source
gwi knowledge sources enable jira-tickets
gwi knowledge sources disable slack-archive

# Test source connection
gwi knowledge sources test main-codebase

# Trigger reindex for source
gwi knowledge sources reindex main-codebase
gwi knowledge sources reindex --all

# View source status
gwi knowledge sources status main-codebase

# View indexed content stats
gwi knowledge sources stats main-codebase
```

---

## Validation

```bash
# Validate source configuration
gwi knowledge sources validate ./knowledge-sources.yaml

# Dry run indexing
gwi knowledge sources index main-codebase --dry-run

# Check patterns match expected files
gwi knowledge sources patterns main-codebase --preview
```

---

## Related Documentation

- [238-DR-SPEC-knowledge-base-rag.md](./238-DR-SPEC-knowledge-base-rag.md) - Knowledge base specification
