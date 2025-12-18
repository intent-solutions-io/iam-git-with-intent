/**
 * SDK Generator Tests
 *
 * Phase 39: Tests for OpenAPI to TypeScript SDK generation.
 */

import { describe, it, expect } from 'vitest';
import {
  SdkGenerator,
  generateChangelog,
  changelogToMarkdown,
  DEFAULT_SDK_OPTIONS,
  OpenApiSpec,
} from '../index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const minimalSpec: OpenApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Test API',
    version: '1.0.0',
    description: 'A test API',
  },
  paths: {},
};

const fullSpec: OpenApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Git With Intent API',
    version: '2.0.0',
    description: 'API for Git With Intent',
  },
  servers: [
    { url: 'https://api.gitwithintent.com', description: 'Production' },
  ],
  paths: {
    '/runs': {
      get: {
        operationId: 'listRuns',
        summary: 'List all runs',
        description: 'Returns a paginated list of runs',
        tags: ['runs'],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Maximum number of items to return',
            schema: { type: 'integer' },
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Run' },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'createRun',
        summary: 'Create a new run',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateRunRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Run created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Run' },
              },
            },
          },
        },
      },
    },
    '/runs/{runId}': {
      get: {
        operationId: 'getRun',
        summary: 'Get a run by ID',
        parameters: [
          {
            name: 'runId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Run found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Run' },
              },
            },
          },
        },
      },
      delete: {
        operationId: 'deleteRun',
        summary: 'Delete a run',
        parameters: [
          {
            name: 'runId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': {
            description: 'Run deleted',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Run: {
        type: 'object',
        description: 'A workflow run',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string', description: 'Unique identifier' },
          status: { $ref: '#/components/schemas/RunStatus' },
          createdAt: { type: 'string', format: 'date-time' },
          metadata: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      RunStatus: {
        type: 'string',
        enum: ['pending', 'running', 'completed', 'failed'],
        description: 'Status of a run',
      },
      CreateRunRequest: {
        type: 'object',
        required: ['repoUrl'],
        properties: {
          repoUrl: { type: 'string', description: 'Repository URL' },
          issueNumber: { type: 'integer', description: 'Issue number' },
          options: {
            type: 'object',
            properties: {
              dryRun: { type: 'boolean' },
              autoMerge: { type: 'boolean' },
            },
          },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

// =============================================================================
// SdkGenerator Tests
// =============================================================================

describe('SdkGenerator', () => {
  describe('Constructor', () => {
    it('should use default options', () => {
      const generator = new SdkGenerator(minimalSpec);
      expect(generator).toBeDefined();
    });

    it('should accept custom options', () => {
      const generator = new SdkGenerator(minimalSpec, {
        packageName: '@custom/api',
        version: '1.2.3',
      });
      expect(generator).toBeDefined();
    });
  });

  describe('generate()', () => {
    it('should generate SDK for minimal spec', () => {
      const generator = new SdkGenerator(minimalSpec);
      const result = generator.generate();

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(4);
    });

    it('should generate SDK for full spec', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(4);
      expect(result.stats.types).toBeGreaterThan(0);
      expect(result.stats.endpoints).toBe(4); // listRuns, createRun, getRun, deleteRun
    });

    it('should generate types.ts with schemas', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();

      const typesFile = result.files.find(f => f.path === 'types.ts');
      expect(typesFile).toBeDefined();
      expect(typesFile!.content).toContain('export interface Run');
      expect(typesFile!.content).toContain('export type RunStatus');
      expect(typesFile!.content).toContain("'pending' | 'running' | 'completed' | 'failed'");
    });

    it('should generate client.ts with methods', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();

      const clientFile = result.files.find(f => f.path === 'client.ts');
      expect(clientFile).toBeDefined();
      expect(clientFile!.content).toContain('class ApiClient');
      expect(clientFile!.content).toContain('async listRuns');
      expect(clientFile!.content).toContain('async createRun');
      expect(clientFile!.content).toContain('async getRun');
      expect(clientFile!.content).toContain('async deleteRun');
    });

    it('should generate index.ts', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();

      const indexFile = result.files.find(f => f.path === 'index.ts');
      expect(indexFile).toBeDefined();
      expect(indexFile!.content).toContain("export * from './types.js'");
      expect(indexFile!.content).toContain("export * from './client.js'");
    });

    it('should generate package.json', () => {
      const generator = new SdkGenerator(fullSpec, {
        packageName: '@gwi/test-sdk',
        version: '1.0.0',
      });
      const result = generator.generate();

      const packageFile = result.files.find(f => f.path === 'package.json');
      expect(packageFile).toBeDefined();

      const pkg = JSON.parse(packageFile!.content);
      expect(pkg.name).toBe('@gwi/test-sdk');
      expect(pkg.version).toBe('1.0.0');
    });
  });

  describe('Type Generation', () => {
    it('should generate enum types', () => {
      const spec: OpenApiSpec = {
        ...minimalSpec,
        components: {
          schemas: {
            Priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
            },
          },
        },
      };

      const generator = new SdkGenerator(spec);
      const result = generator.generate();
      const typesFile = result.files.find(f => f.path === 'types.ts')!;

      expect(typesFile.content).toContain("export type Priority = 'low' | 'medium' | 'high'");
    });

    it('should generate object types with required fields', () => {
      const spec: OpenApiSpec = {
        ...minimalSpec,
        components: {
          schemas: {
            User: {
              type: 'object',
              required: ['id', 'email'],
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
        },
      };

      const generator = new SdkGenerator(spec);
      const result = generator.generate();
      const typesFile = result.files.find(f => f.path === 'types.ts')!;

      expect(typesFile.content).toContain('id: string;');
      expect(typesFile.content).toContain('email: string;');
      expect(typesFile.content).toContain('name?: string;');
    });

    it('should generate array types', () => {
      const spec: OpenApiSpec = {
        ...minimalSpec,
        components: {
          schemas: {
            TagList: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      };

      const generator = new SdkGenerator(spec);
      const result = generator.generate();
      const typesFile = result.files.find(f => f.path === 'types.ts')!;

      expect(typesFile.content).toContain('Array<string>');
    });

    it('should handle nullable types', () => {
      const spec: OpenApiSpec = {
        ...minimalSpec,
        components: {
          schemas: {
            OptionalData: {
              type: 'object',
              properties: {
                value: { type: 'string', nullable: true },
              },
            },
          },
        },
      };

      const generator = new SdkGenerator(spec);
      const result = generator.generate();
      const typesFile = result.files.find(f => f.path === 'types.ts')!;

      expect(typesFile.content).toContain('| null');
    });

    it('should handle $ref references', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();
      const typesFile = result.files.find(f => f.path === 'types.ts')!;

      expect(typesFile.content).toContain('status: RunStatus');
    });
  });

  describe('Client Generation', () => {
    it('should generate path parameters', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();
      const clientFile = result.files.find(f => f.path === 'client.ts')!;

      expect(clientFile.content).toContain('async getRun(runId: string)');
      expect(clientFile.content).toContain('${runId}');
    });

    it('should generate query parameters', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();
      const clientFile = result.files.find(f => f.path === 'client.ts')!;

      expect(clientFile.content).toContain('query?:');
      expect(clientFile.content).toContain('limit?:');
      expect(clientFile.content).toContain('offset?:');
    });

    it('should generate request body handling', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();
      const clientFile = result.files.find(f => f.path === 'client.ts')!;

      expect(clientFile.content).toContain('body: unknown');
      expect(clientFile.content).toContain('body,');
    });

    it('should include JSDoc comments when enabled', () => {
      const generator = new SdkGenerator(fullSpec, { includeComments: true });
      const result = generator.generate();
      const clientFile = result.files.find(f => f.path === 'client.ts')!;

      expect(clientFile.content).toContain('* List all runs');
      expect(clientFile.content).toContain('* Create a new run');
    });

    it('should omit comments when disabled', () => {
      const generator = new SdkGenerator(fullSpec, { includeComments: false });
      const result = generator.generate();
      const clientFile = result.files.find(f => f.path === 'client.ts')!;

      // The method summary comments should not be present
      expect(clientFile.content).not.toContain('* List all runs');
    });

    it('should generate ApiError class', () => {
      const generator = new SdkGenerator(minimalSpec);
      const result = generator.generate();
      const clientFile = result.files.find(f => f.path === 'client.ts')!;

      expect(clientFile.content).toContain('class ApiError extends Error');
      expect(clientFile.content).toContain('public status: number');
      expect(clientFile.content).toContain('public statusText: string');
    });

    it('should generate ClientConfig interface', () => {
      const generator = new SdkGenerator(minimalSpec);
      const result = generator.generate();
      const clientFile = result.files.find(f => f.path === 'client.ts')!;

      expect(clientFile.content).toContain('interface ClientConfig');
      expect(clientFile.content).toContain('baseUrl: string');
      expect(clientFile.content).toContain('token?: string');
    });
  });

  describe('Statistics', () => {
    it('should count types correctly', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();

      expect(result.stats.types).toBe(3); // Run, RunStatus, CreateRunRequest
    });

    it('should count endpoints correctly', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();

      expect(result.stats.endpoints).toBe(4);
    });

    it('should count total lines', () => {
      const generator = new SdkGenerator(fullSpec);
      const result = generator.generate();

      expect(result.stats.totalLines).toBeGreaterThan(100);
    });
  });
});

