import { Database } from 'bun:sqlite';
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddonBindingStore } from './addon-binding.store.ts';
import { AddonJobStateStore } from './addon-job-state.store.ts';
import { AddonTriggerInstanceStore, instanceKey } from './addon-trigger-instance.store.ts';
import { OrgAddonStore } from './org-addon.store.ts';
import { ensureAddonsPlatformSchema } from './org-sql-addons-platform.ts';

const home = mkdtempSync(join(tmpdir(), 'addons-platform-'));
afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

function openDb(): Database {
  const sqlite = new Database(':memory:');
  ensureAddonsPlatformSchema((sql) => sqlite.exec(sql));
  return sqlite;
}

function orgAddonRow(overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'org-1',
    addonId: 'harnesys.test-addon',
    version: '1.0.0',
    enabled: false,
    grantsJson: '[]',
    grantsDigest: 'abc',
    configJson: '{}',
    health: 'stopped' as const,
    lastError: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('OrgAddonStore', () => {
  test('upsert and find round-trip with grants and config', () => {
    const db = openDb();
    try {
      const store = new OrgAddonStore(db);
      store.upsert(orgAddonRow({ grantsJson: '[{"id":"db"}]' }));
      const found = store.find('org-1', 'harnesys.test-addon');
      expect(found?.version).toBe('1.0.0');
      expect(found?.grantsJson).toBe('[{"id":"db"}]');
      expect(found?.enabled).toBe(false);
      expect(found?.health).toBe('stopped');
    } finally {
      db.close();
    }
  });

  test('setEnabled, grants, config, health and remove update single row', () => {
    const db = openDb();
    try {
      const store = new OrgAddonStore(db);
      store.upsert(orgAddonRow());
      store.setEnabled('org-1', 'harnesys.test-addon', true);
      store.updateGrants('org-1', 'harnesys.test-addon', '[{"id":"log"}]', 'digest-2');
      store.updateConfig('org-1', 'harnesys.test-addon', '{"a":1}');
      store.updateHealth('org-1', 'harnesys.test-addon', 'failed', 'timeout');
      const row = store.find('org-1', 'harnesys.test-addon');
      expect(row?.enabled).toBe(true);
      expect(row?.grantsDigest).toBe('digest-2');
      expect(row?.configJson).toBe('{"a":1}');
      expect(row?.health).toBe('failed');
      expect(row?.lastError).toBe('timeout');
      store.remove('org-1', 'harnesys.test-addon');
      expect(store.find('org-1', 'harnesys.test-addon')).toBeNull();
    } finally {
      db.close();
    }
  });

  test('rejects health outside the CHECK constraint', () => {
    const db = openDb();
    try {
      expect(() => new OrgAddonStore(db).upsert(orgAddonRow({ health: 'deleted' }))).toThrow();
    } finally {
      db.close();
    }
  });
});

describe('AddonBindingStore', () => {
  test('add, accountsFor, byAccount and setBindings reconcile', () => {
    const db = openDb();
    try {
      const store = new AddonBindingStore(db);
      store.add({
        orgId: 'org-1',
        addonId: 'a',
        connectionId: 'cal',
        accountId: 'acc-1',
        createdAt: '2026-11-10T00:00:00.000Z',
      });
      store.add({
        orgId: 'org-1',
        addonId: 'a',
        connectionId: 'cal',
        accountId: 'acc-2',
        createdAt: '2026-11-10T00:00:00.000Z',
      });
      store.add({
        orgId: 'org-1',
        addonId: 'a',
        connectionId: 'mail',
        accountId: 'acc-1',
        createdAt: '2026-11-10T00:00:00.000Z',
      });
      expect(store.accountsFor('org-1', 'a', 'cal').length).toBe(2);
      expect(store.byAccount('org-1', 'acc-1').length).toBe(2);
      store.setBindings('org-1', 'a', 'cal', ['acc-2']);
      expect(store.accountsFor('org-1', 'a', 'cal').map((row) => row.accountId)).toEqual(['acc-2']);
      expect(store.byAccount('org-1', 'acc-1').length).toBe(1);
      store.removeAddon('org-1', 'a');
      expect(store.list('org-1').length).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('AddonTriggerInstanceStore', () => {
  test('create scopes instance id by org, update and removeAddon work', () => {
    const db = openDb();
    try {
      const store = new AddonTriggerInstanceStore(db);
      const created = store.create({
        id: 'inst-1',
        orgId: 'org-1',
        addonId: 'a',
        triggerId: 'trg',
        label: 'L',
        configJson: '{}',
        instructions: '',
        targetJson: '{}',
        enabled: true,
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      });
      expect(created.id).toBe(instanceKey('org-1', 'inst-1'));
      expect(store.find('org-1', created.id)?.label).toBe('L');
      store.update('org-1', created.id, { label: 'L2', enabled: false });
      const updated = store.find('org-1', created.id);
      expect(updated?.label).toBe('L2');
      expect(updated?.enabled).toBe(false);
      expect(updated?.createdAt).toBe('2026-11-10T00:00:00.000Z');
      store.removeAddon('org-1', 'a');
      expect(store.list('org-1').length).toBe(0);
    } finally {
      db.close();
    }
  });

  test('recordFire deduplicates on (instance, runKey) and cleanupFires removes by TTL', () => {
    const db = openDb();
    try {
      const store = new AddonTriggerInstanceStore(db);
      expect(store.recordFire('org-1/inst-1', 'run-1', 1000)).toBe(true);
      expect(store.recordFire('org-1/inst-1', 'run-1', 2000)).toBe(false);
      expect(store.recordFire('org-1/inst-1', 'run-2', 2000)).toBe(true);
      store.cleanupFires(1500);
      expect(store.listFires('org-1/inst-1').map((fire) => fire.runKey)).toEqual(['run-2']);
    } finally {
      db.close();
    }
  });
});

describe('AddonJobStateStore', () => {
  test('upsert, recordRun and setEnabled round-trip epoch-ms integers', () => {
    const db = openDb();
    try {
      const store = new AddonJobStateStore(db);
      store.upsert({
        orgId: 'org-1',
        addonId: 'a',
        jobId: 'job-1',
        nextRunAt: 5000,
        lastRunAt: null,
        lastStatus: null,
        enabled: true,
      });
      store.recordRun('org-1', 'a', 'job-1', 9000, 'ok');
      const row = store.find('org-1', 'a', 'job-1');
      expect(row?.nextRunAt).toBeNull();
      expect(row?.lastRunAt).toBe(9000);
      expect(row?.lastStatus).toBe('ok');
      store.setEnabled('org-1', 'a', 'job-1', false);
      expect(store.find('org-1', 'a', 'job-1')?.enabled).toBe(false);
      store.removeAddon('org-1', 'a');
      expect(store.list('org-1').length).toBe(0);
    } finally {
      db.close();
    }
  });
});
