# Knowledge Base & RAG Search Specification

> **Document**: 238-DR-SPEC-knowledge-base-rag
> **Epic**: EPIC 023 - Knowledge Base / RAG Search
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

GWI's knowledge base provides intelligent search across codebases, documentation, and historical context using Retrieval-Augmented Generation (RAG). This enables AI agents to access relevant context for code generation, review, and issue resolution.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KNOWLEDGE BASE ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        CONTENT SOURCES                                │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │  │
│  │  │  Code  │  │  Docs  │  │  PRs   │  │ Issues │  │ Slack  │        │  │
│  │  │ Files  │  │  .md   │  │Reviews │  │Tickets │  │Archives│        │  │
│  │  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘        │  │
│  └───────┼──────────┼──────────┼──────────┼──────────┼────────────────┘  │
│          │          │          │          │          │                     │
│          └──────────┴──────────┴──────────┴──────────┘                     │
│                                │                                            │
│                       ┌────────▼────────┐                                  │
│                       │   PROCESSING    │                                  │
│                       │   PIPELINE      │                                  │
│                       └────────┬────────┘                                  │
│                                │                                            │
│           ┌────────────────────┼────────────────────┐                      │
│           │                    │                    │                      │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐            │
│  │    Chunking     │  │   Embedding     │  │   Metadata     │            │
│  │  (Semantic)     │  │  (text-004)     │  │  Extraction    │            │
│  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘            │
│           │                    │                    │                      │
│           └────────────────────┼────────────────────┘                      │
│                                │                                            │
│                       ┌────────▼────────┐                                  │
│                       │  VECTOR STORE   │                                  │
│                       │  (Vertex AI     │                                  │
│                       │   Matching      │                                  │
│                       │   Engine)       │                                  │
│                       └────────┬────────┘                                  │
│                                │                                            │
│                       ┌────────▼────────┐                                  │
│                       │    RAG ENGINE   │                                  │
│                       │  - Retrieval    │                                  │
│                       │  - Reranking    │                                  │
│                       │  - Augmentation │                                  │
│                       └────────┬────────┘                                  │
│                                │                                            │
│           ┌────────────────────┼────────────────────┐                      │
│           ▼                    ▼                    ▼                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │  Coder Agent    │  │  Review Agent   │  │  Search API     │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Content Sources

### 1.1 Source Types

```yaml
content_sources:
  # Code files
  code:
    type: code
    patterns:
      - "**/*.ts"
      - "**/*.tsx"
      - "**/*.js"
      - "**/*.jsx"
      - "**/*.py"
      - "**/*.go"
      - "**/*.java"
      - "**/*.rs"
    exclude:
      - "**/node_modules/**"
      - "**/dist/**"
      - "**/build/**"
      - "**/*.min.js"
    chunking: ast_aware
    refresh: on_commit

  # Documentation
  documentation:
    type: markdown
    patterns:
      - "**/*.md"
      - "**/docs/**"
      - "**/README*"
    chunking: semantic
    refresh: on_commit

  # API specifications
  api_specs:
    type: openapi
    patterns:
      - "**/openapi.yaml"
      - "**/openapi.json"
      - "**/swagger.*"
    chunking: endpoint
    refresh: on_commit

  # Pull requests
  pull_requests:
    type: github_pr
    include:
      - title
      - description
      - review_comments
      - diff_context
    filter:
      state: merged
      since: 180d
    refresh: daily

  # Issues and tickets
  issues:
    type: github_issues
    include:
      - title
      - body
      - comments
      - labels
    filter:
      state: all
      since: 365d
    refresh: daily

  # Historical context
  historical:
    type: git_history
    include:
      - commit_messages
      - blame_context
    depth: 1000  # commits
    refresh: weekly
```

### 1.2 Source Configuration

```typescript
interface ContentSource {
  id: string;
  type: SourceType;

  // Connection
  connection: {
    type: 'local' | 'github' | 'gitlab' | 'jira' | 's3' | 'gcs';
    config: Record<string, unknown>;
  };

  // Processing
  processing: {
    chunking: ChunkingStrategy;
    embedding: EmbeddingConfig;
    metadata: MetadataExtraction;
  };

  // Refresh
  refresh: {
    trigger: 'realtime' | 'on_commit' | 'hourly' | 'daily' | 'weekly';
    fullReindex: 'weekly' | 'monthly' | 'on_demand';
  };

  // Access control
  access: {
    visibility: 'public' | 'tenant' | 'private';
    tenantId?: string;
  };
}

type SourceType =
  | 'code'
  | 'markdown'
  | 'openapi'
  | 'github_pr'
  | 'github_issues'
  | 'jira'
  | 'confluence'
  | 'slack'
  | 'git_history';
```

