/**
 * SDK Generator from OpenAPI
 *
 * Phase 39: Generate TypeScript SDK from OpenAPI specification.
 *
 * Features:
 * - TypeScript type generation from schemas
 * - API client generation from paths
 * - Changelog generation from spec diff
 * - Version compatibility checking
 *
 * @module @gwi/core/sdk-gen
 */

// =============================================================================
// Types
// =============================================================================

/**
 * OpenAPI specification (simplified)
 */
export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  security?: Array<Record<string, string[]>>;
}

/**
 * Path item
 */
export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  parameters?: Parameter[];
}

/**
 * Operation
 */
export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
}

/**
 * Parameter
 */
export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: SchemaObject;
}

/**
 * Request body
 */
export interface RequestBody {
  required?: boolean;
  description?: string;
  content: Record<string, MediaType>;
}

/**
 * Response
 */
export interface Response {
  description: string;
  content?: Record<string, MediaType>;
}

/**
 * Media type
 */
export interface MediaType {
  schema: SchemaObject;
}

/**
 * Schema object
 */
export interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  enum?: string[];
  $ref?: string;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  description?: string;
  nullable?: boolean;
  default?: unknown;
}

/**
 * Security scheme
 */
export interface SecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: string;
}

/**
 * SDK generation options
 */
export interface SdkGeneratorOptions {
  /** Package name */
  packageName: string;
  /** Package version */
  version: string;
  /** Output directory */
  outputDir: string;
  /** Base URL for API calls */
  baseUrl?: string;
  /** Include JSDoc comments */
  includeComments: boolean;
  /** Generate validation */
  generateValidation: boolean;
}

/**
 * Generated SDK file
 */
export interface GeneratedFile {
  /** File path relative to output dir */
  path: string;
  /** File content */
  content: string;
}

/**
 * SDK generation result
 */
export interface SdkGenerationResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generated files */
  files: GeneratedFile[];
  /** Errors if any */
  errors: string[];
  /** Warnings */
  warnings: string[];
  /** Statistics */
  stats: {
    types: number;
    endpoints: number;
    totalLines: number;
  };
}

// =============================================================================
// Default Options
// =============================================================================

/**
 * Default SDK generator options
 */
export const DEFAULT_SDK_OPTIONS: SdkGeneratorOptions = {
  packageName: '@gwi/api-client',
  version: '0.0.0',
  outputDir: 'dist/sdk',
  includeComments: true,
  generateValidation: false,
};

// =============================================================================
// SDK Generator
// =============================================================================

/**
 * Generate TypeScript SDK from OpenAPI spec
 */
export class SdkGenerator {
  private spec: OpenApiSpec;
  private options: SdkGeneratorOptions;
  private generatedTypes: Set<string> = new Set();

  constructor(spec: OpenApiSpec, options: Partial<SdkGeneratorOptions> = {}) {
    this.spec = spec;
    this.options = { ...DEFAULT_SDK_OPTIONS, ...options };
  }

  /**
   * Generate SDK
   */
  generate(): SdkGenerationResult {
    const files: GeneratedFile[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Generate types from schemas
      const typesFile = this.generateTypes();
      files.push(typesFile);

      // Generate API client
      const clientFile = this.generateClient();
      files.push(clientFile);

      // Generate index
      const indexFile = this.generateIndex();
      files.push(indexFile);

      // Generate package.json
      const packageFile = this.generatePackageJson();
      files.push(packageFile);

      return {
        success: true,
        files,
        errors,
        warnings,
        stats: {
          types: this.generatedTypes.size,
          endpoints: this.countEndpoints(),
          totalLines: files.reduce((sum, f) => sum + f.content.split('\n').length, 0),
        },
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        files,
        errors,
        warnings,
        stats: { types: 0, endpoints: 0, totalLines: 0 },
      };
    }
  }

