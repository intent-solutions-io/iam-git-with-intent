/**
 * Tests for Sandbox Providers
 *
 * These tests verify provider initialization, configuration validation,
 * and sandbox management functionality using base class and mock implementations.
 * This avoids requiring actual Docker/KVM to be installed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseSandboxProvider, computeFileDiff } from '../providers/base.js';
import type { SandboxConfig, Sandbox, SandboxType, ProviderHealth } from '../types.js';

describe('BaseSandboxProvider', () => {
  describe('generateSandboxId', () => {
    class TestProvider extends BaseSandboxProvider {
      readonly name = 'test';
      readonly type: SandboxType = 'docker';

      async create(config: SandboxConfig): Promise<Sandbox> {
        const id = this.generateSandboxId();
        return {
          id,
          type: 'docker',
          createdAt: Date.now(),
          config,
          status: 'running',
          execute: vi.fn(),
          executeMany: vi.fn(),
          writeFile: vi.fn(),
          readFile: vi.fn(),
          readFileBuffer: vi.fn(),
          fileExists: vi.fn(),
          listFiles: vi.fn(),
          deleteFile: vi.fn(),
          copyIn: vi.fn(),
          copyOut: vi.fn(),
          snapshot: vi.fn(),
          restore: vi.fn(),
          diff: vi.fn(),
          listSnapshots: vi.fn(),
          deleteSnapshot: vi.fn(),
          exportArtifacts: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          destroy: vi.fn(),
          getLogs: vi.fn(),
          getStats: vi.fn(),
        } as any;
      }

      async healthCheck(): Promise<ProviderHealth> {
        return {
          healthy: true,
          message: 'Test provider healthy',
          checkedAt: Date.now(),
        };
      }
    }

    it('generates unique sandbox IDs', () => {
      const provider = new TestProvider();
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const id = (provider as any).generateSandboxId();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });

    it('generates IDs with correct prefix', () => {
      const provider = new TestProvider();
      const id = (provider as any).generateSandboxId();
      expect(id).toMatch(/^sbx-docker-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('computeFileDiff', () => {
    it('detects added files', () => {
      const diff = computeFileDiff(
        null,
        'export const foo = "bar";',
        '/workspace/new-file.ts'
      );

      expect(diff).not.toBeNull();
      expect(diff!.type).toBe('added');
      expect(diff!.path).toBe('/workspace/new-file.ts');
      expect(diff!.newContent).toBe('export const foo = "bar";');
    });

    it('detects deleted files', () => {
      const diff = computeFileDiff(
        'const old = true;',
        null,
        '/workspace/old-file.ts'
      );

      expect(diff).not.toBeNull();
      expect(diff!.type).toBe('deleted');
      expect(diff!.path).toBe('/workspace/old-file.ts');
      expect(diff!.oldContent).toBe('const old = true;');
    });

    it('detects modified files', () => {
      const diff = computeFileDiff(
        'const version = 1;',
        'const version = 2;',
        '/workspace/file.ts'
      );

      expect(diff).not.toBeNull();
      expect(diff!.type).toBe('modified');
      expect(diff!.path).toBe('/workspace/file.ts');
      expect(diff!.oldContent).toBe('const version = 1;');
      expect(diff!.newContent).toBe('const version = 2;');
    });

    it('detects renamed files', () => {
      const diff = computeFileDiff(
        'content',
        'content',
        '/workspace/new-name.ts',
        '/workspace/old-name.ts'
      );

      expect(diff).not.toBeNull();
      expect(diff!.type).toBe('renamed');
      expect(diff!.path).toBe('/workspace/new-name.ts');
      expect(diff!.oldPath).toBe('/workspace/old-name.ts');
    });
  });
});

describe('Provider Event Handling', () => {
  class TestProvider extends BaseSandboxProvider {
    readonly name = 'test';
    readonly type: SandboxType = 'docker';

    async create(config: SandboxConfig): Promise<Sandbox> {
      throw new Error('Not implemented for test');
    }

    async healthCheck(): Promise<ProviderHealth> {
      return { healthy: true, message: 'OK', checkedAt: Date.now() };
    }

    // Expose protected method for testing
    public testEmitEvent(event: any) {
      this.emitEvent(event);
    }
  }

  it('emits events to listeners by event type', () => {
    const provider = new TestProvider();
    const events: any[] = [];

    provider.on('create', (event) => {
      events.push(event);
    });

    provider.testEmitEvent({
      type: 'create',
      sandboxId: 'test-123',
      timestamp: Date.now(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('create');
    expect(events[0].sandboxId).toBe('test-123');
  });

  it('emits events to "all" listeners', () => {
    const provider = new TestProvider();
    const events: any[] = [];

    provider.on('all', (event) => {
      events.push(event);
    });

    provider.testEmitEvent({ type: 'create', sandboxId: 'test-1', timestamp: Date.now() });
    provider.testEmitEvent({ type: 'destroy', sandboxId: 'test-2', timestamp: Date.now() });

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('create');
    expect(events[1].type).toBe('destroy');
  });

  it('allows removing event listeners', () => {
    const provider = new TestProvider();
    const events: any[] = [];

    const handler = (event: any) => {
      events.push(event);
    };

    provider.on('create', handler);
    provider.testEmitEvent({ type: 'create', sandboxId: 'test-1', timestamp: Date.now() });

    provider.off('create', handler);
    provider.testEmitEvent({ type: 'create', sandboxId: 'test-2', timestamp: Date.now() });

    expect(events).toHaveLength(1);
    expect(events[0].sandboxId).toBe('test-1');
  });
});

describe('Provider Sandbox Management', () => {
  class TrackingProvider extends BaseSandboxProvider {
    readonly name = 'tracking';
    readonly type: SandboxType = 'docker';

    async create(config: SandboxConfig): Promise<Sandbox> {
      const id = this.generateSandboxId();
      const sandbox = {
        id,
        type: 'docker' as SandboxType,
        createdAt: Date.now(),
        config,
        status: 'running' as const,
        execute: vi.fn(),
        executeMany: vi.fn(),
        writeFile: vi.fn(),
        readFile: vi.fn(),
        readFileBuffer: vi.fn(),
        fileExists: vi.fn(),
        listFiles: vi.fn(),
        deleteFile: vi.fn(),
        copyIn: vi.fn(),
        copyOut: vi.fn(),
        snapshot: vi.fn(),
        restore: vi.fn(),
        diff: vi.fn(),
        listSnapshots: vi.fn(),
        deleteSnapshot: vi.fn(),
        exportArtifacts: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        destroy: vi.fn().mockResolvedValue(undefined),
        getLogs: vi.fn(),
        getStats: vi.fn(),
      } as unknown as Sandbox;

      this.registerSandbox(sandbox);
      return sandbox;
    }

    async healthCheck(): Promise<ProviderHealth> {
      return { healthy: true, message: 'OK', checkedAt: Date.now() };
    }
  }

  it('registers created sandboxes', async () => {
    const provider = new TrackingProvider();
    const config: SandboxConfig = {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
    };

    const sandbox = await provider.create(config);
    const retrieved = await provider.get(sandbox.id);

    expect(retrieved).toBe(sandbox);
  });

  it('lists all sandboxes', async () => {
    const provider = new TrackingProvider();
    const config: SandboxConfig = {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
    };

    await provider.create(config);
    await provider.create(config);
    await provider.create(config);

    const sandboxes = await provider.list();
    expect(sandboxes).toHaveLength(3);
  });

  it('destroys sandboxes', async () => {
    const provider = new TrackingProvider();
    const config: SandboxConfig = {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
    };

    const sandbox = await provider.create(config);
    expect(await provider.get(sandbox.id)).toBeDefined();

    await provider.destroy(sandbox.id);
    expect(await provider.get(sandbox.id)).toBeNull();
  });

  it('emits destroy event when destroying sandbox', async () => {
    const provider = new TrackingProvider();
    const events: any[] = [];

    provider.on('destroy', (event) => {
      events.push(event);
    });

    const config: SandboxConfig = {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
    };

    const sandbox = await provider.create(config);
    await provider.destroy(sandbox.id);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('destroy');
    expect(events[0].sandboxId).toBe(sandbox.id);
  });
});

describe('Provider Configuration Validation', () => {
  class ValidatingProvider extends BaseSandboxProvider {
    readonly name = 'validating';
    readonly type: SandboxType = 'docker';

    async create(config: SandboxConfig): Promise<Sandbox> {
      // Validate type matches
      if (config.type !== this.type) {
        throw new Error(`${this.name} provider cannot create ${config.type} sandbox`);
      }

      // Validate baseImage
      if (!config.baseImage || config.baseImage.trim() === '') {
        throw new Error('baseImage is required');
      }

      // Create mock sandbox
      return {
        id: this.generateSandboxId(),
        type: this.type,
        createdAt: Date.now(),
        config,
        status: 'running',
      } as unknown as Sandbox;
    }

    async healthCheck(): Promise<ProviderHealth> {
      return { healthy: true, message: 'OK', checkedAt: Date.now() };
    }
  }

  it('rejects mismatched sandbox types', async () => {
    const provider = new ValidatingProvider();
    const config: SandboxConfig = {
      type: 'kvm',
      baseImage: 'ubuntu:22.04',
    };

    await expect(provider.create(config)).rejects.toThrow(
      'validating provider cannot create kvm sandbox'
    );
  });

  it('rejects empty baseImage', async () => {
    const provider = new ValidatingProvider();
    const config: SandboxConfig = {
      type: 'docker',
      baseImage: '',
    };

    await expect(provider.create(config)).rejects.toThrow('baseImage is required');
  });

  it('accepts valid configuration', async () => {
    const provider = new ValidatingProvider();
    const config: SandboxConfig = {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
      resources: {
        cpuCores: 2,
        memoryMb: 1024,
      },
    };

    const sandbox = await provider.create(config);
    expect(sandbox).toBeDefined();
    expect(sandbox.config).toBe(config);
  });
});

describe('Provider Filtering', () => {
  class FilteringProvider extends BaseSandboxProvider {
    readonly name = 'filtering';
    readonly type: SandboxType = 'docker';
    private sandboxCounter = 0;

    async create(config: SandboxConfig): Promise<Sandbox> {
      this.sandboxCounter++;
      const id = `sbx-test-${this.sandboxCounter}`;
      const sandbox = {
        id,
        type: 'docker' as SandboxType,
        createdAt: Date.now() - (this.sandboxCounter * 1000),
        config,
        status: this.sandboxCounter % 2 === 0 ? 'stopped' : 'running',
      } as unknown as Sandbox;

      this.registerSandbox(sandbox);
      return sandbox;
    }

    async healthCheck(): Promise<ProviderHealth> {
      return { healthy: true, message: 'OK', checkedAt: Date.now() };
    }
  }

  it('filters by status', async () => {
    const provider = new FilteringProvider();
    const config: SandboxConfig = {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
    };

    await provider.create(config); // running
    await provider.create(config); // stopped
    await provider.create(config); // running
    await provider.create(config); // stopped

    const running = await provider.list({ status: ['running'] });
    const stopped = await provider.list({ status: ['stopped'] });

    expect(running).toHaveLength(2);
    expect(stopped).toHaveLength(2);
  });

  it('filters by labels', async () => {
    const provider = new FilteringProvider();

    await provider.create({
      type: 'docker',
      baseImage: 'ubuntu:22.04',
      labels: { env: 'dev' },
    });

    await provider.create({
      type: 'docker',
      baseImage: 'ubuntu:22.04',
      labels: { env: 'prod' },
    });

    const devSandboxes = await provider.list({ labels: { env: 'dev' } });
    expect(devSandboxes).toHaveLength(1);
  });

  it('applies limit', async () => {
    const provider = new FilteringProvider();
    const config: SandboxConfig = {
      type: 'docker',
      baseImage: 'ubuntu:22.04',
    };

    await provider.create(config);
    await provider.create(config);
    await provider.create(config);

    const limited = await provider.list({ limit: 2 });
    expect(limited).toHaveLength(2);
  });
});