---

## 2. Processing Pipeline

### 2.1 Chunking Strategies

```typescript
interface ChunkingConfig {
  strategy: ChunkingStrategy;

  // Size limits
  maxChunkSize: number;        // Tokens
  minChunkSize: number;
  overlapSize: number;         // For context continuity

  // Strategy-specific options
  options: ChunkingOptions;
}

type ChunkingStrategy =
  | 'fixed_size'      // Fixed token windows
  | 'semantic'        // Based on content structure
  | 'ast_aware'       // Code-aware (functions, classes)
  | 'endpoint'        // API endpoint boundaries
  | 'paragraph';      // Document paragraphs

interface ASTChunkingOptions {
  // For code files
  granularity: 'file' | 'class' | 'function' | 'method';
  includeImports: boolean;
  includeComments: boolean;
  preserveSignatures: boolean;
}

interface SemanticChunkingOptions {
  // For documents
  headerBoundaries: boolean;   // Split on headers
  preserveSections: boolean;
  maxSectionDepth: number;
}
```

### 2.2 Chunking Examples

```yaml
# Code file chunking (AST-aware)
example_code_chunk:
  source: "packages/core/src/storage/firestore.ts"
  chunk_id: "firestore-ts-class-FirestoreStore"
  type: class
  content: |
    export class FirestoreStore implements Store {
      private db: Firestore;

      constructor(config: FirestoreConfig) {
        this.db = new Firestore(config);
      }

      async get<T>(key: string): Promise<T | null> {
        const doc = await this.db.doc(key).get();
        return doc.exists ? doc.data() as T : null;
      }

      async set<T>(key: string, value: T): Promise<void> {
        await this.db.doc(key).set(value);
      }
    }
  metadata:
    language: typescript
    file_path: packages/core/src/storage/firestore.ts
    class_name: FirestoreStore
    implements: [Store]
    methods: [get, set]
    line_start: 10
    line_end: 28

# Documentation chunking (Semantic)
example_doc_chunk:
  source: "docs/architecture.md"
  chunk_id: "arch-md-section-storage"
  type: section
  content: |
    ## Storage Architecture

    GWI uses a pluggable storage backend supporting multiple implementations:

    - **Firestore**: Production storage with real-time sync
    - **SQLite**: Local development with analytics
    - **In-Memory**: Fast unit testing

    All backends implement the `Store` interface defined in
    `packages/core/src/storage/interfaces.ts`.
  metadata:
    title: Storage Architecture
    header_level: 2
    parent_section: Architecture
    file_path: docs/architecture.md
```

### 2.3 Embedding Generation

```typescript
interface EmbeddingConfig {
  // Model configuration
  model: 'text-embedding-004' | 'text-embedding-3-large';
  dimensions: 768 | 1536 | 3072;

  // Batch processing
  batchSize: number;
  maxConcurrent: number;

  // Quality options
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';
}

interface EmbeddingResult {
  chunkId: string;
  vector: number[];
  model: string;
  dimensions: number;
  createdAt: Date;
}
```

### 2.4 Metadata Extraction

```typescript
interface MetadataExtraction {
  // Standard metadata
  standard: {
    sourceType: boolean;
    filePath: boolean;
    language: boolean;
    lastModified: boolean;
    author: boolean;
  };

  // Code-specific
  code: {
    imports: boolean;
    exports: boolean;
    dependencies: boolean;
    complexity: boolean;
    testCoverage: boolean;
  };

  // Document-specific
  document: {
    title: boolean;
    headers: boolean;
    links: boolean;
    tags: boolean;
  };

  // Custom extractors
  custom: {
    name: string;
    extractor: (content: string) => Record<string, unknown>;
  }[];
}
```

---

## 3. Vector Store

### 3.1 Vertex AI Matching Engine

```yaml
vector_store:
  provider: vertex_ai_matching_engine
  config:
    # Index configuration
    index:
      name: gwi-knowledge-index
      dimensions: 768
      distance_measure: DOT_PRODUCT_DISTANCE
      algorithm: TREE_AH
      tree_ah_config:
        leaf_node_embedding_count: 1000
        leaf_nodes_to_search_percent: 7

    # Endpoint configuration
    endpoint:
      name: gwi-knowledge-endpoint
      deployed_index_id: gwi-index-v1
      machine_type: e2-standard-16
      min_replicas: 1
      max_replicas: 5

    # Update configuration
    updates:
      streaming: true
      batch_size: 100
```