  /**
   * Generate types file
   */
  private generateTypes(): GeneratedFile {
    const lines: string[] = [
      '/**',
      ' * Generated API Types',
      ' *',
      ` * Generated from: ${this.spec.info.title} v${this.spec.info.version}`,
      ' * Do not edit manually.',
      ' */',
      '',
    ];

    // Generate types from schemas
    const schemas = this.spec.components?.schemas || {};
    for (const [name, schema] of Object.entries(schemas)) {
      const typeCode = this.schemaToType(name, schema);
      lines.push(typeCode);
      lines.push('');
    }

    // Generate request/response types for operations
    for (const [_path, pathItem] of Object.entries(this.spec.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const operation = pathItem[method];
        if (operation?.operationId) {
          const types = this.operationTypes(operation);
          if (types) {
            lines.push(types);
            lines.push('');
          }
        }
      }
    }

    return {
      path: 'types.ts',
      content: lines.join('\n'),
    };
  }

  /**
   * Generate client file
   */
  private generateClient(): GeneratedFile {
    const lines: string[] = [
      '/**',
      ' * Generated API Client',
      ' *',
      ` * Generated from: ${this.spec.info.title} v${this.spec.info.version}`,
      ' * Do not edit manually.',
      ' */',
      '',
      "import type * as Types from './types.js';",
      '',
      '/**',
      ' * API Client configuration',
      ' */',
      'export interface ClientConfig {',
      '  /** Base URL for API calls */',
      '  baseUrl: string;',
      '  /** Authentication token */',
      '  token?: string;',
      '  /** Custom headers */',
      '  headers?: Record<string, string>;',
      '  /** Fetch implementation */',
      '  fetch?: typeof fetch;',
      '}',
      '',
      '/**',
      ' * API response wrapper',
      ' */',
      'export interface ApiResponse<T> {',
      '  /** Response status code */',
      '  status: number;',
      '  /** Response data */',
      '  data: T;',
      '  /** Response headers */',
      '  headers: Record<string, string>;',
      '}',
      '',
      '/**',
      ' * API error',
      ' */',
      'export class ApiError extends Error {',
      '  constructor(',
      '    public status: number,',
      '    public statusText: string,',
      '    public body?: unknown',
      '  ) {',
      '    super(`API Error: ${status} ${statusText}`);',
      '    this.name = "ApiError";',
      '  }',
      '}',
      '',
      '/**',
      ` * ${this.spec.info.title} API Client`,
      ' */',
      'export class ApiClient {',
      '  private config: ClientConfig;',
      '',
      '  constructor(config: ClientConfig) {',
      '    this.config = config;',
      '  }',
      '',
    ];

    // Generate methods for each operation
    for (const [path, pathItem] of Object.entries(this.spec.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const operation = pathItem[method];
        if (operation?.operationId) {
          const methodCode = this.generateMethod(path, method, operation, pathItem.parameters);
          lines.push(methodCode);
          lines.push('');
        }
      }
    }

    // Add private request method
    lines.push('  /**');
    lines.push('   * Make API request');
    lines.push('   */');
    lines.push('  private async request<T>(');
    lines.push('    method: string,');
    lines.push('    path: string,');
    lines.push('    options: {');
    lines.push('      params?: Record<string, string>;');
    lines.push('      body?: unknown;');
    lines.push('      headers?: Record<string, string>;');
    lines.push('    } = {}');
    lines.push('  ): Promise<ApiResponse<T>> {');
    lines.push('    const url = new URL(path, this.config.baseUrl);');
    lines.push('    if (options.params) {');
    lines.push('      for (const [key, value] of Object.entries(options.params)) {');
    lines.push('        url.searchParams.set(key, value);');
    lines.push('      }');
    lines.push('    }');
    lines.push('');
    lines.push('    const headers: Record<string, string> = {');
    lines.push("      'Content-Type': 'application/json',");
    lines.push('      ...this.config.headers,');
    lines.push('      ...options.headers,');
    lines.push('    };');
    lines.push('');
    lines.push('    if (this.config.token) {');
    lines.push('      headers["Authorization"] = `Bearer ${this.config.token}`;');
    lines.push('    }');
    lines.push('');
    lines.push('    const fetchFn = this.config.fetch || fetch;');
    lines.push('    const response = await fetchFn(url.toString(), {');
    lines.push('      method,');
    lines.push('      headers,');
    lines.push('      body: options.body ? JSON.stringify(options.body) : undefined,');
    lines.push('    });');
    lines.push('');
    lines.push('    if (!response.ok) {');
    lines.push('      const body = await response.text();');
    lines.push('      throw new ApiError(response.status, response.statusText, body);');
    lines.push('    }');
    lines.push('');
    lines.push('    const data = await response.json();');
    lines.push('    const responseHeaders: Record<string, string> = {};');
    lines.push('    response.headers.forEach((value, key) => {');
    lines.push('      responseHeaders[key] = value;');
    lines.push('    });');
    lines.push('');
    lines.push('    return { status: response.status, data, headers: responseHeaders };');
    lines.push('  }');
    lines.push('}');

    return {
      path: 'client.ts',
      content: lines.join('\n'),
    };
  }

