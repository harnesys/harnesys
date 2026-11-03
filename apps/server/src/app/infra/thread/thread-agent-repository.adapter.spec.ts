import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { SessionEvent } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { openOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { agentsTable } from '../org-sqlite/schema/agents.ts';
import { SqliteRunLifecycleStore } from '../runtime/sqlite-run-lifecycle.adapter.ts';
import { ThreadAgentRepositoryAdapter } from './thread-agent-repository.adapter.ts';
import { ThreadRepositoryAdapter } from './thread-repository.adapter.ts';

const ORG_ID = 'org-1';
const AGENT_A = '11111111-1111-4111-8111-111111111111';
const AGENT_B = '22222222-2222-4222-8222-222222222222';

function createLayout(home: string): HostFsLayoutPort {
  return {
    orgDbPath: (orgId: string) => join(home, 'orgs', orgId, 'org.db'),
    ensureOrgDir: (orgId: string) => {
      mkdirSync(join(home, 'orgs', orgId), { recursive: true });
    },
  } as HostFsLayoutPort;
}

function threadOf(id: string): ThreadRecord {
  const now = new Date().toISOString();
  return {
    id,
    orgId: ORG_ID,
    title: id,
    kind: 'chat',
    autoReplyAgentId: null,
    policy: { version: 1 },
    lastThreadSeq: 0,
    conversationCount: 0,
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
  };
}

describe('thread agent membership and run agent snapshot', () => {
  let home: string;
  let layout: HostFsLayoutPort;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-thread-agents-'));
    layout = createLayout(home);
    layout.ensureOrgDir(ORG_ID);
    const sqlite = new Database(join(home, 'orgs', ORG_ID, 'org.db'), { create: true });
    try {
      ensureOrgSchema(
        (sql) => {
          sqlite.exec(sql);
        },
        (sql) => sqlite.query(sql).all() as { name: string }[],
      );
      const now = new Date().toISOString();
      drizzle(sqlite)
        .insert(agentsTable)
        .values([
          {
            id: AGENT_A,
            orgId: ORG_ID,
            name: 'alpha',
            role: 'coder',
            instructions: '',
            model: 'model-a',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: AGENT_B,
            orgId: ORG_ID,
            name: 'beta',
            role: 'coder',
            instructions: '',
            model: 'model-b',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run();
    } finally {
      sqlite.close();
    }
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function threadRepo(): ThreadRepositoryAdapter {
    return new ThreadRepositoryAdapter(layout);
  }

  function agentRepo(): ThreadAgentRepositoryAdapter {
    return new ThreadAgentRepositoryAdapter(layout);
  }

  test('ensure is idempotent and readers report membership by thread and agent', () => {
    threadRepo().insert(threadOf('thread-1'));
    threadRepo().insert(threadOf('thread-2'));
    const agents = agentRepo();

    agents.ensure(ORG_ID, 'thread-1', AGENT_A);
    agents.ensure(ORG_ID, 'thread-1', AGENT_A);
    agents.ensure(ORG_ID, 'thread-2', AGENT_B);

    expect(agents.listByThread(ORG_ID, 'thread-1').map((row) => row.agentId)).toEqual([AGENT_A]);
    expect(
      agents
        .listByThreads(ORG_ID, ['thread-1', 'thread-2'])
        .map((row) => `${row.threadId}:${row.agentId}`)
        .sort(),
    ).toEqual([`thread-1:${AGENT_A}`, `thread-2:${AGENT_B}`]);
    expect(agents.listThreadIdsByAgent(ORG_ID, AGENT_A)).toEqual(['thread-1']);
  });

  test('remove drops one membership and deleting a thread cascades the rest', () => {
    threadRepo().insert(threadOf('thread-1'));
    const agents = agentRepo();
    agents.ensure(ORG_ID, 'thread-1', AGENT_A);
    agents.ensure(ORG_ID, 'thread-1', AGENT_B);

    agents.remove(ORG_ID, 'thread-1', AGENT_B);
    expect(agents.listByThread(ORG_ID, 'thread-1').map((row) => row.agentId)).toEqual([AGENT_A]);

    threadRepo().delete(ORG_ID, 'thread-1');
    expect(agents.listByThread(ORG_ID, 'thread-1')).toEqual([]);
  });

  test('deleteByAgent deletes only threads where the agent is a member', () => {
    threadRepo().insert(threadOf('thread-1'));
    threadRepo().insert(threadOf('thread-2'));
    const agents = agentRepo();
    agents.ensure(ORG_ID, 'thread-1', AGENT_A);
    agents.ensure(ORG_ID, 'thread-2', AGENT_B);

    threadRepo().deleteByAgent(ORG_ID, AGENT_A);

    expect(threadRepo().findById(ORG_ID, 'thread-1')).toBeUndefined();
    expect(agents.listByThread(ORG_ID, 'thread-1')).toEqual([]);
    expect(threadRepo().findById(ORG_ID, 'thread-2')?.id).toBe('thread-2');
  });

  test('a created run stores the agent reference and its name snapshot', async () => {
    threadRepo().insert(threadOf('thread-1'));
    const session = openOrgSqlite(layout, ORG_ID);
    try {
      const lifecycle = new SqliteRunLifecycleStore(
        session.db,
        (_tx, _runId, _threadId, _events): SessionEvent[] => [],
      );
      await lifecycle.create({
        runId: 'run-1',
        threadId: 'thread-1',
        agentId: AGENT_A,
        agentName: 'alpha',
      });
      const record = await lifecycle.get('run-1');
      expect(record?.agentId).toBe(AGENT_A);
      expect(record?.agentName).toBe('alpha');
    } finally {
      session.close();
    }
  });
});