### 3.2 Schema

```typescript
interface VectorRecord {
  // Identity
  id: string;                    // Unique chunk ID
  namespace: string;             // Tenant isolation

  // Vector
  embedding: number[];
  embeddingModel: string;

  // Content
  content: string;               // Original text
  contentHash: string;           // For deduplication

  // Source
  sourceId: string;
  sourceType: SourceType;
  sourcePath: string;

  // Metadata (filterable)
  metadata: {
    language?: string;
    fileType?: string;
    repoName?: string;
    branch?: string;
    author?: string;
    createdAt?: Date;
    modifiedAt?: Date;
    tags?: string[];

    // Code-specific
    className?: string;
    functionName?: string;
    imports?: string[];

    // Document-specific
    title?: string;
    section?: string;
  };

  // Timestamps
  indexedAt: Date;
  updatedAt: Date;
}
```

### 3.3 Indexing Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Source    │────▶│   Chunk     │────▶│   Embed     │────▶│   Index     │
│   Files     │     │   Content   │     │   Vectors   │     │   Store     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                   │
      │                   │                   │                   │
      ▼                   ▼                   ▼                   ▼
 Detect changes      AST parse         Batch embed          Upsert to
 Filter patterns     Extract meta      Rate limit           Matching Engine
```

---

## 4. RAG Engine

### 4.1 Retrieval Pipeline

```typescript
interface RetrievalPipeline {
  // Query processing
  queryProcessing: {
    expansion: boolean;          // Expand query with synonyms
    decomposition: boolean;      // Break complex queries
    embedding: EmbeddingConfig;
  };

  // Initial retrieval
  retrieval: {
    method: 'knn' | 'hybrid';
    k: number;                   // Number of candidates
    filters?: MetadataFilter[];
    namespaces?: string[];
  };

  // Reranking
  reranking: {
    enabled: boolean;
    model: 'cross-encoder' | 'llm';
    topK: number;               // Final results
  };

  // Context assembly
  contextAssembly: {
    maxTokens: number;
    includeMetadata: boolean;
    deduplication: boolean;
  };
}
```

### 4.2 Search Types

```yaml
search_types:
  # Semantic search
  semantic:
    description: "Natural language search across all content"
    example: "How does authentication work?"
    pipeline:
      - embed_query
      - knn_search(k=20)
      - rerank(top_k=5)
      - assemble_context

  # Code search
  code:
    description: "Find code by functionality"
    example: "Function that validates email addresses"
    pipeline:
      - embed_query
      - knn_search(k=30, filter: type=code)
      - rerank(top_k=10)
      - expand_with_dependencies
      - assemble_context

  # Similar code
  similar:
    description: "Find code similar to given snippet"
    example: "Show me implementations like this function"
    pipeline:
      - embed_code_snippet
      - knn_search(k=20, filter: type=code)
      - exclude_same_file
      - rerank(top_k=5)

  # Historical context
  historical:
    description: "Find relevant past changes"
    example: "Previous changes to the auth module"
    pipeline:
      - embed_query
      - knn_search(k=50, filter: type IN [pr, commit])
      - filter_by_relevance
      - rerank(top_k=10)
```

### 4.3 Query Processing

```typescript
interface QueryProcessor {
  // Preprocess query
  preprocess(query: string): ProcessedQuery;

  // Expand with related terms
  expand(query: ProcessedQuery): ExpandedQuery;

  // Decompose complex queries
  decompose(query: string): string[];

  // Generate embedding
  embed(query: string): Promise<number[]>;
}

interface ProcessedQuery {
  original: string;
  normalized: string;
  keywords: string[];
  intents: QueryIntent[];
  filters: MetadataFilter[];
}

type QueryIntent =
  | 'find_implementation'
  | 'understand_concept'
  | 'find_similar'
  | 'find_history'
  | 'debug_issue'
  | 'find_usage';
```

### 4.4 Reranking

```typescript
interface Reranker {
  // Score relevance of results
  rerank(
    query: string,
    results: RetrievalResult[]
  ): Promise<RankedResult[]>;
}

// Cross-encoder reranking
class CrossEncoderReranker implements Reranker {
  private model: CrossEncoderModel;

