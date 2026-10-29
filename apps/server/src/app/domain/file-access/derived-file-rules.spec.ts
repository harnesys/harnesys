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
