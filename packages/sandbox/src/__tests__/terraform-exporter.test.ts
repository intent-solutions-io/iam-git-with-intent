/**
 * Tests for Terraform/OpenTofu Exporter
 *
 * Verifies that sandbox diffs are correctly converted to Terraform/OpenTofu HCL.
 */

import { describe, it, expect } from 'vitest';
import { TerraformExporter } from '../export/terraform.js';
import type { FileDiff } from '../types.js';

describe('TerraformExporter', () => {
  const exporter = new TerraformExporter();

  describe('basic properties', () => {
    it('has correct format', () => {
      expect(exporter.format).toBe('terraform');
    });

    it('has display name', () => {
      expect(exporter.displayName).toBe('Terraform/OpenTofu');
    });
  });

  describe('export', () => {
    it('exports empty diffs', async () => {
      const result = await exporter.export([]);

      expect(result.files).toBeDefined();
      expect(result.files.length).toBeGreaterThanOrEqual(1);
      expect(result.summary.resourceCount).toBe(0);
    });

    it('exports added file as local_file resource', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/config.json',
          type: 'added',
          newContent: '{"key": "value"}',
          size: 16,
        },
      ];

      const result = await exporter.export(diffs);

      expect(result.summary.resourceCount).toBe(1);

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf).toBeDefined();
      expect(mainTf?.content).toContain('resource');
      expect(mainTf?.content).toContain('local_file');
    });

    it('exports multiple files', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/app.ts',
          type: 'added',
          newContent: 'export const app = true;',
        },
        {
          path: '/workspace/config.yaml',
          type: 'added',
          newContent: 'key: value',
        },
        {
          path: '/workspace/README.md',
          type: 'modified',
          oldContent: '# Old',
          newContent: '# New',
        },
      ];

      const result = await exporter.export(diffs);

      expect(result.summary.resourceCount).toBe(3);
    });

    it('tracks deleted files in summary', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/old-file.ts',
          type: 'deleted',
          oldContent: 'const old = true;',
        },
      ];

      const result = await exporter.export(diffs);

      expect(result.summary.changes.destroy).toBe(1);

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf?.content).toContain('deleted');
    });

    it('skips binary files with warning', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/image.png',
          type: 'added',
          isBinary: true,
          size: 1024,
        },
      ];

      const result = await exporter.export(diffs);

      expect(result.warnings).toContain('Skipping binary file: /workspace/image.png');
      expect(result.summary.resourceCount).toBe(0);
    });
  });

  describe('export options', () => {
    it('applies custom prefix', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ];

      const result = await exporter.export(diffs, { prefix: 'myapp' });

      const variablesTf = result.files.find(f => f.path === 'variables.tf');
      expect(variablesTf?.content).toContain('default     = "myapp"');
    });

    it('uses custom output directory', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ];

      const result = await exporter.export(diffs, { outputDir: 'terraform' });

      expect(result.files.every(f => f.path.startsWith('terraform/'))).toBe(true);
    });

    it('generates GCP provider config', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ];

      const result = await exporter.export(diffs, { provider: 'gcp' });

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf?.content).toContain('google');
      expect(mainTf?.content).toContain('provider "google"');

      const variablesTf = result.files.find(f => f.path === 'variables.tf');
      expect(variablesTf?.content).toContain('project_id');
      expect(variablesTf?.content).toContain('region');
    });

    it('generates AWS provider config', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ];

      const result = await exporter.export(diffs, { provider: 'aws' });

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf?.content).toContain('aws');
      expect(mainTf?.content).toContain('provider "aws"');
    });

    it('includes common tags when provided', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ];

      const result = await exporter.export(diffs, {
        tags: {
          environment: 'dev',
          team: 'platform',
        },
      });

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf?.content).toContain('locals');
      expect(mainTf?.content).toContain('common_tags');
      expect(mainTf?.content).toContain('environment = "dev"');
      expect(mainTf?.content).toContain('team = "platform"');
    });

    it('can disable comments', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ];

      const result = await exporter.export(diffs, { includeComments: false });

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf?.content).not.toContain('# Resource generated from sandbox diff');
    });

    it('can disable variables generation', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ];

      const result = await exporter.export(diffs, { generateVariables: false });

      const variablesTf = result.files.find(f => f.path === 'variables.tf');
      const tfvars = result.files.find(f => f.path === 'terraform.tfvars');

      expect(variablesTf).toBeUndefined();
      expect(tfvars).toBeUndefined();
    });
  });

  describe('generated file structure', () => {
    it('generates main.tf with terraform block', async () => {
      const result = await exporter.export([]);

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf).toBeDefined();
      expect(mainTf?.content).toContain('terraform {');
      expect(mainTf?.content).toContain('required_version = ">= 1.0"');
      expect(mainTf?.content).toContain('required_providers');
    });

    it('generates variables.tf with prefix variable', async () => {
      const result = await exporter.export([]);

      const variablesTf = result.files.find(f => f.path === 'variables.tf');
      expect(variablesTf).toBeDefined();
      expect(variablesTf?.content).toContain('variable "prefix"');
      expect(variablesTf?.content).toContain('type        = string');
    });

    it('generates outputs.tf', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ];

      const result = await exporter.export(diffs);

      const outputsTf = result.files.find(f => f.path === 'outputs.tf');
      expect(outputsTf).toBeDefined();
      expect(outputsTf?.content).toContain('output "files_created"');
      expect(outputsTf?.content).toContain('output "resource_count"');
    });

    it('generates terraform.tfvars', async () => {
      const result = await exporter.export([]);

      const tfvars = result.files.find(f => f.path === 'terraform.tfvars');
      expect(tfvars).toBeDefined();
      expect(tfvars?.content).toContain('prefix = ');
    });
  });

  describe('HCL value conversion', () => {
    it('handles multiline content with heredoc', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/script.sh',
          type: 'added',
          newContent: '#!/bin/bash\necho "Hello"\nexit 0',
        },
      ];

      const result = await exporter.export(diffs);

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf?.content).toContain('<<-EOT');
      expect(mainTf?.content).toContain('EOT');
    });
  });

  describe('validate', () => {
    it('validates balanced braces', async () => {
      const result = await exporter.export([
        {
          path: '/workspace/file.txt',
          type: 'added',
          newContent: 'content',
        },
      ]);

      const validation = await exporter.validate(result);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('warns about TODO comments', async () => {
      const result = {
        files: [
          {
            path: 'main.tf',
            content: '# TODO: fix this\nresource "local_file" "test" {}',
            type: 'main' as const,
          },
        ],
        summary: {
          resourceCount: 1,
          resourcesByType: { local_file: 1 },
          changes: { add: 1, change: 0, destroy: 0 },
        },
        warnings: [],
      };

      const validation = await exporter.validate(result);
      expect(validation.warnings.some(w => w.message.includes('TODO'))).toBe(true);
    });

    it('warns about potential sensitive values', async () => {
      const result = {
        files: [
          {
            path: 'main.tf',
            content: 'resource "local_file" "test" { content = "password123" }',
            type: 'main' as const,
          },
        ],
        summary: {
          resourceCount: 1,
          resourcesByType: { local_file: 1 },
          changes: { add: 1, change: 0, destroy: 0 },
        },
        warnings: [],
      };

      const validation = await exporter.validate(result);
      expect(validation.warnings.some(w => w.message.includes('sensitive'))).toBe(true);
    });

    it('detects unbalanced braces', async () => {
      const result = {
        files: [
          {
            path: 'main.tf',
            content: 'resource "local_file" "test" { content = "test"',
            type: 'main' as const,
          },
        ],
        summary: {
          resourceCount: 1,
          resourcesByType: { local_file: 1 },
          changes: { add: 1, change: 0, destroy: 0 },
        },
        warnings: [],
      };

      const validation = await exporter.validate(result);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.message.includes('braces'))).toBe(true);
    });
  });

  describe('resource type detection', () => {
    it('detects executable files', async () => {
      const diffs: FileDiff[] = [
        {
          path: '/workspace/script.sh',
          type: 'added',
          newContent: '#!/bin/bash\necho "Hello"',
          mode: '0755',
        },
      ];

      const result = await exporter.export(diffs);

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf?.content).toContain('file_permission');
    });
  });

  describe('summary generation', () => {
    it('counts resources by type', async () => {
      const diffs: FileDiff[] = [
        { path: '/workspace/a.txt', type: 'added', newContent: 'a' },
        { path: '/workspace/b.txt', type: 'added', newContent: 'b' },
        { path: '/workspace/c.json', type: 'added', newContent: '{}' },
      ];

      const result = await exporter.export(diffs);

      expect(result.summary.resourceCount).toBe(3);
      expect(result.summary.resourcesByType).toBeDefined();
    });

    it('tracks add/change/destroy counts', async () => {
      const diffs: FileDiff[] = [
        { path: '/workspace/new.txt', type: 'added', newContent: 'new' },
        { path: '/workspace/mod.txt', type: 'modified', oldContent: 'old', newContent: 'new' },
        { path: '/workspace/del.txt', type: 'deleted', oldContent: 'gone' },
      ];

      const result = await exporter.export(diffs);

      expect(result.summary.changes.add).toBe(2); // added + modified
      expect(result.summary.changes.destroy).toBe(1);
    });
  });
});
