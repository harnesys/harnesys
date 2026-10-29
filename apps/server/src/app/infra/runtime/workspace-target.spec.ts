import { describe, expect, test } from 'bun:test';
import type { FileRuleRecord } from '../../domain/file-access/file-access-rule.ts';
import { declaredRuleDirsOf, workspaceTargetOf } from './workspace-target.ts';

const ORG_DATA = '/org/data';
const HOST = 'host-1';

function rule(partial: Partial<FileRuleRecord>): FileRuleRecord {
  return {
    id: 'rule-1',
    orgId: 'org-1',
    agentId: 'agent-1',
    hostId: null,
    pathPattern: '/shared/declared',
    action: 'read',
    effect: 'allow',
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
    ...partial,
  };
}

describe('declaredRuleDirsOf', () => {
  test('keeps exact allow dirs for this host, drops patterns, other hosts and org data', () => {
    const dirs = declaredRuleDirsOf(
      [
        rule({ pathPattern: '/shared/declared' }),
        rule({ pathPattern: '/shared/pattern-*' }),
        rule({ pathPattern: '/other/host-dir', hostId: 'host-2' }),
        rule({ pathPattern: `${ORG_DATA}/inner` }),
        rule({ pathPattern: ORG_DATA }),
        rule({ pathPattern: '/shared/denied', effect: 'deny' }),
      ],
      ORG_DATA,
      HOST,
    );
    expect(dirs).toEqual(['/shared/declared']);
  });
});

describe('workspaceTargetOf', () => {
  test('without container isolation returns undefined', () => {
    const target = workspaceTargetOf({
      hostId: HOST,
      orgDataDir: ORG_DATA,
      threadDirs: ['/org/thread'],
      declaredRuleDirs: [],
    });
    expect(target).toBeUndefined();
  });

  test('container mounts orgDataDir, external primary and declared dirs, skipping orgDataDir internals', () => {
    const target = workspaceTargetOf({
      isolation: { mode: 'container', image: 'img' },
      worktreeId: 'wt-1',
      hostId: HOST,
      orgDataDir: ORG_DATA,
      primaryDir: '/worktrees/repo-feat-x',
      threadDirs: [`${ORG_DATA}/thread`, '/org/attachments-outside'],
      declaredRuleDirs: ['/shared/declared', `${ORG_DATA}/nested-rule`],
    });
    expect(target?.workspaceKey).toBe('worktree:wt-1');
    expect(target?.mounts).toEqual([
      ORG_DATA,
      '/worktrees/repo-feat-x',
      '/org/attachments-outside',
      '/shared/declared',
    ]);
  });
});