  /**
   * Generate method for operation
   */
  private generateMethod(
    path: string,
    method: string,
    operation: Operation,
    pathParams?: Parameter[]
  ): string {
    const methodName = this.operationToMethodName(operation.operationId || `${method}${path}`);
    const lines: string[] = [];

    // JSDoc
    if (this.options.includeComments) {
      lines.push('  /**');
      if (operation.summary) {
        lines.push(`   * ${operation.summary}`);
      }
      if (operation.description) {
        lines.push('   *');
        lines.push(`   * ${operation.description}`);
      }
      lines.push('   */');
    }

    // Collect parameters
    const allParams = [...(pathParams || []), ...(operation.parameters || [])];
    const pathParamNames = allParams.filter(p => p.in === 'path').map(p => p.name);
    const queryParams = allParams.filter(p => p.in === 'query');
    const hasBody = operation.requestBody;

    // Build method signature
    const params: string[] = [];
    for (const name of pathParamNames) {
      params.push(`${name}: string`);
    }
    if (queryParams.length > 0) {
      const queryType = queryParams
        .map(p => `${p.name}${p.required ? '' : '?'}: ${this.schemaTypeString(p.schema)}`)
        .join('; ');
      params.push(`query?: { ${queryType} }`);
    }
    if (hasBody) {
      params.push(`body: unknown`);
    }

    // Get return type
    const returnType = this.getResponseType(operation);

    lines.push(`  async ${methodName}(${params.join(', ')}): Promise<ApiResponse<${returnType}>> {`);

    // Build path with substitutions
    let pathTemplate = path;
    for (const name of pathParamNames) {
      pathTemplate = pathTemplate.replace(`{${name}}`, `\${${name}}`);
    }

    lines.push(`    return this.request<${returnType}>('${method.toUpperCase()}', \`${pathTemplate}\`, {`);
    if (queryParams.length > 0) {
      lines.push('      params: query as Record<string, string>,');
    }
    if (hasBody) {
      lines.push('      body,');
    }
    lines.push('    });');
    lines.push('  }');

    return lines.join('\n');
  }

  /**
   * Generate index file
   */
  private generateIndex(): GeneratedFile {
    const lines: string[] = [
      '/**',
      ' * Generated API SDK',
      ' *',
      ` * ${this.spec.info.title} v${this.spec.info.version}`,
      ' */',
      '',
      "export * from './types.js';",
      "export * from './client.js';",
      '',
    ];

    return {
      path: 'index.ts',
      content: lines.join('\n'),
    };
  }

