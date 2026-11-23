import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunEnvironment } from '@harnesys/contracts';
import { legacyWorkspaceFieldsOf } from '../../domain/fleet/pending-placement.ts';
import { type HostConfig, MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import {
  type ResolvedSourceLocation,
  type ResolveSourceLocationInput,
  SourceLocationPort,
} from '../../domain/source/source-location.port.ts';
import { type SourceRecord, SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { FakeLayout } from './work-executor.fixtures.ts';
import { prepareWorkerTarget } from './work-executor.util.ts';

const ORG = 'org-1';
const SOURCE_ID = 'src-1';
const THREAD_ID = 'thread-1';

const SOURCE: SourceRecord = {
  id: SOURCE_ID,
  orgId: ORG,
  name: 'source-1',
  description: null,
  distribution: { kind: 'host-bound', hostId: 'node-a' },
  uiVisibility: 'org',
  managed: false,
  vcs: null,
  availability: { hostIds: ['node-a'] },
  lspJson: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

class FakeMachineConfig extends MachineConfigPort {
  get(): HostConfig {
    return { id: 'node-a', name: 'node-a', listen: '127.0.0.1:0', token: '' };
  }

  set(): void {}
}

class FakeSources extends SourceRegistryPort {
  list(): SourceRecord[] {
    return [SOURCE];
  }

  findById(_orgId: string, sourceId: string): SourceRecord | null {
    return sourceId === SOURCE_ID ? SOURCE : null;
  }

  findBySourceId(): SourceRecord | null {
    return null;
  }

  findManagedWorkspace(): SourceRecord | null {
    return null;
  }

  insert(): void {}

  updateVisibility(): void {}

  updateName(): void {}

  updateDistribution(): void {}

  updateVcs(): void {}

  updateAvailability(): void {}

  updateLspJson(): void {}

  remove(): void {}
}

class FakeSourceLocation extends SourceLocationPort {
  resolve(input: ResolveSourceLocationInput): ResolvedSourceLocation {
    return {
      sourceId: input.sourceId,
      hostId: input.hostId,
      absoluteRoot:
        input.worktreeId !== undefined
          ? `/tmp/harnesys-test/org-1/sources/${input.sourceId}.worktrees/${input.worktreeId}`
          : `/tmp/harnesys-test/org-1/sources/${input.sourceId}`,
    };
  }
}

interface WorkerTargetOverride {
  environment?: RunEnvironment;
  directory?: string;
  sourceId?: string;
  worktreeId?: string;
}

function primaryCwd(override: WorkerTargetOverride): string {
  return prepareWorkerTarget({
    layout: new FakeLayout(),
    machineConfig: new FakeMachineConfig(),
    sources: new FakeSources(),
    sourceLocation: new FakeSourceLocation(),
    orgId: ORG,
    threadId: THREAD_ID,
    agent: { sharedSourceIds: [SOURCE_ID], config: {} },
    ...override,
  }).paths.cwd;
}

const SANDBOX = '/tmp/harnesys-test/org-1/threads/thread-1/sandbox';

describe('workspace envelope roundtrip', () => {
  test('worktree anchor keeps the same cwd on old nodes when no subpath is set', () => {
    const environment: RunEnvironment = {
      anchor: { kind: 'source', sourceId: SOURCE_ID, worktreeId: 'wt-1' },
      cwd: 'anchor',
      provenance: 'run',
    };
    const modern = primaryCwd({ environment });
    expect(modern).toBe('/tmp/harnesys-test/org-1/sources/src-1.worktrees/wt-1');
    expect(primaryCwd({ ...legacyWorkspaceFieldsOf(environment) })).toBe(modern);
  });

  test('worktree subpath applies on the environment path and degrades on legacy fields', () => {
    const environment: RunEnvironment = {
      anchor: { kind: 'source', sourceId: SOURCE_ID, worktreeId: 'wt-1' },
      subpath: 'packages/app',
      cwd: 'anchor',
      provenance: 'run',
    };
    expect(primaryCwd({ environment })).toBe(
      '/tmp/harnesys-test/org-1/sources/src-1.worktrees/wt-1/packages/app',
    );
    expect(primaryCwd({ ...legacyWorkspaceFieldsOf(environment) })).toBe(
      '/tmp/harnesys-test/org-1/sources/src-1.worktrees/wt-1',
    );
  });

  test('folder anchor materializes at the folder path for old and new nodes', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hn-envelope-'));
    const environment: RunEnvironment = {
      anchor: { kind: 'folder', hostId: 'node-a', path: folder },
      cwd: 'anchor',
      provenance: 'thread',
    };
    expect(primaryCwd({ environment })).toBe(folder);
    expect(primaryCwd({ ...legacyWorkspaceFieldsOf(environment) })).toBe(folder);
  });

  test('source anchor keeps its subpath only on the environment path', () => {
    const environment: RunEnvironment = {
      anchor: { kind: 'source', sourceId: SOURCE_ID },
      subpath: 'apps/web',
      cwd: 'anchor',
      provenance: 'agent',
    };
    expect(primaryCwd({ environment })).toBe('/tmp/harnesys-test/org-1/sources/src-1/apps/web');
    expect(primaryCwd({ ...legacyWorkspaceFieldsOf(environment) })).toBe(SANDBOX);
  });

  test('sandbox anchor materializes in the thread sandbox for either envelope shape', () => {
    const environment: RunEnvironment = {
      anchor: null,
      cwd: 'sandbox',
      provenance: 'fallback',
    };
    expect(primaryCwd({ environment })).toBe(SANDBOX);
    expect(primaryCwd({ ...legacyWorkspaceFieldsOf(environment) })).toBe(SANDBOX);
  });

  test('missing folder path fails with an actionable message', () => {
    const environment: RunEnvironment = {
      anchor: { kind: 'folder', path: '/tmp/hn-envelope-missing-folder' },
      cwd: 'anchor',
      provenance: 'thread',
    };
    expect(() => primaryCwd({ environment })).toThrow(
      'run directory not found on host: /tmp/hn-envelope-missing-folder',
    );
  });
});
