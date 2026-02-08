/**
 * Terraform/OpenTofu Exporter
 *
 * Converts sandbox diffs to Terraform/OpenTofu configurations.
 * Generates HCL files for infrastructure as code.
 */

import type { FileDiff } from '../types.js';
import {
  IaCExporter,
  type IaCFormat,
  type ExportOptions,
  type ExportResult,
  type ExportedFile,
  type ExportSummary,
  type ValidationResult,
} from './base.js';

/**
 * Terraform/OpenTofu resource block
 */
interface TerraformResource {
  type: string;
  name: string;
  attributes: Record<string, unknown>;
  meta?: {
    dependsOn?: string[];
    count?: number | string;
    forEach?: string;
    provider?: string;
    lifecycle?: Record<string, unknown>;
  };
}

/**
 * Terraform/OpenTofu Exporter
 */
export class TerraformExporter extends IaCExporter {
  readonly format: IaCFormat = 'terraform';
  readonly displayName = 'Terraform/OpenTofu';

  /**
   * Export diffs to Terraform configuration
   */
  async export(diffs: FileDiff[], options?: Partial<ExportOptions>): Promise<ExportResult> {
    const opts: ExportOptions = {
      format: 'terraform',
      prefix: 'sandbox',
      includeComments: true,
      generateVariables: true,
      ...options,
    };

    const files: ExportedFile[] = [];
    const warnings: string[] = [];
    const resources: TerraformResource[] = [];
    const deletions: FileDiff[] = [];

    // Process diffs
    for (const diff of diffs) {
      if (diff.type === 'deleted') {
        deletions.push(diff);
        continue;
      }

      if (diff.isBinary) {
        warnings.push(`Skipping binary file: ${diff.path}`);
        continue;
      }

      const mapping = this.diffToResource(diff, opts);
      if (mapping) {
        const detected = this.detectResourceType(diff);
        resources.push({
          type: detected.suggestedType,
          name: mapping.name,
          attributes: {
            ...mapping.attributes,
            ...(detected.hints?.includes('executable') && { file_permission: '0755' }),
          },
          meta: detected.hints?.includes('sensitive')
            ? { lifecycle: { prevent_destroy: true } }
            : undefined,
        });
      }
    }

    // Generate main.tf
    const mainTf = this.generateMainTf(resources, deletions, opts);
    files.push({
      path: opts.outputDir ? `${opts.outputDir}/main.tf` : 'main.tf',
      content: mainTf,
      type: 'main',
    });

    // Generate variables.tf if requested
    if (opts.generateVariables) {
      const variablesTf = this.generateVariablesTf(opts);
      files.push({
        path: opts.outputDir ? `${opts.outputDir}/variables.tf` : 'variables.tf',
        content: variablesTf,
        type: 'variables',
      });
    }

    // Generate outputs.tf
    const outputsTf = this.generateOutputsTf(resources, opts);
    files.push({
      path: opts.outputDir ? `${opts.outputDir}/outputs.tf` : 'outputs.tf',
      content: outputsTf,
      type: 'outputs',
    });

    // Generate terraform.tfvars if there are variables
    if (opts.generateVariables) {
      const tfvars = this.generateTfvars(opts);
      files.push({
        path: opts.outputDir ? `${opts.outputDir}/terraform.tfvars` : 'terraform.tfvars',
        content: tfvars,
        type: 'variables',
      });
    }

    // Generate summary
    const summary = this.generateSummary(resources, deletions);

    return { files, summary, warnings };
  }