// =============================================================================
// Changelog Generation Tests
// =============================================================================

describe('generateChangelog', () => {
  const v1Spec: OpenApiSpec = {
    openapi: '3.0.3',
    info: { title: 'API', version: '1.0.0' },
    paths: {
      '/users': { get: { operationId: 'listUsers', responses: {} } },
      '/old-endpoint': { get: { operationId: 'oldEndpoint', responses: {} } },
    },
    components: {
      schemas: {
        User: { type: 'object' },
        OldSchema: { type: 'object' },
      },
    },
  };

  const v2Spec: OpenApiSpec = {
    openapi: '3.0.3',
    info: { title: 'API', version: '2.0.0' },
    paths: {
      '/users': { get: { operationId: 'listUsers', responses: {} } },
      '/new-endpoint': { post: { operationId: 'newEndpoint', responses: {} } },
    },
    components: {
      schemas: {
        User: { type: 'object' },
        NewSchema: { type: 'object' },
      },
    },
  };

  it('should detect added endpoints', () => {
    const changelog = generateChangelog(v1Spec, v2Spec);

    const addedEndpoint = changelog.changes.find(
      c => c.type === 'added' && c.path.includes('/new-endpoint')
    );
    expect(addedEndpoint).toBeDefined();
    expect(addedEndpoint!.breaking).toBe(false);
  });

  it('should detect removed endpoints', () => {
    const changelog = generateChangelog(v1Spec, v2Spec);

    const removedEndpoint = changelog.changes.find(
      c => c.type === 'removed' && c.path.includes('/old-endpoint')
    );
    expect(removedEndpoint).toBeDefined();
    expect(removedEndpoint!.breaking).toBe(true);
  });

  it('should detect added schemas', () => {
    const changelog = generateChangelog(v1Spec, v2Spec);

    const addedSchema = changelog.changes.find(
      c => c.type === 'added' && c.path.includes('NewSchema')
    );
    expect(addedSchema).toBeDefined();
  });

  it('should detect removed schemas', () => {
    const changelog = generateChangelog(v1Spec, v2Spec);

    const removedSchema = changelog.changes.find(
      c => c.type === 'removed' && c.path.includes('OldSchema')
    );
    expect(removedSchema).toBeDefined();
    expect(removedSchema!.breaking).toBe(true);
  });

  it('should count breaking changes', () => {
    const changelog = generateChangelog(v1Spec, v2Spec);

    expect(changelog.breakingChanges).toBe(2); // removed endpoint + removed schema
  });

  it('should set version info', () => {
    const changelog = generateChangelog(v1Spec, v2Spec);

    expect(changelog.fromVersion).toBe('1.0.0');
    expect(changelog.toVersion).toBe('2.0.0');
  });

  it('should set generation timestamp', () => {
    const changelog = generateChangelog(v1Spec, v2Spec);

    expect(changelog.generatedAt).toBeInstanceOf(Date);
  });
});

