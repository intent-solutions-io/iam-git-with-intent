/**
 * Integration Tests for Sandbox System
 *
 * Tests the end-to-end flow from sandbox execution to IaC export.
 * These tests use mocks to simulate Docker/KVM without requiring actual infrastructure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileDiff, SandboxConfig, Sandbox, ExecResult, SandboxType } from '../types.js';
import { TerraformExporter } from '../export/terraform.js';

// Mock sandbox for testing
class MockSandbox implements Sandbox {
  readonly id: string;
  readonly type = 'docker' as const;
  readonly createdAt: number;
  readonly config: SandboxConfig;
  private _status: 'running' | 'paused' | 'stopped' | 'destroyed' = 'running';
  private files: Map<string, string> = new Map();
  private commands: string[] = [];

  constructor(id: string, config: SandboxConfig) {
    this.id = id;
    this.config = config;
    this.createdAt = Date.now();
  }

  get status() {
    return this._status;
  }

  async execute(command: string): Promise<ExecResult> {
    this.commands.push(command);
    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 10,
    };
  }

  async executeMany(commands: string[]): Promise<ExecResult[]> {
    return Promise.all(commands.map(cmd => this.execute(cmd)));
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    this.files.set(path, typeof content === 'string' ? content : content.toString());
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async readFileBuffer(path: string): Promise<Buffer> {
    return Buffer.from(await this.readFile(path));
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async listFiles(): Promise<string[]> {
    return Array.from(this.files.keys());
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async copyIn(): Promise<void> {}
  async copyOut(): Promise<void> {}

  async snapshot(): Promise<string> {
    return `snap-${this.id}-${Date.now()}` as any;
  }

  async restore(): Promise<void> {}

  async diff(): Promise<FileDiff[]> {
    return Array.from(this.files.entries()).map(([path, content]) => ({
      path,
      type: 'added' as const,
      newContent: content,
    }));
  }

  async listSnapshots() {
    return [];
  }

  async deleteSnapshot(): Promise<void> {}

  async exportArtifacts() {
    return [];
  }

  async pause(): Promise<void> {
    this._status = 'paused';
  }

  async resume(): Promise<void> {
    this._status = 'running';
  }

  async destroy(): Promise<void> {
    this._status = 'destroyed';
  }

  async getLogs(): Promise<string> {
    return this.commands.join('\n');
  }

  async getStats() {
    return {
      cpuPercent: 5,
      memoryMb: 256,
      memoryLimitMb: 1024,
      diskMb: 100,
      networkRxBytes: 0,
      networkTxBytes: 0,
      processCount: 2,
      uptimeSeconds: 60,
    };
  }

  // Test helpers
  getExecutedCommands(): string[] {
    return [...this.commands];
  }

  getStoredFiles(): Map<string, string> {
    return new Map(this.files);
  }
}

describe('Sandbox → Export Integration', () => {
  let mockSandbox: MockSandbox;
  let exporter: TerraformExporter;

  beforeEach(() => {
    mockSandbox = new MockSandbox('test-sandbox-1', {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
    });
    exporter = new TerraformExporter();
  });

  describe('File operations → Diff → Export flow', () => {
    it('writes files, generates diff, and exports to Terraform', async () => {
      // Step 1: Write files in sandbox
      await mockSandbox.writeFile('/workspace/app/main.ts', 'export const main = () => {}');
      await mockSandbox.writeFile('/workspace/app/config.json', '{"port": 3000}');
      await mockSandbox.writeFile('/workspace/README.md', '# My App');

      // Step 2: Generate diff
      const diffs = await mockSandbox.diff();

      expect(diffs).toHaveLength(3);
      expect(diffs.every(d => d.type === 'added')).toBe(true);

      // Step 3: Export to Terraform
      const result = await exporter.export(diffs);

      expect(result.summary.resourceCount).toBe(3);
      expect(result.files.some(f => f.path === 'main.tf')).toBe(true);

      // Validate generated Terraform
      const validation = await exporter.validate(result);
      expect(validation.valid).toBe(true);
    });

    it('handles infrastructure config files specially', async () => {
      // Write nginx config
      await mockSandbox.writeFile('/etc/nginx/nginx.conf', `
server {
  listen 80;
  server_name example.com;
  location / {
    proxy_pass http://localhost:3000;
  }
}
      `.trim());

      const diffs = await mockSandbox.diff();
      const result = await exporter.export(diffs);

      // Should be exported as a resource
      expect(result.summary.resourceCount).toBeGreaterThan(0);

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf?.content).toContain('nginx');
    });
  });

  describe('Snapshot → Restore → Diff flow', () => {
    it('creates snapshots and tracks changes', async () => {
      // Initial state
      await mockSandbox.writeFile('/workspace/initial.txt', 'initial content');

      // Create snapshot
      const snapshotId = await mockSandbox.snapshot();
      expect(snapshotId).toMatch(/^snap-/);

      // Make more changes
      await mockSandbox.writeFile('/workspace/new-file.txt', 'new content');

      // Get diff (in real implementation, this would be diff since snapshot)
      const diffs = await mockSandbox.diff();

      expect(diffs.length).toBeGreaterThan(0);
    });
  });

  describe('Command execution tracking', () => {
    it('tracks executed commands for audit', async () => {
      await mockSandbox.execute('apt-get update');
      await mockSandbox.execute('apt-get install -y nginx');
      await mockSandbox.execute('systemctl enable nginx');

      const logs = await mockSandbox.getLogs();
      const commands = mockSandbox.getExecutedCommands();

      expect(commands).toHaveLength(3);
      expect(logs).toContain('apt-get update');
      expect(logs).toContain('nginx');
    });

    it('executes multiple commands sequentially', async () => {
      const results = await mockSandbox.executeMany([
        'mkdir -p /workspace/app',
        'touch /workspace/app/index.ts',
        'chmod 755 /workspace/app',
      ]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.exitCode === 0)).toBe(true);
    });
  });

  describe('Resource lifecycle', () => {
    it('handles pause and resume', async () => {
      expect(mockSandbox.status).toBe('running');

      await mockSandbox.pause();
      expect(mockSandbox.status).toBe('paused');

      await mockSandbox.resume();
      expect(mockSandbox.status).toBe('running');
    });

    it('handles destroy', async () => {
      expect(mockSandbox.status).toBe('running');

      await mockSandbox.destroy();
      expect(mockSandbox.status).toBe('destroyed');
    });

    it('provides resource stats', async () => {
      const stats = await mockSandbox.getStats();

      expect(stats.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(stats.memoryMb).toBeGreaterThan(0);
      expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});

// Note: SandboxRegistry tests are skipped in unit tests because they require
// actual Docker/KVM dependencies. They are tested in E2E tests.

describe('Export Format Selection', () => {
  it('uses terraform exporter by default', async () => {
    const exporter = new TerraformExporter();
    expect(exporter.format).toBe('terraform');
  });

  it('generates valid HCL syntax', async () => {
    const exporter = new TerraformExporter();
    const diffs: FileDiff[] = [
      {
        path: '/workspace/test.txt',
        type: 'added',
        newContent: 'test content',
      },
    ];

    const result = await exporter.export(diffs);
    const validation = await exporter.validate(result);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

describe('Error Handling', () => {
  let mockSandbox: MockSandbox;

  beforeEach(() => {
    mockSandbox = new MockSandbox('error-test', {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
    });
  });

  it('handles file not found errors', async () => {
    await expect(mockSandbox.readFile('/nonexistent/file.txt'))
      .rejects
      .toThrow('File not found');
  });

  it('handles empty diff gracefully', async () => {
    const diffs = await mockSandbox.diff();
    expect(diffs).toEqual([]);

    const exporter = new TerraformExporter();
    const result = await exporter.export(diffs);

    expect(result.summary.resourceCount).toBe(0);
    expect(result.files).toBeDefined();
  });
});
