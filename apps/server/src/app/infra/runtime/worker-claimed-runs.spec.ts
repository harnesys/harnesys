import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SessionEvent } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { openOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { eventClaimsTable, runsTable, threadsTable } from '../org-sqlite/schema/index.ts';
import { recoverOrphanedRuns } from './recover-orphaned-runs.ts';
import { SqliteRunLifecycleStore } from './sqlite-run-lifecycle.adapter.ts';

const ORG_ID = 'org-1';
const STALE_ISO = '2026-01-01T00:00:00.000Z';

function createLayout(home: string): HostFsLayoutPort {
  return {
    orgDbPath: (orgId: string) => join(home, 'orgs', orgId, 'org.db'),
    ensureOrgDir: (orgId: string) => {
      mkdirSync(join(home, 'orgs', orgId), { recursive: true });
    },
  } as HostFsLayoutPort;
}

describe('worker claimed runs', () => {
  let home: string;
  let layout: HostFsLayoutPort;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-worker-claims-'));
    layout = createLayout(home);
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function seed() {
    const session = openOrgSqlite(layout, ORG_ID);
    session.db
      .insert(threadsTable)
      .values({
        id: 'thread-1',
        orgId: ORG_ID,
        title: 'thread-1',
        kind: 'chat',
        createdAt: STALE_ISO,
        updatedAt: STALE_ISO,
        lastReadAt: STALE_ISO,
      })
      .run();
    session.db
      .insert(runsTable)
      .values({
        runId: 'run-1',
        threadId: 'thread-1',
        agentName: 'agent',
        status: 'running',
        attempt: 1,
        leaseEpoch: 1,
        lastSeq: 0,
        createdAt: STALE_ISO,
        updatedAt: STALE_ISO,
      })
      .run();
    const lifecycle = new SqliteRunLifecycleStore(
      session.db,
      (_tx, _runId, _threadId, _events): SessionEvent[] => [],
    );
    return { session, lifecycle };
  }

  function claim(doneAt: string | null): void {
    const session = openOrgSqlite(layout, ORG_ID);
    session.db
      .insert(eventClaimsTable)
      .values({
        runId: 'run-1',
        nodeId: 'node-1',
        leaseEpoch: 1,
        leaseUntil: '2026-11-23T23:59:59.000Z',
        token: 'token',
        doneAt,
      })
      .run();
    session.close();
  }

  test('stale sweep skips a run owned by a live worker claim', async () => {
    const { session, lifecycle } = seed();
    try {
      claim(null);
      expect(await lifecycle.listStaleRunning()).toEqual([]);
    } finally {
      session.close();
    }
  });

  test('stale sweep includes a run whose worker claim is done', async () => {
    const { session, lifecycle } = seed();
    try {
      claim('2026-01-01T00:00:00.000Z');
      const stale = await lifecycle.listStaleRunning();
      expect(stale.map((record) => record.runId)).toEqual(['run-1']);
    } finally {
      session.close();
    }
  });

  test('restart recovery leaves a worker claimed run alone', async () => {
    const { session, lifecycle } = seed();
    try {
      claim(null);
      const resumed = await recoverOrphanedRuns({ db: session.db, lifecycle });
      expect(resumed).toBe(0);
      expect((await lifecycle.get('run-1'))?.status).toBe('running');
    } finally {
      session.close();
    }
  });
});