// =============================================================================
// Changelog Markdown Tests
// =============================================================================

describe('changelogToMarkdown', () => {
  it('should generate markdown header', () => {
    const changelog = generateChangelog(minimalSpec, minimalSpec);
    const markdown = changelogToMarkdown(changelog);

    expect(markdown).toContain('# API Changelog');
    expect(markdown).toContain('**From:**');
    expect(markdown).toContain('**To:**');
  });

  it('should include breaking changes warning', () => {
    const v1: OpenApiSpec = {
      ...minimalSpec,
      paths: { '/old': { get: { operationId: 'old', responses: {} } } },
    };
    const v2: OpenApiSpec = {
      ...minimalSpec,
      info: { ...minimalSpec.info, version: '2.0.0' },
      paths: {},
    };

    const changelog = generateChangelog(v1, v2);
    const markdown = changelogToMarkdown(changelog);

    expect(markdown).toContain('breaking change');
  });

  it('should organize changes by type', () => {
    const v1: OpenApiSpec = {
      ...minimalSpec,
      paths: { '/old': { get: { operationId: 'old', responses: {} } } },
    };
    const v2: OpenApiSpec = {
      ...minimalSpec,
      info: { ...minimalSpec.info, version: '2.0.0' },
      paths: { '/new': { post: { operationId: 'new', responses: {} } } },
    };

    const changelog = generateChangelog(v1, v2);
    const markdown = changelogToMarkdown(changelog);

    expect(markdown).toContain('## Added');
    expect(markdown).toContain('## Removed');
  });

  it('should mark breaking changes with warning', () => {
    const v1: OpenApiSpec = {
      ...minimalSpec,
      paths: { '/old': { get: { operationId: 'old', responses: {} } } },
    };
    const v2: OpenApiSpec = {
      ...minimalSpec,
      info: { ...minimalSpec.info, version: '2.0.0' },
      paths: {},
    };

    const changelog = generateChangelog(v1, v2);
    const markdown = changelogToMarkdown(changelog);

    expect(markdown).toContain('BREAKING');
  });
});

// =============================================================================
// Default Configuration Tests
// =============================================================================

describe('Default Configuration', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_SDK_OPTIONS.packageName).toBe('@gwi/api-client');
    expect(DEFAULT_SDK_OPTIONS.version).toBe('0.0.0');
    expect(DEFAULT_SDK_OPTIONS.includeComments).toBe(true);
    expect(DEFAULT_SDK_OPTIONS.generateValidation).toBe(false);
  });
});