  /**
   * Generate main.tf content
   */
  private generateMainTf(
    resources: TerraformResource[],
    deletions: FileDiff[],
    options: ExportOptions
  ): string {
    const lines: string[] = [this.generateHeader(options)];

    // Terraform block
    lines.push(`terraform {`);
    lines.push(`  required_version = ">= 1.0"`);
    lines.push(`  required_providers {`);
    lines.push(`    local = {`);
    lines.push(`      source  = "hashicorp/local"`);
    lines.push(`      version = "~> 2.0"`);
    lines.push(`    }`);
    if (options.provider === 'gcp') {
      lines.push(`    google = {`);
      lines.push(`      source  = "hashicorp/google"`);
      lines.push(`      version = "~> 5.0"`);
      lines.push(`    }`);
    }
    if (options.provider === 'aws') {
      lines.push(`    aws = {`);
      lines.push(`      source  = "hashicorp/aws"`);
      lines.push(`      version = "~> 5.0"`);
      lines.push(`    }`);
    }
    lines.push(`  }`);
    lines.push(`}`);
    lines.push(``);

    // Provider block if specified
    if (options.provider) {
      lines.push(this.generateProviderBlock(options.provider));
      lines.push(``);
    }

    // Local tags
    if (options.tags && Object.keys(options.tags).length > 0) {
      lines.push(`locals {`);
      lines.push(`  common_tags = {`);
      for (const [key, value] of Object.entries(options.tags)) {
        lines.push(`    ${key} = "${value}"`);
      }
      lines.push(`  }`);
      lines.push(`}`);
      lines.push(``);
    }

    // Resources
    for (const resource of resources) {
      lines.push(this.resourceToHcl(resource, options));
      lines.push(``);
    }

    // Handle deletions with null_resource (for documentation)
    if (deletions.length > 0 && options.includeComments) {
      lines.push(`# The following files were deleted in the sandbox:`);
      for (const del of deletions) {
        lines.push(`# - ${del.path}`);
      }
      lines.push(``);
    }

    return lines.join('\n');
  }

  /**
   * Convert resource to HCL
   */
  private resourceToHcl(resource: TerraformResource, options: ExportOptions): string {
    const lines: string[] = [];

    if (options.includeComments) {
      lines.push(`# Resource generated from sandbox diff`);
    }

    lines.push(`resource "${resource.type}" "${resource.name}" {`);

    // Attributes
    for (const [key, value] of Object.entries(resource.attributes)) {
      lines.push(`  ${key} = ${this.toHclValue(value)}`);
    }

    // Meta-arguments
    if (resource.meta) {
      if (resource.meta.dependsOn) {
        lines.push(``);
        lines.push(`  depends_on = [`);
        for (const dep of resource.meta.dependsOn) {
          lines.push(`    ${dep},`);
        }
        lines.push(`  ]`);
      }

      if (resource.meta.lifecycle) {
        lines.push(``);
        lines.push(`  lifecycle {`);
        for (const [key, value] of Object.entries(resource.meta.lifecycle)) {
          lines.push(`    ${key} = ${this.toHclValue(value)}`);
        }
        lines.push(`  }`);
      }
    }

    lines.push(`}`);

    return lines.join('\n');
  }

