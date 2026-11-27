import { describe, expect, test } from 'bun:test';
import { resolveFileAccess } from 'harnesys';
import { derivedFileRules } from './derived-file-rules.ts';

const WORKSPACE_ROOT = '/data/orgs/org-1/workspace';
const HOST_ID = 'host-1';
const AGENT_ID = 'agent-1';

describe('derivedFileRules', () => {
  test('managed workspace becomes a single edit allow over its root', () => {
    const rules = derivedFileRules({
      workspaceRoot: WORKSPACE_ROOT,
      sharedSources: [],
      threadDir: null,
      agentId: AGENT_ID,
      hostId: HOST_ID,
    });
    expect(rules).toEqual([
      {
        agentId: AGENT_ID,
        hostId: HOST_ID,
        pathPattern: `${WORKSPACE_ROOT}/**`,
        action: 'edit',
        effect: 'allow',
      },
    ]);
  });

  test('each shared source allows at its level', () => {
    const rules = derivedFileRules({
      workspaceRoot: WORKSPACE_ROOT,
      sharedSources: [
        { sourceId: 'src-read', root: '/data/sources/read-only', level: 'read' },
        { sourceId: 'src-edit', root: '/data/sources/editable', level: 'edit' },
      ],
      threadDir: null,
      agentId: AGENT_ID,
      hostId: HOST_ID,
    });
    expect(rules).toEqual([
      {
        agentId: AGENT_ID,
        hostId: HOST_ID,
        pathPattern: `${WORKSPACE_ROOT}/**`,
        action: 'edit',
        effect: 'allow',
      },
      {
        agentId: AGENT_ID,
        hostId: HOST_ID,
        pathPattern: '/data/sources/read-only/**',
        action: 'read',
        effect: 'allow',
      },
      {
        agentId: AGENT_ID,
        hostId: HOST_ID,
        pathPattern: '/data/sources/editable/**',
        action: 'edit',
        effect: 'allow',
      },
    ]);
  });

  test('no workspace and no shared sources yields no rules', () => {
    const rules = derivedFileRules({
      workspaceRoot: null,
      sharedSources: [],
      threadDir: null,
      agentId: AGENT_ID,
      hostId: HOST_ID,
    });
    expect(rules).toEqual([]);
  });

  test('spilled tool outputs in the thread dir are readable but not editable', () => {
    const rules = derivedFileRules({
      workspaceRoot: null,
      sharedSources: [],
      threadDir: '/data/threads/t1',
      agentId: AGENT_ID,
      hostId: HOST_ID,
    });
    const target = '/data/threads/t1/tool-outputs/spawn-s1.json';
    const base = {
      canonicalPath: target,
      primaryDirectory: '/primary/sandbox',
      hostId: HOST_ID,
      agentId: AGENT_ID,
      rules,
    };
    expect(resolveFileAccess({ ...base, action: 'read' })).toEqual({ decision: 'allow' });
    expect(resolveFileAccess({ ...base, action: 'edit' })).toEqual({
      decision: 'deny',
      reason: 'denied by file rule /data/threads/t1/tool-outputs/**',
    });
  });

  test('read-only thread zones stay denied when the thread dir is the run root', () => {
    const threadDir = '/data/threads/t1';
    const rules = derivedFileRules({
      workspaceRoot: null,
      sharedSources: [],
      threadDir,
      agentId: AGENT_ID,
      hostId: HOST_ID,
    });
    const base = {
      primaryDirectory: threadDir,
      hostId: HOST_ID,
      agentId: AGENT_ID,
      rules,
    };
    const attachment = `${threadDir}/attachments/a-1/x.png`;
    expect(resolveFileAccess({ ...base, canonicalPath: attachment, action: 'read' })).toEqual({
      decision: 'allow',
    });
    expect(resolveFileAccess({ ...base, canonicalPath: attachment, action: 'edit' })).toEqual({
      decision: 'deny',
      reason: `denied by file rule ${threadDir}/attachments/**`,
    });
    const spill = `${threadDir}/tool-outputs/spawn-s1.json`;
    expect(resolveFileAccess({ ...base, canonicalPath: spill, action: 'edit' })).toEqual({
      decision: 'deny',
      reason: `denied by file rule ${threadDir}/tool-outputs/**`,
    });
    const diagnostics: Array<{ target: string }> = [
      { target: `${threadDir}/.runtime/raw-model-requests/run-1.json` },
      { target: `${threadDir}/.runtime/compactions/2026-11-27.md` },
    ];
    for (const zone of diagnostics) {
      expect(resolveFileAccess({ ...base, canonicalPath: zone.target, action: 'read' })).toEqual({
        decision: 'deny',
        reason: `denied by file rule ${threadDir}/.runtime/**`,
      });
      expect(resolveFileAccess({ ...base, canonicalPath: zone.target, action: 'edit' })).toEqual({
        decision: 'deny',
        reason: `denied by file rule ${threadDir}/.runtime/**`,
      });
    }
    const rootFile = `${threadDir}/root-check.md`;
    expect(resolveFileAccess({ ...base, canonicalPath: rootFile, action: 'edit' })).toEqual({
      decision: 'allow',
    });
    const legacyScratchFolder = `${threadDir}/sandbox/notes.md`;
    expect(
      resolveFileAccess({ ...base, canonicalPath: legacyScratchFolder, action: 'edit' }),
    ).toEqual({
      decision: 'allow',
    });
  });

  test('declared deny inside the workspace wins over the derived allow', () => {
    const derived = derivedFileRules({
      workspaceRoot: WORKSPACE_ROOT,
      sharedSources: [],
      threadDir: null,
      agentId: AGENT_ID,
      hostId: HOST_ID,
    });
    const denied = `${WORKSPACE_ROOT}/private`;
    const policy = resolveFileAccess({
      canonicalPath: `${denied}/secret.txt`,
      action: 'edit',
      primaryDirectory: '/primary/sandbox',
      hostId: HOST_ID,
      agentId: AGENT_ID,
      rules: [
        ...derived,
        {
          agentId: AGENT_ID,
          hostId: HOST_ID,
          pathPattern: `${denied}/**`,
          action: 'edit',
          effect: 'deny',
        },
      ],
    });
    expect(policy).toEqual({
      decision: 'deny',
      reason: `denied by file rule ${denied}/**`,
    });
  });
});