  async rerank(query: string, results: RetrievalResult[]): Promise<RankedResult[]> {
    const scores = await Promise.all(
      results.map(r => this.model.score(query, r.content))
    );

    return results
      .map((r, i) => ({ ...r, rerankScore: scores[i] }))
      .sort((a, b) => b.rerankScore - a.rerankScore);
  }
}

// LLM-based reranking
class LLMReranker implements Reranker {
  async rerank(query: string, results: RetrievalResult[]): Promise<RankedResult[]> {
    const prompt = `
      Query: ${query}

      Rank these results by relevance (1 = most relevant):
      ${results.map((r, i) => `[${i}] ${r.content.slice(0, 200)}...`).join('\n')}

      Return: JSON array of indices in order of relevance
    `;

    const ranking = await this.llm.generate(prompt);
    return this.applyRanking(results, ranking);
  }
}
```

---

## 5. Integration with Agents

### 5.1 Agent Context Injection

```typescript
interface AgentContextProvider {
  // Get relevant context for a task
  getContext(task: AgentTask): Promise<Context>;
}

class RAGContextProvider implements AgentContextProvider {
  async getContext(task: AgentTask): Promise<Context> {
    // Determine search queries from task
    const queries = this.extractQueries(task);

    // Execute parallel searches
    const results = await Promise.all(
      queries.map(q => this.ragEngine.search(q))
    );

    // Merge and deduplicate
    const merged = this.mergeResults(results);

    // Format for agent consumption
    return this.formatContext(merged, task.maxContextTokens);
  }

  private extractQueries(task: AgentTask): SearchQuery[] {
    switch (task.type) {
      case 'code_generation':
        return [
          { query: task.description, type: 'semantic' },
          { query: task.targetFile, type: 'similar' },
        ];

      case 'merge_resolution':
        return [
          { query: `changes to ${task.files.join(', ')}`, type: 'historical' },
          { query: task.conflictContext, type: 'code' },
        ];

      case 'code_review':
        return [
          { query: task.changedCode, type: 'similar' },
          { query: `best practices for ${task.language}`, type: 'semantic' },
        ];

      default:
        return [{ query: task.description, type: 'semantic' }];
    }
  }
}
```

### 5.2 Context Templates

```yaml
context_templates:
  # Code generation context
  code_generation:
    sections:
      - name: relevant_implementations
        search: similar_code
        max_results: 5
        format: |
          ## Similar Implementations

          {for result in results}
          ### {result.file_path}
          ```{result.language}
          {result.content}
          ```
          {/for}

      - name: api_documentation
        search: semantic
        filter: type=documentation
        max_results: 3
        format: |
          ## Relevant Documentation

          {for result in results}
          {result.content}
          {/for}

      - name: type_definitions
        search: code
        filter: content contains "interface" OR "type"
        max_results: 5
        format: |
          ## Type Definitions

          {for result in results}
          ```typescript
          {result.content}
          ```
          {/for}

  # Merge resolution context
  merge_resolution:
    sections:
      - name: file_history
        search: historical
        filter: file_path={target_file}
        max_results: 10
        format: |
          ## Recent Changes to {target_file}

          {for result in results}
          ### {result.commit_sha} - {result.author}
          {result.message}
          {/for}

      - name: related_changes
        search: historical
        filter: modified_files contains {target_file}
        max_results: 5
```

---

## 6. Search API

### 6.1 API Endpoints

```yaml
endpoints:
  # Natural language search
  POST /api/v1/knowledge/search:
    request:
      query: string
      type: semantic | code | similar | historical
      filters:
        language?: string[]
        fileType?: string[]
        repo?: string[]
        since?: date
      limit: number
      includeMetadata: boolean
    response:
      results:
        - id: string
          content: string
          score: number
          metadata: object
      query_id: string
      took_ms: number

  # Find similar
  POST /api/v1/knowledge/similar:
    request:
      content: string
      type: code | document
      filters: object
      limit: number
    response:
      results: array

  # Get by ID
  GET /api/v1/knowledge/{id}:
    response:
      id: string
      content: string
      source: object
      metadata: object

  # Index status
  GET /api/v1/knowledge/status:
    response:
      total_documents: number
      by_type: object
      last_updated: date
      indexing_status: string
```

### 6.2 Search Examples

```bash
# Semantic search
curl -X POST https://api.gwi.dev/v1/knowledge/search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "How does the approval workflow work?",
    "type": "semantic",
    "limit": 5
  }'

# Code search
curl -X POST https://api.gwi.dev/v1/knowledge/search \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "Function that validates webhook signatures",
    "type": "code",
    "filters": {
      "language": ["typescript"]
    },
    "limit": 10
  }'

