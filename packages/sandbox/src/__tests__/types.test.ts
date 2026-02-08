/**
 * Tests for Sandbox Types
 */

import { describe, it, expect } from 'vitest';
import {
  SandboxConfigSchema,
  ResourceLimitsSchema,
  NetworkConfigSchema,
  FileDiffSchema,
  ExecResultSchema,
  createSnapshotId,
  type SandboxConfig,
  type FileDiff,
  type ExecResult,
} from '../types.js';

describe('Sandbox Types', () => {
  describe('createSnapshotId', () => {
    it('creates a branded snapshot ID', () => {
      const id = createSnapshotId('snap-123');
      expect(id).toBe('snap-123');
      // TypeScript branded type ensures type safety at compile time
    });
  });

  describe('SandboxConfigSchema', () => {
    it('validates a valid Docker config', () => {
      const config: SandboxConfig = {
        type: 'docker',
        baseImage: 'ubuntu:22.04',
        workDir: '/workspace',
        resources: {
          cpuCores: 2,
          memoryMb: 1024,
        },
        network: {
          enabled: true,
          mode: 'bridge',
        },
        env: {
          NODE_ENV: 'development',
        },
      };

      const result = SandboxConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('validates a KVM config with root access', () => {
      const config: SandboxConfig = {
        type: 'kvm',
        baseImage: '/var/lib/libvirt/images/ubuntu-22.04.qcow2',
        enableRoot: true,
        resources: {
          cpuCores: 4,
          memoryMb: 4096,
          diskMb: 20000,
        },
      };

      const result = SandboxConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('validates a Deno isolate config', () => {
      const config: SandboxConfig = {
        type: 'deno-isolate',
        baseImage: 'deno:latest',
        network: {
          enabled: true,
          allowedHosts: ['deno.land', 'npmjs.com'],
        },
        autoDestroyAfterMs: 300000,
      };

      const result = SandboxConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('rejects invalid sandbox type', () => {
      const config = {
        type: 'invalid',
        baseImage: 'ubuntu:22.04',
      };

      const result = SandboxConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects missing baseImage', () => {
      const config = {
        type: 'docker',
      };

      const result = SandboxConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects empty baseImage', () => {
      const config = {
        type: 'docker',
        baseImage: '',
      };

      const result = SandboxConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('ResourceLimitsSchema', () => {
    it('validates valid resource limits', () => {
      const limits = {
        cpuCores: 2.5,
        memoryMb: 2048,
        diskMb: 10000,
        networkMbps: 100,
        maxProcesses: 100,
        maxOpenFiles: 1024,
      };

      const result = ResourceLimitsSchema.safeParse(limits);
      expect(result.success).toBe(true);
    });

    it('rejects negative values', () => {
      const limits = {
        cpuCores: -1,
      };

      const result = ResourceLimitsSchema.safeParse(limits);
      expect(result.success).toBe(false);
    });

    it('accepts partial limits', () => {
      const limits = {
        memoryMb: 512,
      };

      const result = ResourceLimitsSchema.safeParse(limits);
      expect(result.success).toBe(true);
    });
  });

  describe('NetworkConfigSchema', () => {
    it('validates network disabled', () => {
      const config = {
        enabled: false,
      };

      const result = NetworkConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('validates network with allowed hosts', () => {
      const config = {
        enabled: true,
        mode: 'bridge' as const,
        allowedHosts: ['github.com', 'npmjs.org'],
        blockedHosts: ['malware.com'],
        dnsServers: ['8.8.8.8', '8.8.4.4'],
      };

      const result = NetworkConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('validates port mappings', () => {
      const config = {
        enabled: true,
        portMappings: {
          '8080': 80,
          '8443': 443,
        },
      };

      const result = NetworkConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('FileDiffSchema', () => {
    it('validates added file diff', () => {
      const diff: FileDiff = {
        path: '/workspace/new-file.ts',
        type: 'added',
        newContent: 'export const hello = "world";',
        size: 30,
      };

      const result = FileDiffSchema.safeParse(diff);
      expect(result.success).toBe(true);
    });

    it('validates modified file diff', () => {
      const diff: FileDiff = {
        path: '/etc/nginx/nginx.conf',
        type: 'modified',
        oldContent: 'old config',
        newContent: 'new config',
        mode: '0644',
      };

      const result = FileDiffSchema.safeParse(diff);
      expect(result.success).toBe(true);
    });

    it('validates deleted file diff', () => {
      const diff: FileDiff = {
        path: '/tmp/temp-file.txt',
        type: 'deleted',
        oldContent: 'temporary data',
      };

      const result = FileDiffSchema.safeParse(diff);
      expect(result.success).toBe(true);
    });

    it('validates renamed file diff', () => {
      const diff: FileDiff = {
        path: '/workspace/renamed.ts',
        type: 'renamed',
        oldPath: '/workspace/original.ts',
        oldContent: 'content',
        newContent: 'content',
      };

      const result = FileDiffSchema.safeParse(diff);
      expect(result.success).toBe(true);
    });

    it('validates binary file indication', () => {
      const diff: FileDiff = {
        path: '/workspace/image.png',
        type: 'added',
        isBinary: true,
        size: 1024,
      };

      const result = FileDiffSchema.safeParse(diff);
      expect(result.success).toBe(true);
    });
  });

  describe('ExecResultSchema', () => {
    it('validates successful execution', () => {
      const result: ExecResult = {
        exitCode: 0,
        stdout: 'Hello World',
        stderr: '',
        durationMs: 150,
      };

      const validated = ExecResultSchema.safeParse(result);
      expect(validated.success).toBe(true);
    });

    it('validates failed execution', () => {
      const result: ExecResult = {
        exitCode: 1,
        stdout: '',
        stderr: 'Command not found: foo',
        durationMs: 50,
      };

      const validated = ExecResultSchema.safeParse(result);
      expect(validated.success).toBe(true);
    });

    it('validates timed out execution', () => {
      const result: ExecResult = {
        exitCode: -1,
        stdout: 'partial output',
        stderr: '',
        durationMs: 60000,
        timedOut: true,
      };

      const validated = ExecResultSchema.safeParse(result);
      expect(validated.success).toBe(true);
    });

    it('validates execution killed by signal', () => {
      const result: ExecResult = {
        exitCode: -1,
        stdout: '',
        stderr: '',
        durationMs: 1000,
        signal: 'SIGKILL',
      };

      const validated = ExecResultSchema.safeParse(result);
      expect(validated.success).toBe(true);
    });
  });
});