  /**
   * Generate package.json
   */
  private generatePackageJson(): GeneratedFile {
    const pkg = {
      name: this.options.packageName,
      version: this.options.version,
      description: `Generated SDK for ${this.spec.info.title}`,
      main: 'index.js',
      types: 'index.d.ts',
      exports: {
        '.': {
          types: './index.d.ts',
          import: './index.js',
        },
      },
      scripts: {
        build: 'tsc',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
    };

    return {
      path: 'package.json',
      content: JSON.stringify(pkg, null, 2),
    };
  }

  /**
   * Convert schema to TypeScript type
   */
  private schemaToType(name: string, schema: SchemaObject): string {
    this.generatedTypes.add(name);
    const lines: string[] = [];

    // JSDoc
    if (this.options.includeComments && schema.description) {
      lines.push('/**');
      lines.push(` * ${schema.description}`);
      lines.push(' */');
    }

    if (schema.enum) {
      // Enum type
      const values = schema.enum.map(v => `'${v}'`).join(' | ');
      lines.push(`export type ${name} = ${values};`);
    } else if (schema.type === 'object' || schema.properties) {
      // Object type
      lines.push(`export interface ${name} {`);
      const required = new Set(schema.required || []);
      for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
        if (this.options.includeComments && propSchema.description) {
          lines.push(`  /** ${propSchema.description} */`);
        }
        const optional = required.has(propName) ? '' : '?';
        const nullable = propSchema.nullable ? ' | null' : '';
        lines.push(`  ${propName}${optional}: ${this.schemaTypeString(propSchema)}${nullable};`);
      }
      lines.push('}');
    } else if (schema.allOf) {
      // Intersection type
      const types = schema.allOf.map(s => this.schemaTypeString(s)).join(' & ');
      lines.push(`export type ${name} = ${types};`);
    } else if (schema.oneOf || schema.anyOf) {
      // Union type
      const schemas = schema.oneOf || schema.anyOf || [];
      const types = schemas.map(s => this.schemaTypeString(s)).join(' | ');
      lines.push(`export type ${name} = ${types};`);
    } else {
      // Alias type
      lines.push(`export type ${name} = ${this.schemaTypeString(schema)};`);
    }

    return lines.join('\n');
  }

  /**
   * Get TypeScript type string for schema
   */
  private schemaTypeString(schema: SchemaObject): string {
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop() || 'unknown';
      return refName;
    }

    switch (schema.type) {
      case 'string':
        return schema.format === 'date-time' ? 'string' : 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
        return `Array<${this.schemaTypeString(schema.items || { type: 'unknown' })}>`;
      case 'object':
        if (schema.properties) {
          const props = Object.entries(schema.properties)
            .map(([k, v]) => `${k}: ${this.schemaTypeString(v)}`)
            .join('; ');
          return `{ ${props} }`;
        }
        return 'Record<string, unknown>';
      default:
        return 'unknown';
    }
  }

  /**
   * Generate types for operation
   */
  private operationTypes(_operation: Operation): string | null {
    // Could generate request/response types here if needed
    return null;
  }

  /**
   * Get response type for operation
   */
  private getResponseType(operation: Operation): string {
    const response = operation.responses['200'] || operation.responses['201'];
    if (response?.content?.['application/json']?.schema) {
      return this.schemaTypeString(response.content['application/json'].schema);
    }
    return 'unknown';
  }

  /**
   * Convert operation ID to method name
   */
  private operationToMethodName(operationId: string): string {
    // If already valid camelCase, return as-is
    if (/^[a-z][a-zA-Z0-9]*$/.test(operationId)) {
      return operationId;
    }
    // Otherwise convert from kebab/snake/space case to camelCase
    return operationId
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Count endpoints
   */
  private countEndpoints(): number {
    let count = 0;
    for (const pathItem of Object.values(this.spec.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        if (pathItem[method]) count++;
      }
    }
    return count;
  }
}

// =============================================================================
// Changelog Generation
// =============================================================================

/**
 * API change type
 */
export type ChangeType = 'added' | 'removed' | 'modified' | 'deprecated';

/**
 * API change entry
 */