  /**
   * Convert value to HCL representation
   */
  private toHclValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'string') {
      // Check if it's a variable reference
      if (value.startsWith('var.') || value.startsWith('local.') || value.startsWith('data.')) {
        return value;
      }

      // Check for multiline content
      if (value.includes('\n')) {
        return `<<-EOT\n${value}\nEOT`;
      }

      // Escape and quote
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '[]';
      }
      const items = value.map((v) => this.toHclValue(v));
      return `[\n    ${items.join(',\n    ')}\n  ]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        return '{}';
      }
      const items = entries.map(([k, v]) => `${k} = ${this.toHclValue(v)}`);
      return `{\n    ${items.join('\n    ')}\n  }`;
    }

    return `"${String(value)}"`;
  }

  /**
   * Generate provider block
   */
  private generateProviderBlock(provider: string): string {
    switch (provider) {
      case 'gcp':
        return `provider "google" {
  project = var.project_id
  region  = var.region
}`;

      case 'aws':
        return `provider "aws" {
  region = var.region
}`;

      case 'azure':
        return `provider "azurerm" {
  features {}
}`;

      default:
        return '';
    }
  }

  /**
   * Generate variables.tf
   */
  private generateVariablesTf(options: ExportOptions): string {
    const lines: string[] = [this.generateHeader(options)];

    lines.push(`variable "prefix" {`);
    lines.push(`  description = "Prefix for resource names"`);
    lines.push(`  type        = string`);
    lines.push(`  default     = "${options.prefix ?? 'sandbox'}"`);
    lines.push(`}`);
    lines.push(``);

    if (options.provider === 'gcp') {
      lines.push(`variable "project_id" {`);
      lines.push(`  description = "GCP project ID"`);
      lines.push(`  type        = string`);
      lines.push(`}`);
      lines.push(``);
      lines.push(`variable "region" {`);
      lines.push(`  description = "GCP region"`);
      lines.push(`  type        = string`);
      lines.push(`  default     = "us-central1"`);
      lines.push(`}`);
    }

    if (options.provider === 'aws') {
      lines.push(`variable "region" {`);
      lines.push(`  description = "AWS region"`);
      lines.push(`  type        = string`);
      lines.push(`  default     = "us-east-1"`);
      lines.push(`}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate outputs.tf
   */
  private generateOutputsTf(resources: TerraformResource[], options: ExportOptions): string {
    const lines: string[] = [this.generateHeader(options)];

    lines.push(`output "files_created" {`);
    lines.push(`  description = "List of files created by this configuration"`);
    lines.push(`  value = [`);
    for (const resource of resources) {
      if (resource.type === 'local_file' || resource.type === 'local_sensitive_file') {
        lines.push(`    ${resource.type}.${resource.name}.filename,`);
      }
    }
    lines.push(`  ]`);
    lines.push(`}`);
    lines.push(``);

    lines.push(`output "resource_count" {`);
    lines.push(`  description = "Number of resources managed"`);
    lines.push(`  value       = ${resources.length}`);
    lines.push(`}`);

    return lines.join('\n');
  }

  /**
   * Generate terraform.tfvars
   */
  private generateTfvars(options: ExportOptions): string {
    const lines: string[] = [
      `# Terraform Variables`,
      `# Update these values for your environment`,
      ``,
      `prefix = "${options.prefix ?? 'sandbox'}"`,
    ];

    if (options.provider === 'gcp') {
      lines.push(`project_id = "your-gcp-project-id"`);
      lines.push(`region     = "us-central1"`);
    }

    if (options.provider === 'aws') {
      lines.push(`region = "us-east-1"`);
    }

    return lines.join('\n');
  }

  /**
   * Generate export summary
   */
  private generateSummary(resources: TerraformResource[], deletions: FileDiff[]): ExportSummary {
    const resourcesByType: Record<string, number> = {};

    for (const resource of resources) {
      resourcesByType[resource.type] = (resourcesByType[resource.type] ?? 0) + 1;
    }

    return {
      resourceCount: resources.length,
      resourcesByType,
      changes: {
        add: resources.length,
        change: 0, // Terraform doesn't track modifications as separate from additions
        destroy: deletions.length,
      },
    };
  }

  /**
   * Validate Terraform configuration
   */
  async validate(result: ExportResult): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    for (const file of result.files) {
      // Basic HCL validation
      if (file.path.endsWith('.tf')) {
        // Check for unclosed braces
        const openBraces = (file.content.match(/{/g) ?? []).length;
        const closeBraces = (file.content.match(/}/g) ?? []).length;
        if (openBraces !== closeBraces) {
          errors.push({
            file: file.path,
            message: `Unbalanced braces: ${openBraces} open, ${closeBraces} close`,
            severity: 'error',
          });
        }

        // Check for common issues
        if (file.content.includes('TODO')) {
          warnings.push({
            file: file.path,
            message: 'File contains TODO comments',
            severity: 'warning',
          });
        }

        // Check for hardcoded sensitive values
        if (file.content.includes('password') || file.content.includes('secret')) {
          warnings.push({
            file: file.path,
            message: 'File may contain sensitive values - consider using variables',
            severity: 'warning',
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