# Find similar code
curl -X POST https://api.gwi.dev/v1/knowledge/similar \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "content": "async function validateToken(token: string): Promise<boolean> { ... }",
    "type": "code",
    "limit": 5
  }'
```

---

## 7. Implementation

### 7.1 Knowledge Service

```typescript
// packages/core/src/knowledge/service.ts

export class KnowledgeService {
  private indexer: ContentIndexer;
  private vectorStore: VectorStore;
  private ragEngine: RAGEngine;

  // Indexing
  async indexRepository(repo: Repository): Promise<IndexResult> {
    // Discover content
    const sources = await this.discoverSources(repo);

    // Process each source
    for (const source of sources) {
      const chunks = await this.indexer.chunk(source);
      const embeddings = await this.indexer.embed(chunks);
      await this.vectorStore.upsert(embeddings);
    }

    return { indexed: sources.length, chunks: chunks.length };
  }

  // Searching
  async search(query: SearchQuery): Promise<SearchResult[]> {
    // Process query
    const processed = await this.ragEngine.processQuery(query);

    // Initial retrieval
    const candidates = await this.vectorStore.search(processed);

    // Rerank
    const ranked = await this.ragEngine.rerank(query.text, candidates);

    // Return top results
    return ranked.slice(0, query.limit);
  }

  // Context retrieval for agents
  async getAgentContext(task: AgentTask): Promise<Context> {
    const provider = new RAGContextProvider(this);
    return provider.getContext(task);
  }

  // Incremental updates
  async handleContentUpdate(event: ContentUpdateEvent): Promise<void> {
    if (event.type === 'deleted') {
      await this.vectorStore.delete(event.sourceId);
    } else {
      const chunks = await this.indexer.chunk(event.content);
      const embeddings = await this.indexer.embed(chunks);
      await this.vectorStore.upsert(embeddings);
    }
  }
}
```

### 7.2 Content Indexer

```typescript
// packages/core/src/knowledge/indexer.ts

export class ContentIndexer {
  private chunkers: Map<SourceType, Chunker>;
  private embeddingClient: EmbeddingClient;

  async chunk(source: ContentSource): Promise<Chunk[]> {
    const chunker = this.chunkers.get(source.type);
    return chunker.chunk(source.content, source.metadata);
  }

  async embed(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
    // Batch embedding with rate limiting
    const batches = this.batchChunks(chunks, 100);
    const results: EmbeddedChunk[] = [];

    for (const batch of batches) {
      const embeddings = await this.embeddingClient.embed(
        batch.map(c => c.content)
      );

      results.push(...batch.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i],
      })));
    }

    return results;
  }
}
```

---

## 8. CLI Commands

```bash
# Index a repository
gwi knowledge index --repo ./
gwi knowledge index --repo github.com/org/repo

# Search
gwi knowledge search "how does auth work"
gwi knowledge search --type code "validate email function"
gwi knowledge search --type similar --file ./src/auth.ts

# Status
gwi knowledge status
gwi knowledge status --detailed

# Manage sources
gwi knowledge sources list
gwi knowledge sources add --type confluence --url https://wiki.company.com
gwi knowledge sources remove <source-id>

# Reindex
gwi knowledge reindex --full
gwi knowledge reindex --source code

# Debug
gwi knowledge debug --query "search query" --explain
```

---

## 9. Configuration

```yaml
# knowledge-config.yaml
knowledge:
  # Vector store
  vector_store:
    provider: vertex_ai
    index_name: gwi-knowledge
    dimensions: 768

  # Embedding
  embedding:
    model: text-embedding-004
    batch_size: 100
    max_concurrent: 5

  # Chunking defaults
  chunking:
    code:
      strategy: ast_aware
      max_size: 1000
      overlap: 100
    documentation:
      strategy: semantic
      max_size: 500
      overlap: 50

  # Retrieval
  retrieval:
    default_k: 20
    rerank_k: 5
    max_context_tokens: 4000

  # Sources
  sources:
    - type: code
      patterns: ["**/*.ts", "**/*.py"]
      refresh: on_commit
    - type: documentation
      patterns: ["**/*.md"]
      refresh: on_commit
```

---

## Related Documentation

- [239-DR-TMPL-knowledge-source.md](./239-DR-TMPL-knowledge-source.md) - Knowledge source configuration template
- [232-DR-SPEC-ai-governance.md](./232-DR-SPEC-ai-governance.md) - AI governance for RAG