export interface ApiChange {
  /** Change type */
  type: ChangeType;
  /** What was changed */
  path: string;
  /** Description */
  description: string;
  /** Whether this is a breaking change */
  breaking: boolean;
}

/**
 * API changelog
 */
export interface ApiChangelog {
  /** From version */
  fromVersion: string;
  /** To version */
  toVersion: string;
  /** Changes */
  changes: ApiChange[];
  /** Breaking changes count */
  breakingChanges: number;
  /** Generated at */
  generatedAt: Date;
}

/**
 * Compare two OpenAPI specs and generate changelog
 */
export function generateChangelog(
  oldSpec: OpenApiSpec,
  newSpec: OpenApiSpec
): ApiChangelog {
  const changes: ApiChange[] = [];

  // Compare paths
  const oldPaths = new Set(Object.keys(oldSpec.paths));
  const newPaths = new Set(Object.keys(newSpec.paths));

  // Added paths
  for (const path of newPaths) {
    if (!oldPaths.has(path)) {
      changes.push({
        type: 'added',
        path: `paths.${path}`,
        description: `New endpoint: ${path}`,
        breaking: false,
      });
    }
  }

  // Removed paths
  for (const path of oldPaths) {
    if (!newPaths.has(path)) {
      changes.push({
        type: 'removed',
        path: `paths.${path}`,
        description: `Removed endpoint: ${path}`,
        breaking: true,
      });
    }
  }

  // Compare schemas
  const oldSchemas = new Set(Object.keys(oldSpec.components?.schemas || {}));
  const newSchemas = new Set(Object.keys(newSpec.components?.schemas || {}));

  for (const schema of newSchemas) {
    if (!oldSchemas.has(schema)) {
      changes.push({
        type: 'added',
        path: `components.schemas.${schema}`,
        description: `New schema: ${schema}`,
        breaking: false,
      });
    }
  }

  for (const schema of oldSchemas) {
    if (!newSchemas.has(schema)) {
      changes.push({
        type: 'removed',
        path: `components.schemas.${schema}`,
        description: `Removed schema: ${schema}`,
        breaking: true,
      });
    }
  }

  return {
    fromVersion: oldSpec.info.version,
    toVersion: newSpec.info.version,
    changes,
    breakingChanges: changes.filter(c => c.breaking).length,
    generatedAt: new Date(),
  };
}

/**
 * Generate changelog markdown
 */
export function changelogToMarkdown(changelog: ApiChangelog): string {
  const lines = [
    '# API Changelog',
    '',
    `**From:** v${changelog.fromVersion}`,
    `**To:** v${changelog.toVersion}`,
    `**Generated:** ${changelog.generatedAt.toISOString()}`,
    '',
  ];

  if (changelog.breakingChanges > 0) {
    lines.push(`⚠️ **${changelog.breakingChanges} breaking change(s)**`);
    lines.push('');
  }

  const addedChanges = changelog.changes.filter(c => c.type === 'added');
  const removedChanges = changelog.changes.filter(c => c.type === 'removed');
  const modifiedChanges = changelog.changes.filter(c => c.type === 'modified');

  if (addedChanges.length > 0) {
    lines.push('## Added');
    lines.push('');
    for (const change of addedChanges) {
      lines.push(`- ${change.description}`);
    }
    lines.push('');
  }

  if (removedChanges.length > 0) {
    lines.push('## Removed');
    lines.push('');
    for (const change of removedChanges) {
      const breaking = change.breaking ? ' ⚠️ BREAKING' : '';
      lines.push(`- ${change.description}${breaking}`);
    }
    lines.push('');
  }

  if (modifiedChanges.length > 0) {
    lines.push('## Modified');
    lines.push('');
    for (const change of modifiedChanges) {
      const breaking = change.breaking ? ' ⚠️ BREAKING' : '';
      lines.push(`- ${change.description}${breaking}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// Exports
// =============================================================================

export { SdkGenerator as OpenApiSdkGenerator };
