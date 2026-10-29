import { describe, expect, test } from 'bun:test';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { FileRuleRecord } from '../../domain/file-access/file-access-rule.ts';
import { runTargetFileAccess } from './org-runtime-file-access.ts';
import { StubSourceLocation, StubSources } from './prepare-org-target.fakes.ts';

function record(overrides: Partial<FileRuleRecord>): FileRuleRecord {
  return {
    id: crypto.randomUUID(),
    orgId: 'org-1',
    agentId: null,
    hostId: null,
    pathPattern: '/data/**',
    action: 'read',
    effect: 'allow',
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
    ...overrides,
  };
}

class FakeRules extends FileAccessRulePort {
  readonly calls: { orgId: string; agentId: string }[] = [];

  constructor(private readonly records: FileRuleRecord[]) {
    super();
  }

  list(): [] {
    return [];
  }

  listForAgent(orgId: string, agentId: string): FileRuleRecord[] {
    this.calls.push({ orgId, agentId });
    return this.records;
  }

  insert(): never {
    throw new Error('not used');
  }

  remove(): void {
    throw new Error('not used');
  }
}

describe('runTargetFileAccess', () => {
  test('merges rules, filters hosts, auto-allows primary, snapshots at prepare', () => {
    const records: FileRuleRecord[] = [
      record({ pathPattern: '/data/shared/**' }),
      record({ agentId: 'agent-1', pathPattern: '/data/secret/**', effect: 'deny' }),
      record({ hostId: 'host-2', pathPattern: '/mnt/**' }),
    ];
    const rules = new FakeRules(records);
    const policy = runTargetFileAccess(
      {
        orgId: 'org-1',
        fileRules: rules,
        sources: new StubSources(),
        sourceLocation: new StubSourceLocation('/data/sources/s1'),
      },
      {
        agent: { id: 'agent-1', sharedSourceIds: [], sourceLevels: {} },
        paths: { threadDir: '/data/threads/t1' },
        runtime: { hostId: 'host-1', primaryDirectory: '/primary' },
      },
    );

    expect(rules.calls).toEqual([{ orgId: 'org-1', agentId: 'agent-1' }]);
    expect(policy({ path: '/primary/sub/file.txt', action: 'read' })).toEqual({
      decision: 'allow',
    });
    expect(policy({ path: '/data/shared/file.txt', action: 'read' })).toEqual({
      decision: 'allow',
    });
    expect(policy({ path: '/data/secret/x.txt', action: 'read' }).decision).toBe('deny');
    expect(policy({ path: '/mnt/file.txt', action: 'read' })).toEqual({
      decision: 'ask',
      subject: { file: { path: '/mnt/file.txt', action: 'read' } },
    });

    records.push(record({ pathPattern: '/newly/**' }));
    expect(policy({ path: '/newly/added.txt', action: 'read' })).toEqual({
      decision: 'ask',
      subject: { file: { path: '/newly/added.txt', action: 'read' } },
    });
  });

  test('outside-roots read asks, read-level source allows reads, outside-roots edit denies', () => {
    const policy = runTargetFileAccess(
      {
        orgId: 'org-1',
        fileRules: new FakeRules([]),
        sources: new StubSources(),
        sourceLocation: new StubSourceLocation('/data/sources/s1'),
      },
      {
        agent: {
          id: 'agent-1',
          sharedSourceIds: ['src-1'],
          sourceLevels: { 'src-1': 'read' },
        },
        paths: { threadDir: '/data/threads/t1' },
        runtime: { hostId: 'host-1', primaryDirectory: '/primary' },
      },
    );

    expect(policy({ path: '/data/sources/s1/file.txt', action: 'read' })).toEqual({
      decision: 'allow',
    });
    expect(policy({ path: '/Users/mike/Desktop/report.md', action: 'read' })).toEqual({
      decision: 'ask',
      subject: { file: { path: '/Users/mike/Desktop/report.md', action: 'read' } },
    });
    expect(policy({ path: '/Users/mike/Desktop/report.md', action: 'edit' })).toEqual({
      decision: 'deny',
      reason: 'path is outside allowed roots',
    });
  });
});
